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

export interface DiagnosticRecordItem {
  id: string;
  transactionId?: string;
  type: 'supply' | 'dispense' | 'late_registration';
  category?: StockCategory;
  quantity?: number;
  date?: string;
  citizenOrDocument?: string;
}

export interface ProductionRepairDiagnosticReport {
  timestamp: string;
  isDiagnosticOnly: true;
  offlineOnlyRecords: DiagnosticRecordItem[];
  onlineOnlyRecords: DiagnosticRecordItem[];
  inBothRecords: DiagnosticRecordItem[];
  duplicates: { transactionId: string; count: number; type: string; recordIds: string[] }[];
  tombstones: { recordId: string; recordType: string; deletedAt: string; transactionId?: string }[];
  conflicts: { id: string; reason: string; details?: any }[];
  demoSeedCandidates: SuspectedRecord[];
  invalidTransactions: { id: string; type: string; reason: string }[];
  metadataDiscrepancies: { field: string; localValue: any; serverValue: any }[];
  stockDiscrepancies: {
    category: StockCategory;
    categoryLabel: string;
    currentStock: number;
    theoreticalStock: number;
    difference: number;
  }[];
  summary: {
    totalOfflineOnly: number;
    totalOnlineOnly: number;
    totalInBoth: number;
    totalDuplicates: number;
    totalTombstones: number;
    totalDemoCandidates: number;
    totalInvalidTransactions: number;
    hasStockDiscrepancies: boolean;
    guarantee: string;
  };
}

/**
 * Executes a strictly AUDIT / DIAGNOSTIC FIRST inspection of the database (Section 5).
 * 
 * STRICT MANDATE:
 * - DOES NOT automatically rebuild or recalculate currentStock.
 * - DOES NOT overwrite currentStock with Opening + Supply - Dispense.
 * - DOES NOT automatically merge or delete online-only or offline-only records.
 * - DOES NOT automatically delete suspected Demo / Seed records.
 * - DOES NOT create MANUAL_STOCK_ADJUSTMENT or OPENING_BALANCE_SET automatically.
 * - Returns a comprehensive diagnostic assessment without mutating data!
 */
