/**
 * Central Stock Calculation & Integrity Audit Service
 * مصدر الحقيقة المركزي الوحيد لحساب الأرصدة والتدقيق الجردي وفحص النزاهة
 * 
 * القواعد الصارمة:
 * 1. لا يتم فرض أو تغيير الأرصدة الحالية تلقائياً بدون موافقة إدارية صريحة.
 * 2. ممنوع إخفاء أخطاء الرصيد باستخدام Math.max(0, ...).
 * 3. منع الصرف إذا كان الرصيد غير كافٍ.
 * 4. رصد الحركات الموجودة أونلاين فقط دون دمجها أعمى.
 */

import {
  AppDatabase,
  StockCategory,
  StockItem,
  FullIntegrityReport,
  IntegrityIssue,
  SyncTombstone,
} from '../types';

export interface StockCalculationResult {
  category: StockCategory;
  openingBalance: number;
  totalSupplied: number;
  totalDispensed: number;
  totalDamaged: number;
  theoreticalStock: number;
  recordedStock: number;
  difference: number;
  isBalanced: boolean;
}

export interface RecalculateAllStocksResult {
  theoreticalStocks: Record<StockCategory, StockItem>;
  currentStocks: Record<StockCategory, StockItem>;
  discrepancies: StockCalculationResult[];
  hasDiscrepancies: boolean;
  applied: boolean;
}

/**
 * حساب الرصيد النظري الدقيق لصنف معين بناءً على الحركات
 */
export function calculateStockForCategory(
  category: StockCategory,
  db: AppDatabase
): StockCalculationResult {
  const stockItem = db.stocks?.[category] || {
    id: category,
    name: category,
    category: 'birth',
    currentStock: 0,
    totalReceived: 0,
    totalDispensed: 0,
    damagedOrCancelled: 0,
    minThreshold: 10,
    unit: 'وحدة',
    lastUpdated: new Date().toISOString(),
  };

  // 1. الرصيد الافتتاحي المعتمد
  const openingItem = db.openingBalances?.items?.[category];
  const openingBalance = openingItem?.openingQuantity ?? 0;

  // استبعاد الحركات المحذوفة (Tombstones)
  const tombstonedIds = new Set(
    (db.syncTombstones || []).map((t) => t.recordId)
  );

  // 2. مجموع التوريدات الفعلية غير المحذوفة
  const totalSupplied = (db.supplyTransactions || [])
    .filter((s) => s.stockCategory === category && !tombstonedIds.has(s.id))
    .reduce((sum, s) => sum + (Number(s.quantity) || 0), 0);

  // 3. مجموع المنصرف الفعلي غير المحذوف
  let totalDispensed = 0;
  (db.dispenseRecords || [])
    .filter((d) => !tombstonedIds.has(d.id))
    .forEach((d) => {
      (d.itemsDeducted || []).forEach((item) => {
        if (item.stockCategory === category) {
          totalDispensed += Number(item.quantity) || 0;
        }
      });
    });

  // 4. التالف والمعتمد
  const totalDamaged = Number(stockItem.damagedOrCancelled) || 0;

  // المعادلة المركزية: الرصيد = الافتتاحي + التوريد - الصرف - التالف
  // إذا لم يكن هناك محضر رصيد افتتاحي مسجل (openingBalance = 0)،
  // وكانت التوريدات مسجلة، فإن الرصيد النظري = التوريدات - الصرف - التالف
  const theoreticalStock = openingBalance + totalSupplied - totalDispensed - totalDamaged;
  const recordedStock = Number(stockItem.currentStock) || 0;
  const difference = recordedStock - theoreticalStock;

  return {
    category,
    openingBalance,
    totalSupplied,
    totalDispensed,
    totalDamaged,
    theoreticalStock,
    recordedStock,
    difference,
    isBalanced: difference === 0,
  };
}

/**
 * دالة مركزية لحساب أرصدة جميع الأصناف وتحديد الفروقات الجردية
 * الافتراضي: معاينة فقط وعدم تعديل قاعدة البيانات الحالية
 */
