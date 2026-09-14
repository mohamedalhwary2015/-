/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * Dispense Integrity Verification (Diagnostic First - Read Only)
 * 
 * STRICT MANDATE:
 * - This module performs comprehensive diagnostic verification on Dispense records.
 * - Read-only: It NEVER mutates, deletes, or recalculates database records or currentStock!
 */

import { DatabaseSchema, DispenseRecord, StockCategory, CATEGORY_LABELS } from '../types';

export interface DispenseIntegrityIssue {
  id: string;
  dispenseId: string;
  transactionId?: string;
  citizenName: string;
  category: StockCategory;
  severity: 'critical' | 'warning' | 'info';
  code:
    | 'INVALID_QUANTITY'
    | 'NEGATIVE_QUANTITY'
    | 'INVALID_COLLECTED_AMOUNT'
    | 'MISSING_TRANSACTION_ID'
    | 'DUPLICATE_RECEIPT_NUMBER'
    | 'SUSPECTED_DEMO_DISPENSE'
    | 'TOMBSTONE_VIOLATION'
    | 'CATEGORY_STOCK_DEPLETED';
  message: string;
  detectedAt: string;
}

export interface DispenseIntegritySummary {
  totalDispenses: number;
  totalQuantityDispensed: number;
  totalCollectedRevenue: number;
  healthCardsMaleDispensed: number;
  healthCardsFemaleDispensed: number;
  birthCertificatesDispensed: number;
  deathCertificatesDispensed: number;
  issues: DispenseIntegrityIssue[];
  hasCriticalIssues: boolean;
}

/**
 * Runs a pure, non-destructive audit on all dispense records in the database.
 */
export function verifyDispenseIntegrity(db: DatabaseSchema): DispenseIntegritySummary {
  const issues: DispenseIntegrityIssue[] = [];
  const now = new Date().toISOString();
  const tombstoneSet = new Set((db.tombstones || []).map(t => t.recordId));

  let totalDispensedQty = 0;
  let totalRevenue = 0;
  let maleCards = 0;
  let femaleCards = 0;
  let birthCerts = 0;
  let deathCerts = 0;

  const receiptMap = new Map<string, string>();

  const isDemo = (str: string = '') => {
    const s = str.toLowerCase();
    return s.includes('demo') || s.includes('seed') || s.includes('mock') || s.includes('تجريب') || s.includes('عينة');
  };

  for (const d of (db.dispenses || [])) {
    if (d.isDeleted) continue;

    const qty = Number(d.quantity) || 0;
    const amt = Number(d.collectedAmount) || 0;
    totalDispensedQty += qty;
    totalRevenue += amt;

    if (d.category === 'health_cards_male') maleCards += qty;
    else if (d.category === 'health_cards_female') femaleCards += qty;
    else if (d.category === 'birth_certificates') birthCerts += qty;
    else if (d.category === 'death_certificates') deathCerts += qty;

    // 1. Missing transactionId
    if (!d.transactionId) {
      issues.push({
        id: `missing-tx-${d.id}`,
        dispenseId: d.id,
        citizenName: d.citizenName || 'غير محدد',
        category: d.category,
        severity: 'warning',
        code: 'MISSING_TRANSACTION_ID',
        message: `حركة الصرف (${d.id}) لا تحمل معرف عملية موحد (transactionId).`,
        detectedAt: now
      });
    }

    // 2. Invalid or non-positive quantity
    if (qty <= 0) {
      issues.push({
        id: `invalid-qty-${d.id}`,
        dispenseId: d.id,
        citizenName: d.citizenName || 'غير محدد',
        category: d.category,
        severity: 'critical',
        code: 'INVALID_QUANTITY',
        message: `كمية منصرفة غير صحيحة (${qty}) للمواطن ${d.citizenName}.`,
        detectedAt: now
      });
    }

    // 3. Negative collected amount
    if (amt < 0) {
      issues.push({
        id: `neg-amt-${d.id}`,
        dispenseId: d.id,
        citizenName: d.citizenName || 'غير محدد',
        category: d.category,
        severity: 'critical',
        code: 'INVALID_COLLECTED_AMOUNT',
        message: `المبلغ المحصل سالب (${amt}) للمواطن ${d.citizenName}.`,
        detectedAt: now
      });
    }

    // 4. Duplicate receipt number
    if (d.receiptNumber && d.receiptNumber.trim() !== '') {
      const trimmedReceipt = d.receiptNumber.trim();
      if (receiptMap.has(trimmedReceipt)) {
        issues.push({
          id: `dup-receipt-${d.id}`,
          dispenseId: d.id,
          citizenName: d.citizenName || 'غير محدد',
          category: d.category,
          severity: 'warning',
          code: 'DUPLICATE_RECEIPT_NUMBER',
          message: `رقم الإيصال (${trimmedReceipt}) مكرر بين حركتي صرف (${d.id}) و (${receiptMap.get(trimmedReceipt)}).`,
          detectedAt: now
        });
      } else {
        receiptMap.set(trimmedReceipt, d.id);
      }
    }

    // 5. Suspected Demo
    if (isDemo(d.citizenName) || isDemo(d.notes) || isDemo(d.id)) {
      issues.push({
        id: `demo-disp-${d.id}`,
        dispenseId: d.id,
        citizenName: d.citizenName || 'غير محدد',
        category: d.category,
        severity: 'warning',
        code: 'SUSPECTED_DEMO_DISPENSE',
        message: `اشتباه في حركة تجريبية / وهمية للمواطن (${d.citizenName}).`,
        detectedAt: now
      });
    }

    // 6. Resurrected tombstone
    if (tombstoneSet.has(d.id)) {
      issues.push({
        id: `tombstone-viol-${d.id}`,
        dispenseId: d.id,
        citizenName: d.citizenName || 'غير محدد',
        category: d.category,
        severity: 'critical',
        code: 'TOMBSTONE_VIOLATION',
        message: `حركة الصرف (${d.id}) موجودة في سجل الشواهد المحذوفة (Tombstones).`,
        detectedAt: now
      });
    }
  }

  const hasCriticalIssues = issues.some(i => i.severity === 'critical');

  return {
    totalDispenses: (db.dispenses || []).filter(d => !d.isDeleted).length,
    totalQuantityDispensed: totalDispensedQty,
    totalCollectedRevenue: totalRevenue,
    healthCardsMaleDispensed: maleCards,
    healthCardsFemaleDispensed: femaleCards,
    birthCertificatesDispensed: birthCerts,
    deathCertificatesDispensed: deathCerts,
    issues,
    hasCriticalIssues
  };
}
