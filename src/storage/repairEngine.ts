/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * Integrity Diagnostic & Safe Repair Engine (Rules 6 & 31)
 * 
 * STRICT MANDATE:
 * - Detects discrepancies, duplicates, unconfirmed transactions, and boundary violations.
 * - DOES NOT automatically rebuild or overwrite currentStock!
 * - Unconfirmed online data is tagged as 'unconfirmed' and quarantined without mutating stock.
 */

import {
  DatabaseSchema,
  IntegrityReport,
  StockCategory,
  STOCK_CATEGORIES,
  CATEGORY_LABELS
} from '../types';
import { runFullIntegrityCheck } from '../services/stockService';
import { saveDatabase, generateStableId } from './db';
import { enqueueTransaction } from './syncManager';

export interface SuspectedRecord {
  id: string;
  type: 'supply' | 'dispense';
  date: string;
  category: StockCategory;
  categoryLabel: string;
  quantity: number;
  title: string;
  suspicionReason: string;
}

export interface DiagnosticResult {
  report: IntegrityReport;
  canSafelyPurgeDuplicates: boolean;
  suspectedRecords: SuspectedRecord[];
  unconfirmedCount: number;
}

/**
 * Identifies suspected demo records for explicit manual review (Rule 27)
 */
export function getSuspectedDemoRecords(db: DatabaseSchema): SuspectedRecord[] {
  const isDemo = (str: string = '') => {
    const s = str.toLowerCase();
    return s.includes('demo') || s.includes('seed') || s.includes('mock') || s.includes('تجريب') || s.includes('عينة');
  };

  const results: SuspectedRecord[] = [];

  for (const s of (db.supplies || [])) {
    if (s.isDeleted) continue;
    if (isDemo(s.id) || isDemo(s.documentNumber) || isDemo(s.notes) || isDemo(s.supplierSource)) {
      results.push({
        id: s.id,
        type: 'supply',
        date: s.date,
        category: s.category,
        categoryLabel: CATEGORY_LABELS[s.category] || s.category,
        quantity: s.quantity,
        title: `توريد رقم: ${s.documentNumber || s.id} (${s.supplierSource || 'مورد'})`,
        suspicionReason: isDemo(s.documentNumber) ? 'رقم المستند يحتوي كلمات تجريبية' : 'الملاحظات أو المصدر يحتوي وسماً تجريبياً'
      });
    }
  }

  for (const d of (db.dispenses || [])) {
    if (d.isDeleted) continue;
    if (isDemo(d.id) || isDemo(d.citizenName) || isDemo(d.notes)) {
      results.push({
        id: d.id,
        type: 'dispense',
        date: d.date,
        category: d.category,
        categoryLabel: CATEGORY_LABELS[d.category] || d.category,
        quantity: d.quantity,
        title: `صرف لمواطن: ${d.citizenName || d.id}`,
        suspicionReason: isDemo(d.citizenName) ? 'اسم المواطن يحتوي كلمات تجريبية' : 'الملاحظات تحتوي وسماً تجريبياً'
      });
    }
  }

  return results;
}

/**
 * Runs full diagnostics without touching any records or stocks
 */
export function diagnoseDatabase(db: DatabaseSchema): DiagnosticResult {
  const report = runFullIntegrityCheck(db);

  const duplicateIssues = report.issues.filter(i => i.code === 'DUPLICATE_TRANSACTION');
  const suspectedRecords = getSuspectedDemoRecords(db);
  const unconfirmedCount = [
    ...(db.supplies || []).filter(s => s.syncStatus === 'unconfirmed'),
    ...(db.dispenses || []).filter(d => d.syncStatus === 'unconfirmed')
  ].length;

  return {
    report,
    canSafelyPurgeDuplicates: duplicateIssues.length > 0,
    suspectedRecords,
    unconfirmedCount
  };
}

/**
 * Safely removes detected duplicate transactions by keeping only the earliest verified instance.
 * STRICT: Does NOT arbitrarily change currentStock!
 */
