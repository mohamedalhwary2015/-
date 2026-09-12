/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * Core Database Engine & Local Persistence
 */

import {
  DatabaseSchema,
  StockCategory,
  STOCK_CATEGORIES,
  CategoryStock,
  SupplyTransaction,
  DispenseRecord,
  LateRegistrationRecord,
  AdjustmentReason,
  AuditLogEntry,
  Tombstone,
  ResetBoundary
} from '../types';

const STORAGE_KEY = 'saflaq_health_office_db_v2';
const DEVICE_ID_KEY = 'saflaq_device_id';

export function getDeviceId(): string {
  if (typeof window === 'undefined') return 'server-host';
  let deviceId = localStorage.getItem(DEVICE_ID_KEY);
  if (!deviceId) {
    deviceId = 'dev-' + Math.random().toString(36).substring(2, 9) + '-' + Date.now().toString(36);
    localStorage.setItem(DEVICE_ID_KEY, deviceId);
  }
  return deviceId;
}

export function generateStableId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 8)}`;
}

/**
 * Creates completely empty, clean initial database schema
 * ABSOLUTELY ZERO DEMO / SEED / MOCK DATA
 */
export function createEmptyDatabase(): DatabaseSchema {
  const now = new Date().toISOString();
  const resetTimestamp = now;

  const emptyStocks: Record<StockCategory, CategoryStock> = {} as any;
  for (const cat of STOCK_CATEGORIES) {
    emptyStocks[cat] = {
      category: cat,
      currentStock: 0,
      openingStock: 0,
      totalReceived: 0,
      totalDispensed: 0,
      damagedOrCancelled: 0,
      theoreticalStock: 0,
      lastUpdated: now
    };
  }

  const emptyOpeningBalances: any = {};
  for (const cat of STOCK_CATEGORIES) {
    emptyOpeningBalances[cat] = {
      category: cat,
      quantity: 0,
      inventoryDate: now.split('T')[0],
      inventoryKeeper: 'غير محدد',
      notes: ''
    };
  }

  return {
    version: 2,
    lastUpdated: now,
    resetBoundary: {
      resetId: `rst-${Date.now().toString(36)}`,
      resetTimestamp: resetTimestamp,
      resetBy: 'تهيئة النظام النظيفة (مكتب صحة سفلاق)'
    },
    officeSettings: {
      officeName: 'مكتب صحة سفلاق - إدارة ساقلتة الصحية',
      governorate: 'محافظة سوهاج',
      currentEmployee: 'غير محدد',
      healthCardMaleFee: 50,
      healthCardFemaleFee: 50,
      birthCertFee: 0,
      deathCertFee: 0
    },
    stocks: emptyStocks,
    supplies: [],
    dispenses: [],
    lateRegistrations: [],
    openingBalances: emptyOpeningBalances,
    tombstones: [],
    auditLogs: []
  };
}

let memoryDb: DatabaseSchema | null = null;
let saveLock = false;

/**
 * Loads database safely from localStorage without injecting mock data
 */
export function loadDatabase(): DatabaseSchema {
  if (typeof window === 'undefined') {
    if (!memoryDb) memoryDb = createEmptyDatabase();
    return memoryDb;
  }

  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const fresh = createEmptyDatabase();
      localStorage.setItem(STORAGE_KEY, JSON.stringify(fresh));
      memoryDb = fresh;
      return fresh;
    }

    const parsed: DatabaseSchema = JSON.parse(raw);

    // Validate structural integrity and ensure all categories exist
    if (!parsed.stocks || typeof parsed.stocks !== 'object') {
      parsed.stocks = createEmptyDatabase().stocks;
    }

    for (const cat of STOCK_CATEGORIES) {
      if (!parsed.stocks[cat]) {
        parsed.stocks[cat] = {
          category: cat,
          currentStock: 0,
          openingStock: 0,
          totalReceived: 0,
          totalDispensed: 0,
          damagedOrCancelled: 0,
          theoreticalStock: 0,
          lastUpdated: new Date().toISOString()
        };
      }
    }

    if (!Array.isArray(parsed.supplies)) parsed.supplies = [];
    if (!Array.isArray(parsed.dispenses)) parsed.dispenses = [];
    if (!Array.isArray(parsed.lateRegistrations)) parsed.lateRegistrations = [];
    if (!Array.isArray(parsed.tombstones)) parsed.tombstones = [];
    if (!Array.isArray(parsed.auditLogs)) parsed.auditLogs = [];

    if (!parsed.resetBoundary || !parsed.resetBoundary.resetTimestamp) {
      parsed.resetBoundary = {
        resetId: `rst-${Date.now().toString(36)}`,
        resetTimestamp: new Date().toISOString(),
        resetBy: 'نظام مكتب صحة سفلاق'
      };
    }

    if (!parsed.officeSettings) {
      parsed.officeSettings = createEmptyDatabase().officeSettings;
    }

    // Never use hardcoded employee
    if (parsed.officeSettings.currentEmployee === 'أحمد محمود' || !parsed.officeSettings.currentEmployee) {
      parsed.officeSettings.currentEmployee = 'غير محدد';
    }

    memoryDb = parsed;
    return parsed;
  } catch (err) {
    console.error('Failed to parse database from localStorage:', err);
    if (!memoryDb) memoryDb = createEmptyDatabase();
    return memoryDb;
  }
}

/**
 * Saves database reliably with race-condition guard
 */
export function saveDatabase(db: DatabaseSchema, triggerSync = true): DatabaseSchema {
  if (saveLock) {
    // If locked, update memory reference immediately
    memoryDb = db;
  }

  saveLock = true;
  try {
    db.lastUpdated = new Date().toISOString();
    db.version = (db.version || 1) + 1;
    memoryDb = db;

    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
      window.dispatchEvent(new CustomEvent('saflaq_db_changed', { detail: db }));
    }

    return db;
  } finally {
    saveLock = false;
  }
}

// ---------------------------------------------------------------------------
// Protected Supply Operations (Transactions)
// ---------------------------------------------------------------------------

export function addSupply(
  data: Omit<SupplyTransaction, 'id' | 'transactionId' | 'version' | 'updatedAt' | 'syncStatus'>
): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const id = generateStableId('sup');
  const transactionId = generateStableId('tx-sup');

  const newSupply: SupplyTransaction = {
    ...data,
    id,
    transactionId,
    version: 1,
    updatedAt: now,
    syncStatus: 'pending'
  };

  // Protect stock: Update operational stock directly
  const stock = db.stocks[data.category];
  if (stock) {
    stock.currentStock += data.quantity;
    stock.totalReceived += data.quantity;
    stock.lastUpdated = now;
  }

  db.supplies.unshift(newSupply);

  // Audit log
  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'إضافة توريد وارد',
    category: data.category,
    details: `توريد كمية ${data.quantity} برقم إذن ${data.documentNumber}`,
    performedBy: data.receivedBy || db.officeSettings.currentEmployee || 'غير محدد',
    newValue: data.quantity
  });

  return saveDatabase(db);
}

export function updateSupply(
  id: string,
  updates: Partial<Omit<SupplyTransaction, 'id' | 'transactionId'>>,
  editorName?: string
): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const index = db.supplies.findIndex(s => s.id === id);
  if (index === -1) return db;

  const existing = db.supplies[index];
  const oldCategory = existing.category;
  const oldQuantity = existing.quantity;

  const updated: SupplyTransaction = {
    ...existing,
    ...updates,
    version: (existing.version || 1) + 1,
    updatedAt: now,
    syncStatus: 'pending'
  };

  // Adjust operational stock accurately
  if (oldCategory === updated.category) {
    const diff = updated.quantity - oldQuantity;
    const stock = db.stocks[updated.category];
    if (stock) {
      stock.currentStock += diff;
      stock.totalReceived += diff;
      stock.lastUpdated = now;
    }
  } else {
    // Category changed: revert old, add new
    const oldStock = db.stocks[oldCategory];
    if (oldStock) {
      oldStock.currentStock -= oldQuantity;
      oldStock.totalReceived -= oldQuantity;
      oldStock.lastUpdated = now;
    }
    const newStock = db.stocks[updated.category];
    if (newStock) {
      newStock.currentStock += updated.quantity;
      newStock.totalReceived += updated.quantity;
      newStock.lastUpdated = now;
    }
  }

  db.supplies[index] = updated;

  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'تعديل توريد وارد',
    category: updated.category,
    details: `تعديل إذن توريد ${updated.documentNumber} من ${oldQuantity} إلى ${updated.quantity}`,
    performedBy: editorName || updated.receivedBy || db.officeSettings.currentEmployee || 'غير محدد',
    previousValue: oldQuantity,
    newValue: updated.quantity
  });

  return saveDatabase(db);
}

export function deleteSupply(id: string, deleterName?: string): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const index = db.supplies.findIndex(s => s.id === id);
  if (index === -1) return db;

  const existing = db.supplies[index];

  // Revert operational stock
  const stock = db.stocks[existing.category];
  if (stock) {
    stock.currentStock -= existing.quantity;
    stock.totalReceived -= existing.quantity;
    stock.lastUpdated = now;
  }

  // Tombstone protection
  db.tombstones.push({
    recordId: existing.id,
    recordType: 'supply',
    transactionId: existing.transactionId,
    deletedAt: now,
    version: (existing.version || 1) + 1
  });

  db.supplies.splice(index, 1);

  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'حذف توريد وارد',
    category: existing.category,
    details: `حذف إذن توريد ${existing.documentNumber} بكمية ${existing.quantity}`,
    performedBy: deleterName || existing.receivedBy || db.officeSettings.currentEmployee || 'غير محدد',
    previousValue: existing.quantity
  });

  return saveDatabase(db);
}

// ---------------------------------------------------------------------------
// Protected Dispense Operations (Transactions)
// ---------------------------------------------------------------------------

export function addDispense(
  data: Omit<DispenseRecord, 'id' | 'transactionId' | 'version' | 'updatedAt' | 'syncStatus'>
): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const id = generateStableId('dsp');
  const transactionId = generateStableId('tx-dsp');

  const newDispense: DispenseRecord = {
    ...data,
    id,
    transactionId,
    version: 1,
    updatedAt: now,
    syncStatus: 'pending'
  };

  // Deduct from operational stock
  const stock = db.stocks[data.category];
  if (stock) {
    stock.currentStock -= data.quantity;
    stock.totalDispensed += data.quantity;
    stock.lastUpdated = now;
  }

  db.dispenses.unshift(newDispense);

  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'صرف مستند / معاملة',
    category: data.category,
    details: `صرف ${data.quantity} للمواطن ${data.citizenName} (معاملة: ${data.transactionType}) بمبلغ ${data.collectedAmount} ج.م`,
    performedBy: data.dispensedBy || db.officeSettings.currentEmployee || 'غير محدد',
    newValue: data.quantity
  });

  return saveDatabase(db);
}

export function updateDispense(
  id: string,
  updates: Partial<Omit<DispenseRecord, 'id' | 'transactionId'>>,
  editorName?: string
): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const index = db.dispenses.findIndex(d => d.id === id);
  if (index === -1) return db;

  const existing = db.dispenses[index];
  const oldCategory = existing.category;
  const oldQuantity = existing.quantity;

  const updated: DispenseRecord = {
    ...existing,
    ...updates,
    version: (existing.version || 1) + 1,
    updatedAt: now,
    syncStatus: 'pending'
  };

  if (oldCategory === updated.category) {
    const diff = updated.quantity - oldQuantity;
    const stock = db.stocks[updated.category];
    if (stock) {
      stock.currentStock -= diff;
      stock.totalDispensed += diff;
      stock.lastUpdated = now;
    }
  } else {
    // Category changed: revert old, apply new
    const oldStock = db.stocks[oldCategory];
    if (oldStock) {
      oldStock.currentStock += oldQuantity;
      oldStock.totalDispensed -= oldQuantity;
      oldStock.lastUpdated = now;
    }
    const newStock = db.stocks[updated.category];
    if (newStock) {
      newStock.currentStock -= updated.quantity;
      newStock.totalDispensed += updated.quantity;
      newStock.lastUpdated = now;
    }
  }

  db.dispenses[index] = updated;

  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'تعديل صرف مستند',
    category: updated.category,
    details: `تعديل صرف ${updated.citizenName} بكمية ${updated.quantity} ومبلغ ${updated.collectedAmount} ج.م`,
    performedBy: editorName || updated.dispensedBy || db.officeSettings.currentEmployee || 'غير محدد'
  });

  return saveDatabase(db);
}

export function deleteDispense(id: string, deleterName?: string): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const index = db.dispenses.findIndex(d => d.id === id);
  if (index === -1) return db;

  const existing = db.dispenses[index];

  // Restore operational stock
  const stock = db.stocks[existing.category];
  if (stock) {
    stock.currentStock += existing.quantity;
    stock.totalDispensed -= existing.quantity;
    stock.lastUpdated = now;
  }

  // Tombstone protection
  db.tombstones.push({
    recordId: existing.id,
    recordType: 'dispense',
    transactionId: existing.transactionId,
    deletedAt: now,
    version: (existing.version || 1) + 1
  });

  db.dispenses.splice(index, 1);

  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'حذف صرف مستند',
    category: existing.category,
    details: `حذف صرف ${existing.citizenName} واستعادة ${existing.quantity} للرصيد`,
    performedBy: deleterName || existing.dispensedBy || db.officeSettings.currentEmployee || 'غير محدد',
    previousValue: existing.quantity
  });

  return saveDatabase(db);
}

// ---------------------------------------------------------------------------
// Protected Late Registration Operations
// ---------------------------------------------------------------------------

export function addLateRegistration(
  data: Omit<LateRegistrationRecord, 'id' | 'transactionId' | 'version' | 'updatedAt' | 'syncStatus'>
): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const id = generateStableId('lreg');
  const transactionId = generateStableId('tx-lreg');

  const newRecord: LateRegistrationRecord = {
    ...data,
    id,
    transactionId,
    version: 1,
    updatedAt: now,
    syncStatus: 'pending'
  };

  db.lateRegistrations.unshift(newRecord);

  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'إضافة استمارة ساقط قيد',
    details: `طلب ساقط قيد رقم ${data.formNumber} للمواطن ${data.personName} (${data.eventType})`,
    performedBy: data.staffName || db.officeSettings.currentEmployee || 'غير محدد'
  });

  return saveDatabase(db);
}

export function updateLateRegistration(
  id: string,
  updates: Partial<Omit<LateRegistrationRecord, 'id' | 'transactionId'>>,
  editorName?: string
): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const index = db.lateRegistrations.findIndex(r => r.id === id);
  if (index === -1) return db;

  const existing = db.lateRegistrations[index];
  const updated: LateRegistrationRecord = {
    ...existing,
    ...updates,
    version: (existing.version || 1) + 1,
    updatedAt: now,
    syncStatus: 'pending'
  };

  db.lateRegistrations[index] = updated;

  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'تعديل استمارة ساقط قيد',
    details: `تعديل استمارة ${updated.formNumber} حالة: ${updated.status}`,
    performedBy: editorName || updated.staffName || db.officeSettings.currentEmployee || 'غير محدد'
  });

  return saveDatabase(db);
}

export function deleteLateRegistration(id: string, deleterName?: string): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const index = db.lateRegistrations.findIndex(r => r.id === id);
  if (index === -1) return db;

  const existing = db.lateRegistrations[index];

  db.tombstones.push({
    recordId: existing.id,
    recordType: 'late_registration',
    transactionId: existing.transactionId,
    deletedAt: now,
    version: (existing.version || 1) + 1
  });

  db.lateRegistrations.splice(index, 1);

  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'حذف استمارة ساقط قيد',
    details: `حذف استمارة ${existing.formNumber} للمواطن ${existing.personName}`,
    performedBy: deleterName || existing.staffName || db.officeSettings.currentEmployee || 'غير محدد'
  });

  return saveDatabase(db);
}

// ---------------------------------------------------------------------------
// Explicit Manual Stock Adjustment (Protected - Rule 21)
// ---------------------------------------------------------------------------

export function manualAdjustStock(
  category: StockCategory,
  newActualStock: number,
  reason: AdjustmentReason,
  notes: string,
  performedBy: string
): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();
  const stock = db.stocks[category];
  if (!stock) return db;

  const oldStock = stock.currentStock;
  const difference = newActualStock - oldStock;

  // Never blindly assume difference < 0 is damagedOrCancelled!
  if (reason === 'damaged' && difference < 0) {
    stock.damagedOrCancelled += Math.abs(difference);
  }

  stock.currentStock = newActualStock;
  stock.lastUpdated = now;

  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'تسوية رصيد جرد يدوي صريح',
    category,
    details: `تعديل الرصيد الفعلي من ${oldStock} إلى ${newActualStock} (الفارق: ${difference > 0 ? `+${difference}` : difference}) - السبب: ${reason} - ${notes}`,
    performedBy: performedBy || db.officeSettings.currentEmployee || 'غير محدد',
    previousValue: oldStock,
    newValue: newActualStock
  });

  return saveDatabase(db);
}

// ---------------------------------------------------------------------------
// Opening Balance Setting (Explicit - Rule 22)
// ---------------------------------------------------------------------------

export function setOpeningBalance(
  category: StockCategory,
  quantity: number,
  inventoryKeeper: string,
  notes: string = ''
): DatabaseSchema {
  const db = loadDatabase();
  const now = new Date().toISOString();

  db.openingBalances[category] = {
    category,
    quantity,
    inventoryDate: now.split('T')[0],
    inventoryKeeper: inventoryKeeper || db.officeSettings.currentEmployee || 'غير محدد',
    notes
  };

  const stock = db.stocks[category];
  if (stock) {
    // Does NOT wipe or zero currentStock if already initialized!
    const openingDiff = quantity - stock.openingStock;
    stock.openingStock = quantity;
    // Apply initial delta if currentStock was untouched (0)
    if (stock.currentStock === 0 && stock.totalReceived === 0 && stock.totalDispensed === 0) {
      stock.currentStock = quantity;
    } else {
      // In existing running stock, opening balance update is logged
    }
    stock.lastUpdated = now;
  }

  db.auditLogs.unshift({
    id: generateStableId('audit'),
    timestamp: now,
    action: 'تحديد رصيد أول المدة',
    category,
    details: `اعتماد رصيد أول المدة للصنف بقيمة ${quantity} بواسطة ${inventoryKeeper}`,
    performedBy: inventoryKeeper || db.officeSettings.currentEmployee || 'غير محدد',
    newValue: quantity
  });

  return saveDatabase(db);
}

// ---------------------------------------------------------------------------
// Factory Reset (Rule 18 & 19 - Full Wipe & Reset Boundary)
// ---------------------------------------------------------------------------

export function executeFactoryReset(resetBy: string = 'مدير النظام'): DatabaseSchema {
  const now = new Date().toISOString();
  const newResetBoundary: ResetBoundary = {
    resetId: `rst-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
    resetTimestamp: now,
    resetBy: resetBy || 'غير محدد',
    reason: 'تصفير المصنع الشامل المعتمد للنظام'
  };

  const empty = createEmptyDatabase();
  empty.resetBoundary = newResetBoundary;
  empty.auditLogs = [{
    id: generateStableId('audit'),
    timestamp: now,
    action: 'تصفير المصنع الشامل (Factory Reset)',
    details: 'تم مسح كافة البيانات والجداول وبدء حد أمان زمني جديد',
    performedBy: resetBy || 'غير محدد'
  }];

  if (typeof window !== 'undefined') {
    // Wipe local queues and storage
    localStorage.removeItem('saflaq_sync_queue');
    localStorage.removeItem('saflaq_sync_log');
    localStorage.setItem(STORAGE_KEY, JSON.stringify(empty));
    window.dispatchEvent(new CustomEvent('saflaq_db_changed', { detail: empty }));
  }

  memoryDb = empty;
  return empty;
}
