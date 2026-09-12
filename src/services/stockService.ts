/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * Stock Verification & Theoretical Audit Engine
 * 
 * STRICT MANDATE:
 * Theoretical stock is computed for AUDITING and VERIFICATION only.
 * Functions here MUST NEVER automatically mutate or overwrite `currentStock`!
 */

import {
  DatabaseSchema,
  StockCategory,
  STOCK_CATEGORIES,
  CATEGORY_LABELS,
  IntegrityReport,
  IntegrityIssue
} from '../types';

export interface CategoryAuditResult {
  category: StockCategory;
  categoryLabel: string;
  currentStock: number;       // الرصيد الفعلي المحمي تشغيلياً
  theoreticalStock: number;   // الرصيد النظري المحسوب من الحركات
  difference: number;         // الفارق (currentStock - theoreticalStock)
  isBalanced: boolean;        // هل الحساب النظري متطابق مع الرصيد الفعلي
  openingStock: number;
  totalReceived: number;
  totalDispensed: number;
  damagedOrCancelled: number;
}

/**
 * Calculates theoretical numbers from transactions without touching currentStock
 */
export function calculateTheoreticalStockForCategory(
  db: DatabaseSchema,
  category: StockCategory
): CategoryAuditResult {
  const stock = db.stocks[category] || {
    category,
    currentStock: 0,
    openingStock: 0,
    totalReceived: 0,
    totalDispensed: 0,
    damagedOrCancelled: 0,
    theoreticalStock: 0,
    lastUpdated: new Date().toISOString()
  };

  const openingStock = Number(stock.openingStock) || 0;

  // 1. Sum verified active supplies
  const totalReceived = (db.supplies || [])
    .filter(s => !s.isDeleted && s.category === category)
    .reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

  // 2. Sum verified active dispenses
  const totalDispensed = (db.dispenses || [])
    .filter(d => !d.isDeleted && d.category === category)
    .reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);

  const damagedOrCancelled = Number(stock.damagedOrCancelled) || 0;

  // Theoretical mathematical stock
  const theoreticalStock = openingStock + totalReceived - totalDispensed - damagedOrCancelled;
  const currentStock = Number(stock.currentStock) || 0;
  const difference = currentStock - theoreticalStock;

  return {
    category,
    categoryLabel: CATEGORY_LABELS[category],
    currentStock,
    theoreticalStock,
    difference,
    isBalanced: difference === 0,
    openingStock,
    totalReceived,
    totalDispensed,
    damagedOrCancelled
  };
}

/**
 * Audits all stocks theoretically.
 * NEVER mutates `currentStock`!
 */
export function recalculateAllStocks(db: DatabaseSchema): {
  audits: Record<StockCategory, CategoryAuditResult>;
  allBalanced: boolean;
  totalDifference: number;
} {
  const audits: Record<StockCategory, CategoryAuditResult> = {} as any;
  let allBalanced = true;
  let totalDifference = 0;

  for (const cat of STOCK_CATEGORIES) {
    const audit = calculateTheoreticalStockForCategory(db, cat);
    audits[cat] = audit;
    if (!audit.isBalanced) {
      allBalanced = false;
      totalDifference += Math.abs(audit.difference);
    }
  }

  return {
    audits,
    allBalanced,
    totalDifference
  };
}

/**
 * Validates stock availability prior to dispensing
 */
export function validateDispenseAvailability(
  db: DatabaseSchema,
  category: StockCategory,
  requestedQuantity: number = 1
): { available: boolean; currentStock: number; message?: string } {
  const stock = db.stocks[category];
  const currentStock = stock ? stock.currentStock : 0;

  if (currentStock < requestedQuantity) {
    return {
      available: false,
      currentStock,
      message: `الرصيد الفعلي الحالي (${currentStock}) غير كافٍ لصرف الكمية المطلوبة (${requestedQuantity}) من ${CATEGORY_LABELS[category]}`
    };
  }

  return {
    available: true,
    currentStock
  };
}

/**
 * Full Integrity Audit of entire database (Rule 31)
 * Detects discrepancies, duplicates, boundary violations, demo records, tombstones
 * STRICT: Detects first, does NOT automatically mutate currentStock!
 */