export function safelyPurgeDuplicateTransactions(db: DatabaseSchema, operatorName: string = 'مدير النظام'): {
  removedSupplies: number;
  removedDispenses: number;
} {
  const seenTx = new Set<string>();
  let removedSupplies = 0;
  let removedDispenses = 0;

  const filteredSupplies = [];
  for (const s of db.supplies || []) {
    if (s.transactionId && seenTx.has(s.transactionId)) {
      removedSupplies++;
    } else {
      if (s.transactionId) seenTx.add(s.transactionId);
      filteredSupplies.push(s);
    }
  }

  const filteredDispenses = [];
  for (const d of db.dispenses || []) {
    if (d.transactionId && seenTx.has(d.transactionId)) {
      removedDispenses++;
    } else {
      if (d.transactionId) seenTx.add(d.transactionId);
      filteredDispenses.push(d);
    }
  }

  db.supplies = filteredSupplies;
  db.dispenses = filteredDispenses;

  db.auditLogs.unshift({
    id: `audit-${Date.now()}`,
    timestamp: new Date().toISOString(),
    action: 'تنظيف المعاملات المكررة بأمان',
    details: `تم إزالة ${removedSupplies} توريد مكرر و ${removedDispenses} صرف مكرر مع الحفاظ على الأرصدة التشغيلية الحالية`,
    performedBy: operatorName
  });

  saveDatabase(db);
  return { removedSupplies, removedDispenses };
}

/**
 * Explicit Manual Purge for a single suspected record (Rule 27)
 * Requires operator decision whether to reverse its stock impact or not.
 * Generates Tombstone and enqueues sync delete.
 */
export function purgeSingleSuspectedRecord(
  db: DatabaseSchema,
  recordId: string,
  recordType: 'supply' | 'dispense',
  adjustStock: boolean,
  operatorName: string = 'مدير النظام'
): { success: boolean; message: string } {
  const now = new Date().toISOString();
  const txId = generateStableId('tx-del');

  if (recordType === 'supply') {
    const idx = db.supplies.findIndex(s => s.id === recordId);
    if (idx === -1) return { success: false, message: 'السجل غير موجود أو تم حذفه مسبقاً' };
    const sup = db.supplies[idx];

    if (adjustStock) {
      const stock = db.stocks[sup.category];
      if (stock) {
        stock.currentStock -= sup.quantity;
        stock.totalReceived -= sup.quantity;
      }
    }

    db.supplies.splice(idx, 1);
    db.tombstones.push({
      recordId,
      recordType: 'supply',
      transactionId: txId,
      deletedAt: now,
      version: (sup.version || 1) + 1
    });

    db.auditLogs.unshift({
      id: generateStableId('audit'),
      timestamp: now,
      action: 'حذف يدوي صريح لسجل توريد مشبوه',
      category: sup.category,
      details: `حذف التوريد رقم (${sup.documentNumber}) - ${adjustStock ? `تم خصم الكمية (${sup.quantity}) من الرصيد الفعلي` : 'تم الإبقاء على الرصيد الفعلي بدون تعديل'}`,
      performedBy: operatorName
    });

    enqueueTransaction('SUPPLY_DELETE', recordId, (sup.version || 1) + 1, { id: recordId }, txId);
  } else {
    const idx = db.dispenses.findIndex(d => d.id === recordId);
    if (idx === -1) return { success: false, message: 'السجل غير موجود أو تم حذفه مسبقاً' };
    const dsp = db.dispenses[idx];

    if (adjustStock) {
      const stock = db.stocks[dsp.category];
      if (stock) {
        stock.currentStock += dsp.quantity;
        stock.totalDispensed -= dsp.quantity;
      }
    }

    db.dispenses.splice(idx, 1);
    db.tombstones.push({
      recordId,
      recordType: 'dispense',
      transactionId: txId,
      deletedAt: now,
      version: (dsp.version || 1) + 1
    });

    db.auditLogs.unshift({
      id: generateStableId('audit'),
      timestamp: now,
      action: 'حذف يدوي صريح لسجل صرف مشبوه',
      category: dsp.category,
      details: `حذف المنصرف للمواطن (${dsp.citizenName}) - ${adjustStock ? `تمت استعادة الكمية (${dsp.quantity}) إلى الرصيد الفعلي` : 'تم الإبقاء على الرصيد الفعلي بدون تعديل'}`,
      performedBy: operatorName
    });

    enqueueTransaction('DISPENSE_DELETE', recordId, (dsp.version || 1) + 1, { id: recordId }, txId);
  }

  saveDatabase(db);
  return { success: true, message: 'تم حذف السجل بنجاح مع توثيق العملية بالكامل ومزامنتها' };
}