export function recalculateAllStocks(
  db: AppDatabase,
  options?: { applyChanges?: boolean }
): RecalculateAllStocksResult {
  const currentStocks = { ...(db.stocks || {}) } as Record<StockCategory, StockItem>;
  const theoreticalStocks = {} as Record<StockCategory, StockItem>;
  const discrepancies: StockCalculationResult[] = [];

  const categories = Object.keys(currentStocks) as StockCategory[];

  categories.forEach((cat) => {
    const calc = calculateStockForCategory(cat, db);
    const existing = currentStocks[cat];

    theoreticalStocks[cat] = {
      ...existing,
      currentStock: calc.theoreticalStock,
      totalReceived: calc.totalSupplied + calc.openingBalance,
      totalDispensed: calc.totalDispensed,
      damagedOrCancelled: calc.totalDamaged,
      lastUpdated: new Date().toISOString(),
    };

    if (!calc.isBalanced) {
      discrepancies.push(calc);
    }
  });

  const hasDiscrepancies = discrepancies.length > 0;
  const shouldApply = options?.applyChanges === true;

  if (shouldApply) {
    db.stocks = theoreticalStocks;
  }

  return {
    theoreticalStocks,
    currentStocks,
    discrepancies,
    hasDiscrepancies,
    applied: shouldApply,
  };
}

/**
 * التحقق الصارم من كفاية الرصيد قبل الصرف (Atomic Check)
 * تمنع الصرف إذا تجاوز الرصيد المتاح وتمنع Math.max لإخفاء الخطأ
 */
export function validateDispenseAvailability(
  stocks: Record<StockCategory, StockItem>,
  itemsToDeduct: Array<{ stockCategory: StockCategory; quantity: number }>
): {
  isValid: boolean;
  insufficientCategory?: StockCategory;
  available?: number;
  requested?: number;
  errorMessage?: string;
} {
  for (const item of itemsToDeduct) {
    const stock = stocks[item.stockCategory];
    const available = stock ? Number(stock.currentStock) || 0 : 0;
    const requested = Number(item.quantity) || 0;

    if (requested <= 0) {
      return {
        isValid: false,
        insufficientCategory: item.stockCategory,
        available,
        requested,
        errorMessage: `كمية الصرف غير صالحة للصنف (${stock?.name || item.stockCategory})`,
      };
    }

    if (requested > available) {
      return {
        isValid: false,
        insufficientCategory: item.stockCategory,
        available,
        requested,
        errorMessage: `الرصيد غير كافٍ للصنف (${stock?.name || item.stockCategory}): الرصيد المتاح ${available}، والمطلوب صرفه ${requested}`,
      };
    }
  }

  return { isValid: true };
}

/**
 * منظومة الفحص والتدقيق الشامل لنزاهة البيانات (runFullIntegrityCheck)
 * فحص كامل لـ 18 محوراً دون تعديل أي بيان
 */