export function runFullIntegrityCheck(db: DatabaseSchema): IntegrityReport {
  const issues: IntegrityIssue[] = [];
  const now = new Date().toISOString();

  // 1. Check theoretical vs operational balance
  const audits = recalculateAllStocks(db);
  for (const cat of STOCK_CATEGORIES) {
    const audit = audits.audits[cat];
    if (!audit.isBalanced) {
      issues.push({
        id: `mismatch-${cat}`,
        code: 'STOCK_INTEGRITY_MISMATCH',
        severity: 'warning',
        category: cat,
        title: `عدم تطابق في رصيد ${audit.categoryLabel}`,
        description: `الرصيد الفعلي المحمي هو (${audit.currentStock}) بينما الحساب النظري من الحركات هو (${audit.theoreticalStock}) بفارق (${audit.difference > 0 ? `+${audit.difference}` : audit.difference}). تم الإبقاء على الرصيد الفعلي كما هو بدون تعديل تلقائي.`,
        details: {
          currentStock: audit.currentStock,
          theoreticalStock: audit.theoreticalStock,
          difference: audit.difference,
          openingStock: audit.openingStock,
          totalReceived: audit.totalReceived,
          totalDispensed: audit.totalDispensed,
          damagedOrCancelled: audit.damagedOrCancelled
        },
        detectedAt: now
      });
    }

    if (audit.currentStock < 0) {
      issues.push({
        id: `negative-${cat}`,
        code: 'NEGATIVE_STOCK',
        severity: 'critical',
        category: cat,
        title: `رصيد سالب في صنف ${audit.categoryLabel}`,
        description: `الرصيد الفعلي الحالي أقل من الصفر (${audit.currentStock})، يتطلب تسوية أو مراجعة عهدة الخزينة.`,
        details: { currentStock: audit.currentStock },
        detectedAt: now
      });
    }
  }

  // 2. Detect duplicate transactionIds
  const seenTxIds = new Map<string, string>();
  for (const sup of db.supplies || []) {
    if (sup.transactionId) {
      if (seenTxIds.has(sup.transactionId)) {
        issues.push({
          id: `dup-tx-${sup.id}`,
          code: 'DUPLICATE_TRANSACTION',
          severity: 'critical',
          category: sup.category,
          title: `تكرار في معرف العملية (Transaction ID)`,
          description: `معرف العملية ${sup.transactionId} مكرر في التوريدات.`,
          details: { recordId: sup.id, transactionId: sup.transactionId },
          detectedAt: now
        });
      } else {
        seenTxIds.set(sup.transactionId, sup.id);
      }
    }
  }

  for (const dsp of db.dispenses || []) {
    if (dsp.transactionId) {
      if (seenTxIds.has(dsp.transactionId)) {
        issues.push({
          id: `dup-tx-${dsp.id}`,
          code: 'DUPLICATE_TRANSACTION',
          severity: 'critical',
          category: dsp.category,
          title: `تكرار في معرف العملية (Transaction ID)`,
          description: `معرف العملية ${dsp.transactionId} مكرر في المنصرف.`,
          details: { recordId: dsp.id, transactionId: dsp.transactionId },
          detectedAt: now
        });
      } else {
        seenTxIds.set(dsp.transactionId, dsp.id);
      }
    }
  }

  // 3. Detect Demo / Seed / Mock items (Rule 7)
  const isDemo = (str: string = '') => {
    const s = str.toLowerCase();
    return s.includes('demo') || s.includes('seed') || s.includes('mock') || s.includes('تجريب') || s.includes('عينة');
  };

  for (const sup of db.supplies || []) {
    if (isDemo(sup.id) || isDemo(sup.documentNumber) || isDemo(sup.notes) || isDemo(sup.supplierSource)) {
      issues.push({
        id: `demo-sup-${sup.id}`,
        code: 'DEMO_TRANSACTION',
        severity: 'critical',
        category: sup.category,
        title: `حركة توريد تجريبية / وهمية مكتشفة`,
        description: `تم اكتشاف توريد يحمل وسوم تجريبية (${sup.documentNumber}).`,
        details: { recordId: sup.id },
        detectedAt: now
      });
    }
  }

  for (const dsp of db.dispenses || []) {
    if (isDemo(dsp.id) || isDemo(dsp.citizenName) || isDemo(dsp.notes)) {
      issues.push({
        id: `demo-dsp-${dsp.id}`,
        code: 'DEMO_TRANSACTION',
        severity: 'critical',
        category: dsp.category,
        title: `حركة صرف تجريبية / وهمية مكتشفة`,
        description: `تم اكتشاف صرف يحمل وسوم تجريبية (${dsp.citizenName}).`,
        details: { recordId: dsp.id },
        detectedAt: now
      });
    }
  }

  // 4. Detect Tombstone returns (Rule 16)
  const tombstoneMap = new Set((db.tombstones || []).map(t => t.recordId));
  for (const sup of db.supplies || []) {
    if (tombstoneMap.has(sup.id)) {
      issues.push({
        id: `tombstone-return-sup-${sup.id}`,
        code: 'DELETED_TRANSACTION_RETURNING',
        severity: 'critical',
        category: sup.category,
        title: `عودة حركة توريد محذوفة سابقاً`,
        description: `السجل ${sup.id} مسجل في قائمة المحذوفات (Tombstones) ولكنه ظهر في البيانات.`,
        details: { recordId: sup.id },
        detectedAt: now
      });
    }
  }

  for (const dsp of db.dispenses || []) {
    if (tombstoneMap.has(dsp.id)) {
      issues.push({
        id: `tombstone-return-dsp-${dsp.id}`,
        code: 'DELETED_TRANSACTION_RETURNING',
        severity: 'critical',
        category: dsp.category,
        title: `عودة حركة صرف محذوفة سابقاً`,
        description: `السجل ${dsp.id} مسجل في قائمة المحذوفات (Tombstones) ولكنه ظهر في البيانات.`,
        details: { recordId: dsp.id },
        detectedAt: now
      });
    }
  }

  // 5. Detect Reset Boundary Violations (Rule 19)
  if (db.resetBoundary && db.resetBoundary.resetTimestamp) {
    const boundaryTime = new Date(db.resetBoundary.resetTimestamp).getTime();
    for (const sup of db.supplies || []) {
      const recTime = new Date(sup.updatedAt || sup.date).getTime();
      if (recTime < boundaryTime - 1000) {
        issues.push({
          id: `boundary-sup-${sup.id}`,
          code: 'RESET_BOUNDARY_VIOLATION',
          severity: 'critical',
          category: sup.category,
          title: `حركة توريد سابقة لحد تصفير المصنع`,
          description: `الحركة ${sup.documentNumber} تسبق توقيت تصفير المصنع المعتمد (${db.resetBoundary.resetTimestamp}).`,
          details: { recordId: sup.id, updatedAt: sup.updatedAt },
          detectedAt: now
        });
      }
    }
  }

  const criticalIssues = issues.filter(i => i.severity === 'critical').length;
  const warningIssues = issues.filter(i => i.severity === 'warning').length;

  return {
    timestamp: now,
    hasErrors: criticalIssues > 0,
    totalIssues: issues.length,
    criticalIssues,
    warningIssues,
    issues,
    categoryAudits: STOCK_CATEGORIES.map(c => audits.audits[c])
  };
}