export function executeProductionRepair(
  localDb: DatabaseSchema,
  serverDb?: DatabaseSchema
): ProductionRepairDiagnosticReport {
  const now = new Date().toISOString();

  // 1. Map local records
  const localSupplyMap = new Map((localDb.supplies || []).map(s => [s.id, s]));
  const localDispenseMap = new Map((localDb.dispenses || []).map(d => [d.id, d]));
  const serverSupplyMap = new Map((serverDb?.supplies || []).map(s => [s.id, s]));
  const serverDispenseMap = new Map((serverDb?.dispenses || []).map(d => [d.id, d]));

  const offlineOnlyRecords: DiagnosticRecordItem[] = [];
  const onlineOnlyRecords: DiagnosticRecordItem[] = [];
  const inBothRecords: DiagnosticRecordItem[] = [];

  // Supplies comparison
  for (const [id, sup] of localSupplyMap.entries()) {
    if (serverDb) {
      if (serverSupplyMap.has(id)) {
        inBothRecords.push({
          id: sup.id,
          transactionId: sup.transactionId,
          type: 'supply',
          category: sup.category,
          quantity: sup.quantity,
          date: sup.date,
          citizenOrDocument: sup.documentNumber
        });
      } else {
        offlineOnlyRecords.push({
          id: sup.id,
          transactionId: sup.transactionId,
          type: 'supply',
          category: sup.category,
          quantity: sup.quantity,
          date: sup.date,
          citizenOrDocument: sup.documentNumber
        });
      }
    } else if (sup.syncStatus === 'pending') {
      offlineOnlyRecords.push({
        id: sup.id,
        transactionId: sup.transactionId,
        type: 'supply',
        category: sup.category,
        quantity: sup.quantity,
        date: sup.date,
        citizenOrDocument: sup.documentNumber
      });
    } else {
      inBothRecords.push({
        id: sup.id,
        transactionId: sup.transactionId,
        type: 'supply',
        category: sup.category,
        quantity: sup.quantity,
        date: sup.date,
        citizenOrDocument: sup.documentNumber
      });
    }
  }

  // Dispenses comparison
  for (const [id, dsp] of localDispenseMap.entries()) {
    if (serverDb) {
      if (serverDispenseMap.has(id)) {
        inBothRecords.push({
          id: dsp.id,
          transactionId: dsp.transactionId,
          type: 'dispense',
          category: dsp.category,
          quantity: dsp.quantity,
          date: dsp.date,
          citizenOrDocument: dsp.citizenName
        });
      } else {
        offlineOnlyRecords.push({
          id: dsp.id,
          transactionId: dsp.transactionId,
          type: 'dispense',
          category: dsp.category,
          quantity: dsp.quantity,
          date: dsp.date,
          citizenOrDocument: dsp.citizenName
        });
      }
    } else if (dsp.syncStatus === 'pending') {
      offlineOnlyRecords.push({
        id: dsp.id,
        transactionId: dsp.transactionId,
        type: 'dispense',
        category: dsp.category,
        quantity: dsp.quantity,
        date: dsp.date,
        citizenOrDocument: dsp.citizenName
      });
    } else {
      inBothRecords.push({
        id: dsp.id,
        transactionId: dsp.transactionId,
        type: 'dispense',
        category: dsp.category,
        quantity: dsp.quantity,
        date: dsp.date,
        citizenOrDocument: dsp.citizenName
      });
    }
  }

  // Online only records
  if (serverDb) {
    for (const [id, sup] of serverSupplyMap.entries()) {
      if (!localSupplyMap.has(id)) {
        onlineOnlyRecords.push({
          id: sup.id,
          transactionId: sup.transactionId,
          type: 'supply',
          category: sup.category,
          quantity: sup.quantity,
          date: sup.date,
          citizenOrDocument: sup.documentNumber
        });
      }
    }
    for (const [id, dsp] of serverDispenseMap.entries()) {
      if (!localDispenseMap.has(id)) {
        onlineOnlyRecords.push({
          id: dsp.id,
          transactionId: dsp.transactionId,
          type: 'dispense',
          category: dsp.category,
          quantity: dsp.quantity,
          date: dsp.date,
          citizenOrDocument: dsp.citizenName
        });
      }
    }
  }

  // 2. Duplicates detection
  const supplyTxCounts = new Map<string, string[]>();
  for (const s of localDb.supplies || []) {
    if (s.transactionId) {
      const arr = supplyTxCounts.get(s.transactionId) || [];
      arr.push(s.id);
      supplyTxCounts.set(s.transactionId, arr);
    }
  }
  const dispenseTxCounts = new Map<string, string[]>();
  for (const d of localDb.dispenses || []) {
    if (d.transactionId) {
      const arr = dispenseTxCounts.get(d.transactionId) || [];
      arr.push(d.id);
      dispenseTxCounts.set(d.transactionId, arr);
    }
  }

  const duplicates: { transactionId: string; count: number; type: string; recordIds: string[] }[] = [];
  for (const [txId, ids] of supplyTxCounts.entries()) {
    if (ids.length > 1) {
      duplicates.push({ transactionId: txId, count: ids.length, type: 'supply', recordIds: ids });
    }
  }
  for (const [txId, ids] of dispenseTxCounts.entries()) {
    if (ids.length > 1) {
      duplicates.push({ transactionId: txId, count: ids.length, type: 'dispense', recordIds: ids });
    }
  }

  // 3. Tombstones
  const tombstones = (localDb.tombstones || []).map(t => ({
    recordId: t.recordId,
    recordType: t.recordType,
    deletedAt: t.deletedAt,
    transactionId: t.transactionId
  }));

  // 4. Conflicts
  const conflicts: { id: string; reason: string; details?: any }[] = [];
  for (const log of (localDb.auditLogs || [])) {
    if (log.action.includes('تعارض') || log.action.includes('CONFLICT') || (log.reason && log.reason.includes('conflict'))) {
      conflicts.push({
        id: log.id,
        reason: log.details || log.action,
        details: log
      });
    }
  }

  // 5. Demo / Seed candidates (classification only!)
  const demoSeedCandidates = getSuspectedDemoRecords(localDb);

  // 6. Invalid transactions
  const invalidTransactions: { id: string; type: string; reason: string }[] = [];
  for (const s of (localDb.supplies || [])) {
    if (!s.transactionId) invalidTransactions.push({ id: s.id, type: 'supply', reason: 'معرف العملية transactionId مفقود' });
    if (!s.date) invalidTransactions.push({ id: s.id, type: 'supply', reason: 'تاريخ التوريد مفقود' });
    if (typeof s.quantity !== 'number' || s.quantity <= 0) invalidTransactions.push({ id: s.id, type: 'supply', reason: `كمية توريد غير صالحة (${s.quantity})` });
  }
  for (const d of (localDb.dispenses || [])) {
    if (!d.transactionId) invalidTransactions.push({ id: d.id, type: 'dispense', reason: 'معرف العملية transactionId مفقود' });
    if (!d.date) invalidTransactions.push({ id: d.id, type: 'dispense', reason: 'تاريخ الصرف مفقود' });
    if (typeof d.quantity !== 'number' || d.quantity <= 0) invalidTransactions.push({ id: d.id, type: 'dispense', reason: `كمية صرف غير صالحة (${d.quantity})` });
  }

  // 7. Metadata discrepancies
  const metadataDiscrepancies: { field: string; localValue: any; serverValue: any }[] = [];
  if (serverDb) {
    if (localDb.resetBoundary?.resetId !== serverDb.resetBoundary?.resetId) {
      metadataDiscrepancies.push({
        field: 'resetBoundary.resetId',
        localValue: localDb.resetBoundary?.resetId,
        serverValue: serverDb.resetBoundary?.resetId
      });
    }
    if (localDb.version !== serverDb.version) {
      metadataDiscrepancies.push({
        field: 'version',
        localValue: localDb.version,
        serverValue: serverDb.version
      });
    }
  }

  // 8. Stock discrepancies (Diagnostic only - strictly does not change currentStock)
  const fullCheck = runFullIntegrityCheck(localDb);
  const stockDiscrepancies = fullCheck.categoryAudits
    .filter(ca => !ca.isBalanced)
    .map(ca => ({
      category: ca.category,
      categoryLabel: CATEGORY_LABELS[ca.category] || ca.category,
      currentStock: ca.currentStock,
      theoreticalStock: ca.theoreticalStock,
      difference: ca.difference
    }));

  return {
    timestamp: now,
    isDiagnosticOnly: true,
    offlineOnlyRecords,
    onlineOnlyRecords,
    inBothRecords,
    duplicates,
    tombstones,
    conflicts,
    demoSeedCandidates,
    invalidTransactions,
    metadataDiscrepancies,
    stockDiscrepancies,
    summary: {
      totalOfflineOnly: offlineOnlyRecords.length,
      totalOnlineOnly: onlineOnlyRecords.length,
      totalInBoth: inBothRecords.length,
      totalDuplicates: duplicates.length,
      totalTombstones: tombstones.length,
      totalDemoCandidates: demoSeedCandidates.length,
      totalInvalidTransactions: invalidTransactions.length,
      hasStockDiscrepancies: stockDiscrepancies.length > 0,
      guarantee: 'التقرير تشخيصي رقابي بالكامل ولا يغير أي رصيد فعلي أو حركة حقيقية تلقائياً'
    }
  };
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