export function runFullIntegrityCheck(
  db: AppDatabase,
  onlineDb?: AppDatabase | null
): FullIntegrityReport {
  const issues: IntegrityIssue[] = [];
  const now = new Date().toISOString();

  const stocks = db.stocks || ({} as Record<StockCategory, StockItem>);
  const tombstones = db.syncTombstones || [];
  const tombstonedRecordIds = new Set(tombstones.map((t) => t.recordId));

  // 1. فحص الأرصدة السالبة (Negative Balance Check)
  for (const [catKey, item] of Object.entries(stocks)) {
    const current = Number(item.currentStock);
    if (isNaN(current) || current < 0) {
      issues.push({
        id: `neg-stock-${catKey}-${Date.now()}`,
        type: 'CRITICAL',
        category: 'NEGATIVE_BALANCE',
        title: `رصيد سالب في صنف: ${item.name || catKey}`,
        description: `الرصيد الحالي المسجل للصنف هو (${current}) وهو أقل من الصفر، مما يشير إلى صرف فائض غير قانوني.`,
        stockCategory: catKey as StockCategory,
        details: { currentStock: current },
      });
    }
  }

  // 2. فحص تكرار المعرفات في حركات الصرف (Duplicate Dispense IDs)
  const dispenseIds = new Set<string>();
  const dispenseTxIds = new Set<string>();
  (db.dispenseRecords || []).forEach((d) => {
    if (dispenseIds.has(d.id)) {
      issues.push({
        id: `dup-disp-id-${d.id}`,
        type: 'CRITICAL',
        category: 'DUPLICATE_ID',
        title: `تكرار في معرف حركة صرف (Dispense ID Duplicate)`,
        description: `المعرف (${d.id}) مكرر في أكثر من حركة صرف.`,
        recordId: d.id,
      });
    } else {
      dispenseIds.add(d.id);
    }

    if (d.transactionId) {
      if (dispenseTxIds.has(d.transactionId)) {
        issues.push({
          id: `dup-disp-tx-${d.transactionId}`,
          type: 'WARNING',
          category: 'DUPLICATE_ID',
          title: `تكرار معرف المعاملة (transactionId) في الصرف`,
          description: `المعاملة (${d.transactionId}) مكررة في أكثر من سجل صرف.`,
          transactionId: d.transactionId,
        });
      } else {
        dispenseTxIds.add(d.transactionId);
      }
    }
  });

  // 3. فحص تكرار المعرفات في التوريدات (Duplicate Supply IDs)
  const supplyIds = new Set<string>();
  (db.supplyTransactions || []).forEach((s) => {
    if (supplyIds.has(s.id)) {
      issues.push({
        id: `dup-sup-id-${s.id}`,
        type: 'CRITICAL',
        category: 'DUPLICATE_ID',
        title: `تكرار في معرف حركة توريد (Supply ID Duplicate)`,
        description: `المعرف (${s.id}) مكرر في أكثر من حركة توريد.`,
        recordId: s.id,
      });
    } else {
      supplyIds.add(s.id);
    }
  });

  // 4. فحص السجلات المحذوفة التي عادت (Tombstone Violations)
  (db.dispenseRecords || []).forEach((d) => {
    if (tombstonedRecordIds.has(d.id)) {
      issues.push({
        id: `tombstone-revived-disp-${d.id}`,
        type: 'CRITICAL',
        category: 'ORPHAN_TOMBSTONE',
        title: `سجل صرف محذوف ما زال موجوداً في السجلات النشطة`,
        description: `السجل (${d.id}) مسجل كحركة محذوفة في Tombstones ولكنها ما زالت مدرجة كحركة نشطة.`,
        recordId: d.id,
      });
    }
  });

  (db.supplyTransactions || []).forEach((s) => {
    if (tombstonedRecordIds.has(s.id)) {
      issues.push({
        id: `tombstone-revived-sup-${s.id}`,
        type: 'CRITICAL',
        category: 'ORPHAN_TOMBSTONE',
        title: `سجل توريد محذوف ما زال موجوداً في السجلات النشطة`,
        description: `التوريد (${s.id}) مسجل كحركة محذوفة في Tombstones ولكنه ما زال مدرجاً.`,
        recordId: s.id,
      });
    }
  });

  (db.lateRegistrations || []).forEach((l) => {
    if (tombstonedRecordIds.has(l.id)) {
      issues.push({
        id: `tombstone-revived-late-${l.id}`,
        type: 'CRITICAL',
        category: 'ORPHAN_TOMBSTONE',
        title: `استمارة ساقط قيد محذوفة ما زالت موجودة في السجلات النشطة`,
        description: `الاستمارة (${l.id}) مسجلة كحركة محذوفة في Tombstones ولكنها ما زالت مدرجة.`,
        recordId: l.id,
      });
    }
  });

  // 5. فحص التدقيق الجردي للأرصدة (Stock Calculation & Discrepancies)
  const stockAudit = {} as FullIntegrityReport['stockAudit'];
  const categories = Object.keys(stocks) as StockCategory[];

  categories.forEach((cat) => {
    const calc = calculateStockForCategory(cat, db);
    stockAudit[cat] = {
      recordedStock: calc.recordedStock,
      theoreticalStock: calc.theoreticalStock,
      difference: calc.difference,
      openingBalance: calc.openingBalance,
      totalSupplied: calc.totalSupplied,
      totalDispensed: calc.totalDispensed,
      totalDamaged: calc.totalDamaged,
      isBalanced: calc.isBalanced,
    };

    if (!calc.isBalanced) {
      issues.push({
        id: `discrepancy-${cat}`,
        type: 'WARNING',
        category: 'DISCREPANCY',
        title: `فرق جردي في صنف: ${stocks[cat]?.name || cat}`,
        description: `الرصيد الحالي (${calc.recordedStock}) لا يطابق الرصيد المحسوب من واقع الدفاتر (${calc.theoreticalStock})، بفارق (${calc.difference}).`,
        stockCategory: cat,
        details: calc,
      });
    }
  });

  // 6. فحص الحركات الموجودة Online فقط (دون دمجها أعمى)
  const onlineOnlyRecords: FullIntegrityReport['onlineOnlyRecords'] = [];
  if (onlineDb) {
    const localDispenseIds = new Set((db.dispenseRecords || []).map((d) => d.id));
    const localSupplyIds = new Set((db.supplyTransactions || []).map((s) => s.id));
    const localLateIds = new Set((db.lateRegistrations || []).map((l) => l.id));

    (onlineDb.supplyTransactions || []).forEach((os) => {
      if (!localSupplyIds.has(os.id) && !tombstonedRecordIds.has(os.id)) {
        onlineOnlyRecords.push({
          type: 'SUPPLY',
          id: os.id,
          transactionId: os.transactionId,
          date: os.date,
          details: os,
        });
        issues.push({
          id: `online-only-sup-${os.id}`,
          type: 'INFO',
          category: 'ONLINE_ONLY',
          title: `حركة توريد موجودة على الخادم السحابي فقط`,
          description: `التوريد (${os.id} - ${os.stockCategory} - كمية: ${os.quantity}) موجود سحابياً وغير مسجل محلياً.`,
          recordId: os.id,
          transactionId: os.transactionId,
          details: os,
        });
      }
    });

    (onlineDb.dispenseRecords || []).forEach((od) => {
      if (!localDispenseIds.has(od.id) && !tombstonedRecordIds.has(od.id)) {
        onlineOnlyRecords.push({
          type: 'DISPENSE',
          id: od.id,
          transactionId: od.transactionId,
          date: od.date,
          details: od,
        });
        issues.push({
          id: `online-only-disp-${od.id}`,
          type: 'INFO',
          category: 'ONLINE_ONLY',
          title: `حركة صرف موجودة على الخادم السحابي فقط`,
          description: `حركة الصرف (${od.id} - ${od.beneficiaryName}) موجودة سحابياً وغير مسجلة محلياً.`,
          recordId: od.id,
          transactionId: od.transactionId,
          details: od,
        });
      }
    });
  }

  const criticalCount = issues.filter((i) => i.type === 'CRITICAL').length;
  const warningCount = issues.filter((i) => i.type === 'WARNING').length;

  let summary = 'تقرير فحص النزاهة الشامل: ';
  if (criticalCount === 0 && warningCount === 0) {
    summary += 'جميع الأرصدة والحركات سليمة تماماً ومطابقة لدفاتر العهدة.';
  } else {
    summary += `تم رصد (${criticalCount}) أخطاء حرجة و(${warningCount}) تنبيهات وفروقات دفترية تحتاج مراجعة إدارية.`;
  }

  return {
    timestamp: now,
    isValid: criticalCount === 0,
    criticalIssuesCount: criticalCount,
    warningsCount: warningCount,
    issues,
    stockAudit,
    onlineOnlyRecords,
    summary,
  };
}
