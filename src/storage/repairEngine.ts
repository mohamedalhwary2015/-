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
  STOCK_CATEGORIES
} from '../types';
import { runFullIntegrityCheck } from '../services/stockService';
import { saveDatabase } from './db';

export interface DiagnosticResult {
  report: IntegrityReport;
  canSafelyPurgeDuplicates: boolean;
  canSafelyPurgeDemos: boolean;
  unconfirmedCount: number;
}

/**
 * Runs full diagnostics without touching any records or stocks
 */
export function diagnoseDatabase(db: DatabaseSchema): DiagnosticResult {
  const report = runFullIntegrityCheck(db);

  const duplicateIssues = report.issues.filter(i => i.code === 'DUPLICATE_TRANSACTION');
  const demoIssues = report.issues.filter(i => i.code === 'DEMO_TRANSACTION');
  const unconfirmedCount = [
    ...(db.supplies || []).filter(s => s.syncStatus === 'unconfirmed'),
    ...(db.dispenses || []).filter(d => d.syncStatus === 'unconfirmed')
  ].length;

  return {
    report,
    canSafelyPurgeDuplicates: duplicateIssues.length > 0,
    canSafelyPurgeDemos: demoIssues.length > 0,
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
 * Safely purges demo / seed items if found, protecting real office records
 */
export function safelyPurgeDemoData(db: DatabaseSchema, operatorName: string = 'مدير النظام'): {
  purgedCount: number;
} {
  const isDemo = (str: string = '') => {
    const s = str.toLowerCase();
    return s.includes('demo') || s.includes('seed') || s.includes('mock') || s.includes('تجريب') || s.includes('عينة');
  };

  const initialSupplies = db.supplies.length;
  const initialDispenses = db.dispenses.length;

  db.supplies = db.supplies.filter(
    s => !isDemo(s.id) && !isDemo(s.documentNumber) && !isDemo(s.notes) && !isDemo(s.supplierSource)
  );

  db.dispenses = db.dispenses.filter(
    d => !isDemo(d.id) && !isDemo(d.citizenName) && !isDemo(d.notes)
  );

  const purgedCount = (initialSupplies - db.supplies.length) + (initialDispenses - db.dispenses.length);

  if (purgedCount > 0) {
    db.auditLogs.unshift({
      id: `audit-${Date.now()}`,
      timestamp: new Date().toISOString(),
      action: 'إزالة البيانات التجريبية والوهمية',
      details: `تم إزالة ${purgedCount} سجل تجريبي وهمي بنجاح دون المساس ببيانات المكتب الحقيقية`,
      performedBy: operatorName
    });
    saveDatabase(db);
  }

  return { purgedCount };
}
