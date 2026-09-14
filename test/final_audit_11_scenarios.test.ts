import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyDatabase,
  saveDatabase,
  loadDatabase,
  addSupply,
  updateSupply,
  deleteSupply,
  addDispense,
  updateDispense,
  deleteDispense,
  manualAdjustStock,
  setOpeningBalance,
  executeFactoryReset
} from '../src/storage/db';
import {
  enqueueTransaction,
  getPendingQueue,
  clearPendingQueue,
  mergeServerDataSafely
} from '../src/storage/syncManager';
import { generateOfficialMonthlyReport } from '../src/services/reportService';
import { executeProductionRepair } from '../src/storage/repairEngine';
import { DatabaseSchema, StockCategory, SyncTransactionItem, STOCK_CATEGORIES } from '../src/types';

// Mock storage
const storageMap = new Map<string, string>();
(global as any).localStorage = {
  getItem: (key: string) => storageMap.get(key) || null,
  setItem: (key: string, val: string) => storageMap.set(key, val),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
  length: 0,
  key: (i: number) => Array.from(storageMap.keys())[i] || null
};
(global as any).window = {
  dispatchEvent: () => {},
  localStorage: (global as any).localStorage
};

/**
 * Simulates server-side /api/sync/transactions processing matching server.ts exactly
 */
function processTransactionsOnServer(
  serverDb: DatabaseSchema,
  transactions: SyncTransactionItem[],
  processedKeys: Set<string>,
  clientResetBoundary?: any,
  deviceId: string = 'dev-test'
): { status: number; acknowledgedKeys: string[]; serverDb: DatabaseSchema; error?: string } {
  // 1. Strict Reset Boundary Check
  if (serverDb.resetBoundary && serverDb.resetBoundary.resetId) {
    const clientResetId = clientResetBoundary?.resetId;
    if (!clientResetId || clientResetId !== serverDb.resetBoundary.resetId) {
      return {
        status: 409,
        acknowledgedKeys: [],
        serverDb,
        error: 'RESET_BOUNDARY_VIOLATION'
      };
    }
  }

  const acknowledgedKeys: string[] = [];
  const tombstoneSet = new Set((serverDb.tombstones || []).map(t => t.recordId));

  for (const item of transactions) {
    const { operationKey, operationType, recordId, payload, transactionId, version } = item;

    // Idempotency: skip if already processed
    if (processedKeys.has(operationKey)) {
      acknowledgedKeys.push(operationKey);
      continue;
    }

    // Check tombstones: do not resurrect deleted records
    if (tombstoneSet.has(recordId) && !operationType.includes('DELETE')) {
      acknowledgedKeys.push(operationKey);
      processedKeys.add(operationKey);
      continue;
    }

    switch (operationType) {
      case 'SUPPLY_ADD': {
        const exists = serverDb.supplies.some(s => s.id === recordId || s.transactionId === transactionId);
        if (!exists) {
          serverDb.supplies.unshift({ ...payload, syncStatus: 'synced' });
          const stock = serverDb.stocks[payload.category as StockCategory];
          if (stock) {
            stock.currentStock += payload.quantity;
            stock.totalReceived += payload.quantity;
            stock.lastUpdated = new Date().toISOString();
          }
        }
        break;
      }
      case 'SUPPLY_UPDATE': {
        const idx = serverDb.supplies.findIndex(s => s.id === recordId);
        if (idx >= 0) {
          const old = serverDb.supplies[idx];
          if ((version || 1) >= (old.version || 1)) {
            if (old.category === payload.category) {
              const diff = payload.quantity - old.quantity;
              const stock = serverDb.stocks[payload.category as StockCategory];
              if (stock) {
                stock.currentStock += diff;
                stock.totalReceived += diff;
              }
            } else {
              const oldStock = serverDb.stocks[old.category as StockCategory];
              if (oldStock) {
                oldStock.currentStock -= old.quantity;
                oldStock.totalReceived -= old.quantity;
              }
              const newStock = serverDb.stocks[payload.category as StockCategory];
              if (newStock) {
                newStock.currentStock += payload.quantity;
                newStock.totalReceived += payload.quantity;
              }
            }
            serverDb.supplies[idx] = { ...payload, syncStatus: 'synced' };
          }
        }
        break;
      }
      case 'DISPENSE_ADD': {
        const exists = serverDb.dispenses.some(d => d.id === recordId || d.transactionId === transactionId);
        if (!exists) {
          serverDb.dispenses.unshift({ ...payload, syncStatus: 'synced' });
          const stock = serverDb.stocks[payload.category as StockCategory];
          if (stock) {
            stock.currentStock -= payload.quantity;
            stock.totalDispensed += payload.quantity;
            stock.lastUpdated = new Date().toISOString();
          }
        }
        break;
      }
      case 'DISPENSE_UPDATE': {
        const idx = serverDb.dispenses.findIndex(d => d.id === recordId);
        if (idx >= 0) {
          const old = serverDb.dispenses[idx];
          if ((version || 1) >= (old.version || 1)) {
            if (old.category === payload.category) {
              const diff = payload.quantity - old.quantity;
              const stock = serverDb.stocks[payload.category as StockCategory];
              if (stock) {
                stock.currentStock -= diff; // if new quantity is larger, subtract more
                stock.totalDispensed += diff;
              }
            } else {
              const oldStock = serverDb.stocks[old.category as StockCategory];
              if (oldStock) {
                oldStock.currentStock += old.quantity;
                oldStock.totalDispensed -= old.quantity;
              }
              const newStock = serverDb.stocks[payload.category as StockCategory];
              if (newStock) {
                newStock.currentStock -= payload.quantity;
                newStock.totalDispensed += payload.quantity;
              }
            }
            serverDb.dispenses[idx] = { ...payload, syncStatus: 'synced' };
          }
        }
        break;
      }
      case 'DISPENSE_DELETE': {
        const idx = serverDb.dispenses.findIndex(d => d.id === recordId);
        if (idx >= 0) {
          const old = serverDb.dispenses[idx];
          const stock = serverDb.stocks[old.category];
          if (stock) {
            stock.currentStock += old.quantity;
            stock.totalDispensed -= old.quantity;
            stock.lastUpdated = new Date().toISOString();
          }
          serverDb.tombstones.push({
            recordId,
            recordType: 'dispense',
            transactionId: transactionId || 'unknown',
            deletedAt: new Date().toISOString(),
            version: version || 1
          });
          serverDb.dispenses.splice(idx, 1);
        }
        break;
      }
      case 'MANUAL_STOCK_ADJUSTMENT': {
        const cat = payload.category as StockCategory;
        const stock = serverDb.stocks[cat];
        if (stock) {
          const oldStock = stock.currentStock;
          const newActual = Number(payload.newActualStock) || 0;
          const diff = newActual - oldStock;
          const prevStockInPayload = typeof payload.previousStock === 'number'
            ? payload.previousStock
            : (typeof payload.oldStock === 'number' ? payload.oldStock : oldStock);

          // Conflict detection
          const hasConflictingAdjustment = prevStockInPayload !== oldStock && serverDb.auditLogs.some(a =>
            a.category === cat &&
            (a.operationType === 'MANUAL_STOCK_ADJUSTMENT' || a.action === 'تسوية رصيد جرد يدوي صريح') &&
            a.transactionId !== transactionId
          );

          if (hasConflictingAdjustment) {
            serverDb.auditLogs.unshift({
              id: `conflict-${Date.now()}`,
              timestamp: new Date().toISOString(),
              action: 'SYNC_CONFLICT',
              category: cat,
              details: `تعارض تسوية رصيد جرد بين جهازين للصنف (${cat})`,
              performedBy: payload.performedBy || 'نظام المراقبة',
              previousValue: oldStock,
              newValue: newActual,
              oldStock,
              newActualStock: newActual,
              difference: diff,
              reason: payload.reason,
              notes: 'تم رفض الاستبدال الصامت للرصيد الفعلي بسبب وجود تعارض جرد أوفلاين',
              transactionId,
              operationKey,
              deviceId: payload.deviceId || deviceId,
              operationType: 'MANUAL_STOCK_ADJUSTMENT'
            });
          } else {
            if (payload.reason === 'damaged' && diff < 0) {
              stock.damagedOrCancelled += Math.abs(diff);
            }
            stock.currentStock = newActual;
            stock.lastUpdated = new Date().toISOString();
            serverDb.auditLogs.unshift({
              id: payload.id || `audit-${Date.now()}`,
              timestamp: payload.timestamp || new Date().toISOString(),
              action: 'تسوية رصيد جرد يدوي صريح',
              category: cat,
              details: `تعديل الرصيد الفعلي من ${oldStock} إلى ${newActual}`,
              performedBy: payload.performedBy || 'غير محدد',
              previousValue: oldStock,
              newValue: newActual,
              oldStock,
              newActualStock: newActual,
              difference: diff,
              reason: payload.reason,
              notes: payload.notes || '',
              transactionId,
              operationKey,
              deviceId: payload.deviceId || deviceId,
              operationType: 'MANUAL_STOCK_ADJUSTMENT'
            });
          }
        }
        break;
      }
      case 'OPENING_BALANCE_SET': {
        const cat = payload.category as StockCategory;
        const qty = Number(payload.quantity) || 0;
        const stock = serverDb.stocks[cat];
        const hasExistingMovements = Boolean(
          stock && (
            stock.totalReceived > 0 ||
            stock.totalDispensed > 0 ||
            serverDb.supplies.some(s => !s.isDeleted && s.category === cat) ||
            serverDb.dispenses.some(d => !d.isDeleted && d.category === cat)
          )
        );
        const existingOb = serverDb.openingBalances?.[cat];
        const hasConflictingOb = Boolean(existingOb && existingOb.quantity !== qty && existingOb.quantity > 0);

        if (hasConflictingOb) {
          serverDb.auditLogs.unshift({
            id: `conflict-${Date.now()}`,
            timestamp: new Date().toISOString(),
            action: 'SYNC_CONFLICT',
            category: cat,
            details: `تعارض رصيد أول مدة`,
            performedBy: payload.inventoryKeeper || 'نظام المراقبة',
            previousValue: existingOb?.quantity,
            newValue: qty,
            reason: 'تعارض رصيد أول مدة بين الأجهزة',
            transactionId,
            operationKey,
            deviceId: payload.deviceId || deviceId,
            operationType: 'OPENING_BALANCE_SET'
          });
        } else {
          serverDb.openingBalances = serverDb.openingBalances || ({} as any);
          serverDb.openingBalances[cat] = {
            category: cat,
            quantity: qty,
            inventoryDate: payload.inventoryDate || new Date().toISOString().split('T')[0],
            inventoryKeeper: payload.inventoryKeeper || 'غير محدد',
            notes: payload.notes || ''
          };
          if (stock) {
            stock.openingStock = qty;
            if (!hasExistingMovements && stock.currentStock === 0 && stock.totalReceived === 0 && stock.totalDispensed === 0) {
              stock.currentStock = qty;
            }
            stock.lastUpdated = new Date().toISOString();
          }
          serverDb.auditLogs.unshift({
            id: payload.id || `audit-${Date.now()}`,
            timestamp: payload.timestamp || new Date().toISOString(),
            action: 'تحديد رصيد أول المدة',
            category: cat,
            details: `اعتماد رصيد أول المدة بقيمة ${qty}`,
            performedBy: payload.inventoryKeeper || 'غير محدد',
            newValue: qty,
            transactionId,
            operationKey,
            deviceId: payload.deviceId || deviceId,
            operationType: 'OPENING_BALANCE_SET'
          });
        }
        break;
      }
    }

    processedKeys.add(operationKey);
    acknowledgedKeys.push(operationKey);
  }

  return {
    status: 200,
    acknowledgedKeys,
    serverDb
  };
}

describe('Final Audit: اختبار سيناريوهات التدقيق الإلزامية الشاملة (Tests A - L)', () => {
  beforeEach(() => {
    storageMap.clear();
    clearPendingQueue();
  });

  // Test A: Supply → Sync → Sync مرة ثانية (Expected: عملية واحدة فقط)
  it('Test A: Supply → Sync → Sync مرة ثانية (Expected: عملية واحدة فقط)', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 100;
    saveDatabase(db);

    const clientDb = addSupply({
      date: '2026-03-01',
      documentNumber: 'SUP-001',
      category: 'birth_certificates',
      quantity: 50,
      receivedBy: 'أمين المخزن',
      supplierSource: 'مخزن المديرية'
    });

    assert.equal(clientDb.stocks.birth_certificates.currentStock, 150);

    const queue = getPendingQueue();
    assert.equal(queue.length, 1);
    const supplyTx = queue[0];

    // Server starts with stock 100
    const serverDb = createEmptyDatabase();
    serverDb.stocks.birth_certificates.currentStock = 100;
    serverDb.resetBoundary = { ...clientDb.resetBoundary };
    const processedKeys = new Set<string>();

    // First Sync
    const res1 = processTransactionsOnServer(serverDb, [supplyTx], processedKeys, clientDb.resetBoundary);
    assert.equal(res1.status, 200);
    assert.equal(res1.serverDb.stocks.birth_certificates.currentStock, 150);
    assert.equal(res1.serverDb.supplies.length, 1);

    // Second Sync (same transaction resent)
    const res2 = processTransactionsOnServer(res1.serverDb, [supplyTx], processedKeys, clientDb.resetBoundary);
    assert.equal(res2.status, 200);
    // MUST NOT duplicate! Current stock must remain 150
    assert.equal(res2.serverDb.stocks.birth_certificates.currentStock, 150);
    assert.equal(res2.serverDb.supplies.length, 1);
  });

  // Test B: Dispense → Sync → Sync مرة ثانية (Expected: خصم واحد فقط)
  it('Test B: Dispense → Sync → Sync مرة ثانية (Expected: خصم واحد فقط)', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 100;
    saveDatabase(db);

    const clientDb = addDispense({
      date: '2026-03-02',
      receiptNumber: 'DISP-001',
      category: 'birth_certificates',
      quantity: 15,
      citizenName: 'محمد أحمد',
      dispensedBy: 'الموظف المسئول',
      transactionType: 'birth',
      collectedAmount: 0
    });

    assert.equal(clientDb.stocks.birth_certificates.currentStock, 85);

    const queue = getPendingQueue();
    assert.equal(queue.length, 1);
    const dispenseTx = queue[0];

    // Server starts with stock 100
    const serverDb = createEmptyDatabase();
    serverDb.stocks.birth_certificates.currentStock = 100;
    serverDb.resetBoundary = { ...clientDb.resetBoundary };
    const processedKeys = new Set<string>();

    // First Sync
    const res1 = processTransactionsOnServer(serverDb, [dispenseTx], processedKeys, clientDb.resetBoundary);
    assert.equal(res1.status, 200);
    assert.equal(res1.serverDb.stocks.birth_certificates.currentStock, 85);

    // Second Sync
    const res2 = processTransactionsOnServer(res1.serverDb, [dispenseTx], processedKeys, clientDb.resetBoundary);
    assert.equal(res2.status, 200);
    // MUST NOT double-deduct! Stock remains 85
    assert.equal(res2.serverDb.stocks.birth_certificates.currentStock, 85);
    assert.equal(res2.serverDb.dispenses.length, 1);
  });

  // Test C: Update Dispense (Expected: تطبيق الفرق الصحيح مرة واحدة)
  it('Test C: Update Dispense (Expected: تطبيق الفرق الصحيح مرة واحدة)', () => {
    const db = createEmptyDatabase();
    db.stocks.health_cards_male.currentStock = 50;
    saveDatabase(db);

    addDispense({
      date: '2026-03-02',
      receiptNumber: 'HC-001',
      category: 'health_cards_male',
      quantity: 10,
      citizenName: 'علي حسن',
      dispensedBy: 'الموظف المسئول',
      transactionType: 'health_card_male',
      collectedAmount: 500
    });

    const added = loadDatabase().dispenses[0];
    assert.equal(loadDatabase().stocks.health_cards_male.currentStock, 40);

    // Update quantity from 10 to 14 (difference +4 deducted)
    updateDispense(added.id, { quantity: 14 });
    const afterUpdate = loadDatabase();
    assert.equal(afterUpdate.stocks.health_cards_male.currentStock, 36);

    // Now test on server
    const serverDb = createEmptyDatabase();
    serverDb.stocks.health_cards_male.currentStock = 50;
    serverDb.resetBoundary = { ...afterUpdate.resetBoundary };
    const processedKeys = new Set<string>();

    const queue = getPendingQueue();
    // Process all queue items (Add then Update)
    const res1 = processTransactionsOnServer(serverDb, queue, processedKeys, afterUpdate.resetBoundary);
    assert.equal(res1.serverDb.stocks.health_cards_male.currentStock, 36);

    // Replay queue
    const res2 = processTransactionsOnServer(res1.serverDb, queue, processedKeys, afterUpdate.resetBoundary);
    // Remains exactly 36
    assert.equal(res2.serverDb.stocks.health_cards_male.currentStock, 36);
  });

  // Test D: Delete Dispense (Expected: إعادة الكمية مرة واحدة)
  it('Test D: Delete Dispense (Expected: إعادة الكمية مرة واحدة)', () => {
    const db = createEmptyDatabase();
    db.stocks.death_certificates.currentStock = 40;
    saveDatabase(db);

    addDispense({
      date: '2026-03-03',
      receiptNumber: 'DTH-001',
      category: 'death_certificates',
      quantity: 5,
      citizenName: 'متوفى تجريبي',
      dispensedBy: 'الموظف',
      transactionType: 'death',
      collectedAmount: 0
    });

    const added = loadDatabase().dispenses[0];
    assert.equal(loadDatabase().stocks.death_certificates.currentStock, 35);

    // Delete dispense
    deleteDispense(added.id);
    const afterDelete = loadDatabase();
    assert.equal(afterDelete.stocks.death_certificates.currentStock, 40); // restored!
    assert.equal(afterDelete.dispenses.length, 0);

    // Test server sync with replay
    const serverDb = createEmptyDatabase();
    serverDb.stocks.death_certificates.currentStock = 40;
    serverDb.resetBoundary = { ...afterDelete.resetBoundary };
    const processedKeys = new Set<string>();

    const queue = getPendingQueue();
    const res1 = processTransactionsOnServer(serverDb, queue, processedKeys, afterDelete.resetBoundary);
    assert.equal(res1.serverDb.stocks.death_certificates.currentStock, 40);

    // Replay delete transaction
    const res2 = processTransactionsOnServer(res1.serverDb, queue, processedKeys, afterDelete.resetBoundary);
    // Quantity restored once only, remains 40, does not become 45
    assert.equal(res2.serverDb.stocks.death_certificates.currentStock, 40);
  });

  // Test E: Manual Stock Adjustment (Expected: تعديل واحد فقط + Audit)
  it('Test E: Manual Stock Adjustment (Expected: تعديل واحد فقط + Audit)', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 120;
    saveDatabase(db);

    const clientDb = manualAdjustStock(
      'birth_certificates',
      115,
      'damaged',
      'تلف 5 استمارات بسبب الرطوبة',
      'لجنة الجرد'
    );

    assert.equal(clientDb.stocks.birth_certificates.currentStock, 115);
    assert.equal(clientDb.stocks.birth_certificates.damagedOrCancelled, 5);

    const queue = getPendingQueue();
    const adjTx = queue.find(q => q.operationType === 'MANUAL_STOCK_ADJUSTMENT')!;
    assert.ok(adjTx);

    const serverDb = createEmptyDatabase();
    serverDb.stocks.birth_certificates.currentStock = 120;
    serverDb.resetBoundary = { ...clientDb.resetBoundary };
    const processedKeys = new Set<string>();

    const res1 = processTransactionsOnServer(serverDb, [adjTx], processedKeys, clientDb.resetBoundary);
    assert.equal(res1.serverDb.stocks.birth_certificates.currentStock, 115);
    assert.equal(res1.serverDb.stocks.birth_certificates.damagedOrCancelled, 5);
  });

  // Test F: إرسال Manual Adjustment مرتين (Expected: Idempotent، لا يوجد خصم/زيادة ثانية)
  it('Test F: إرسال Manual Adjustment مرتين (Expected: Idempotent، لا يوجد خصم/زيادة ثانية)', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 100;
    saveDatabase(db);

    const clientDb = manualAdjustStock(
      'birth_certificates',
      90,
      'damaged',
      'تلف 10 استمارات',
      'لجنة الجرد'
    );

    const queue = getPendingQueue();
    const adjTx = queue.find(q => q.operationType === 'MANUAL_STOCK_ADJUSTMENT')!;

    const serverDb = createEmptyDatabase();
    serverDb.stocks.birth_certificates.currentStock = 100;
    serverDb.resetBoundary = { ...clientDb.resetBoundary };
    const processedKeys = new Set<string>();

    // First arrival
    const res1 = processTransactionsOnServer(serverDb, [adjTx], processedKeys, clientDb.resetBoundary);
    assert.equal(res1.serverDb.stocks.birth_certificates.currentStock, 90);
    assert.equal(res1.serverDb.stocks.birth_certificates.damagedOrCancelled, 10);

    // Second arrival of the same transaction
    const res2 = processTransactionsOnServer(res1.serverDb, [adjTx], processedKeys, clientDb.resetBoundary);
    assert.equal(res2.serverDb.stocks.birth_certificates.currentStock, 90);
    // Damaged counter must NOT be added again (must stay 10, not 20)
    assert.equal(res2.serverDb.stocks.birth_certificates.damagedOrCancelled, 10);
  });

  // Test G: عمليتان متعارضتان (Expected: Conflict وليس Last Write Wins)
  it('Test G: عمليتان متعارضتان (Expected: Conflict وليس Last Write Wins)', () => {
    const serverDb = createEmptyDatabase();
    serverDb.stocks.birth_certificates.currentStock = 100;
    const processedKeys = new Set<string>();
    const resetBoundary = { ...serverDb.resetBoundary };

    // Device A adjusted stock to 110 based on baseline 100
    const txA: SyncTransactionItem = {
      transactionId: 'tx-adj-A',
      operationKey: 'MANUAL_STOCK_ADJUSTMENT:adj-A:1',
      recordId: 'adj-A',
      operationType: 'MANUAL_STOCK_ADJUSTMENT',
      version: 1,
      updatedAt: '2026-03-01T10:00:00Z',
      deviceId: 'device-A',
      resetBoundary,
      payload: {
        id: 'adj-A',
        category: 'birth_certificates',
        previousStock: 100,
        oldStock: 100,
        newActualStock: 110,
        difference: 10,
        reason: 'inventory_surplus',
        notes: 'جرد جهاز أ',
        performedBy: 'مفتش أ',
        timestamp: '2026-03-01T10:00:00Z',
        transactionId: 'tx-adj-A',
        operationKey: 'MANUAL_STOCK_ADJUSTMENT:adj-A:1',
        deviceId: 'device-A'
      }
    };

    // Process Device A
    processTransactionsOnServer(serverDb, [txA], processedKeys, resetBoundary, 'device-A');
    assert.equal(serverDb.stocks.birth_certificates.currentStock, 110);

    // Device B adjusted stock to 80 while offline, based on the old baseline of 100!
    const txB: SyncTransactionItem = {
      transactionId: 'tx-adj-B',
      operationKey: 'MANUAL_STOCK_ADJUSTMENT:adj-B:1',
      recordId: 'adj-B',
      operationType: 'MANUAL_STOCK_ADJUSTMENT',
      version: 1,
      updatedAt: '2026-03-01T10:05:00Z',
      deviceId: 'device-B',
      resetBoundary,
      payload: {
        id: 'adj-B',
        category: 'birth_certificates',
        previousStock: 100, // Baseline mismatch with current stock (110)
        oldStock: 100,
        newActualStock: 80,
        difference: -20,
        reason: 'inventory_deficit',
        notes: 'جرد جهاز ب وهو غير متصل',
        performedBy: 'مفتش ب',
        timestamp: '2026-03-01T10:05:00Z',
        transactionId: 'tx-adj-B',
        operationKey: 'MANUAL_STOCK_ADJUSTMENT:adj-B:1',
        deviceId: 'device-B'
      }
    };

    // Process Device B
    processTransactionsOnServer(serverDb, [txB], processedKeys, resetBoundary, 'device-B');

    // Conflict must be registered, NOT silently overwriting stock to 80!
    assert.equal(serverDb.stocks.birth_certificates.currentStock, 110);
    const conflictLog = serverDb.auditLogs.find(a => a.action === 'SYNC_CONFLICT');
    assert.ok(conflictLog, 'يجب تسجيل تقرير النزاع SYNC_CONFLICT');
    assert.equal(conflictLog?.category, 'birth_certificates');
  });

  // Test H: Opening Balance مع وجود حركات حقيقية (Expected: رفض استبدال currentStock)
  it('Test H: Opening Balance مع وجود حركات حقيقية (Expected: رفض استبدال currentStock)', () => {
    const serverDb = createEmptyDatabase();
    // Establish running stock with movements
    serverDb.stocks.birth_certificates.currentStock = 250;
    serverDb.stocks.birth_certificates.totalReceived = 300;
    serverDb.stocks.birth_certificates.totalDispensed = 50;
    serverDb.supplies.push({
      id: 'sup-existing',
      transactionId: 'tx-sup-existing',
      date: '2026-03-01',
      documentNumber: 'DOC-01',
      category: 'birth_certificates',
      quantity: 300,
      supplierSource: 'المخزن الإقليمي',
      receivedBy: 'أمين المخزن',
      version: 1,
      updatedAt: '2026-03-01T08:00:00Z',
      syncStatus: 'synced'
    });

    const processedKeys = new Set<string>();
    const resetBoundary = { ...serverDb.resetBoundary };

    // Arriving OPENING_BALANCE_SET attempting to set quantity 50
    const opbTx: SyncTransactionItem = {
      transactionId: 'tx-opb-1',
      operationKey: 'OPENING_BALANCE_SET:opb-1:1',
      recordId: 'opb-1',
      operationType: 'OPENING_BALANCE_SET',
      version: 1,
      updatedAt: '2026-03-02T10:00:00Z',
      deviceId: 'device-C',
      resetBoundary,
      payload: {
        id: 'opb-1',
        category: 'birth_certificates',
        quantity: 50,
        inventoryDate: '2026-03-02',
        inventoryKeeper: 'المراقب',
        notes: 'رصيد افتتاحي متأخر',
        transactionId: 'tx-opb-1'
      }
    };

    processTransactionsOnServer(serverDb, [opbTx], processedKeys, resetBoundary, 'device-C');

    // Opening stock property is updated, but currentStock MUST NOT be replaced with 50!
    assert.equal(serverDb.stocks.birth_certificates.openingStock, 50);
    assert.equal(serverDb.stocks.birth_certificates.currentStock, 250, 'يجب حماية الرصيد الفعلي الحالي وعدم استبداله');
  });

  // Test I: Factory Reset (Expected: resetId جديد)
  it('Test I: Factory Reset (Expected: resetId جديد وفريد)', () => {
    const initialDb = createEmptyDatabase();
    const oldResetId = initialDb.resetBoundary.resetId;
    assert.ok(oldResetId, 'يوجد resetId ابتدائي');

    const resetDb = executeFactoryReset('مدير النظام المعتمد');
    assert.ok(resetDb.resetBoundary.resetId, 'تم إنشاء resetId جديد');
    assert.notEqual(resetDb.resetBoundary.resetId, oldResetId, 'resetId الجديد فريد ومختلف عن القديم');
    assert.equal(resetDb.supplies.length, 0);
    assert.equal(resetDb.dispenses.length, 0);
    assert.equal(resetDb.stocks.birth_certificates.currentStock, 0);
  });

  // Test J: جهاز Offline قديم بعد Factory Reset (Expected: STALE / REJECT)
  it('Test J: جهاز Offline قديم بعد Factory Reset (Expected: STALE / REJECT)', () => {
    // 1. Pre-reset server
    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = {
      resetId: 'rst-session-1',
      resetTimestamp: '2026-03-01T08:00:00Z',
      resetBy: 'مدير النظام'
    };

    // Old offline client from session 1
    const oldClientResetBoundary = {
      resetId: 'rst-session-1',
      resetTimestamp: '2026-03-01T08:00:00Z',
      resetBy: 'مدير النظام'
    };

    const staleTransaction: SyncTransactionItem = {
      transactionId: 'tx-stale-1',
      operationKey: 'SUPPLY_ADD:sup-old:1',
      recordId: 'sup-old',
      operationType: 'SUPPLY_ADD',
      version: 1,
      updatedAt: '2026-03-01T09:00:00Z',
      deviceId: 'device-offline',
      resetBoundary: oldClientResetBoundary,
      payload: {
        id: 'sup-old',
        category: 'birth_certificates',
        quantity: 500,
        transactionId: 'tx-stale-1'
      }
    };

    // 2. Factory Reset is performed on server -> new resetId
    serverDb.resetBoundary = {
      resetId: 'rst-session-2-brand-new',
      resetTimestamp: '2026-03-02T12:00:00Z',
      resetBy: 'مدير النظام - ضبط مصنع معتمد'
    };
    serverDb.stocks.birth_certificates.currentStock = 0;

    const processedKeys = new Set<string>();

    // 3. Old offline client comes online and submits stale transaction
    const res = processTransactionsOnServer(
      serverDb,
      [staleTransaction],
      processedKeys,
      oldClientResetBoundary,
      'device-offline'
    );

    // MUST reject with HTTP 409 RESET_BOUNDARY_VIOLATION
    assert.equal(res.status, 409);
    assert.equal(res.error, 'RESET_BOUNDARY_VIOLATION');
    // Database must remain untainted: currentStock stays 0
    assert.equal(res.serverDb.stocks.birth_certificates.currentStock, 0);
    assert.equal(res.serverDb.supplies.length, 0);
  });

  // Test K: Repair (Expected: تشخيص فقط، دون إعادة حساب currentStock)
  it('Test K: Repair (Expected: تشخيص فقط، دون إعادة حساب currentStock)', () => {
    const localDb = createEmptyDatabase();
    // Simulate stock discrepancy: currentStock is 100, but supply sum is 150
    localDb.stocks.birth_certificates.currentStock = 100;
    localDb.stocks.birth_certificates.openingStock = 0;
    localDb.stocks.birth_certificates.totalReceived = 150;
    localDb.supplies.push({
      id: 'sup-rep-1',
      transactionId: 'tx-sup-rep-1',
      documentNumber: 'SUP-99',
      date: '2026-03-01',
      category: 'birth_certificates',
      quantity: 150,
      receivedBy: 'أمين المخزن',
      supplierSource: 'المديرية',
      version: 1,
      updatedAt: '2026-03-01T08:00:00Z'
    });

    const report = executeProductionRepair(localDb);

    // Diagnostic report detects difference
    assert.ok(report, 'تم توليد تقرير الفحص التشخيصي');
    assert.equal(report.isDiagnosticOnly, true, 'الفحص تشخيصي بحت دون تعديل تلقائي');
    assert.ok(report.stockDiscrepancies.some(b => b.category === 'birth_certificates'), 'اكتشف الفرق بين الرصيد الفعلي وحركة التوريد');
    // CRITICAL: currentStock MUST NOT be modified or recalculated by repair engine!
    assert.equal(localDb.stocks.birth_certificates.currentStock, 100, 'الرصيد الفعلي لم يتغير ولم يستبدل تلقائياً');
  });

  // Test L: Production startup (Expected: لا Demo / Seed / Mock records)
  it('Test L: Production startup (Expected: لا Demo / Seed / Mock records)', () => {
    const emptyDb = createEmptyDatabase();

    // Verify zero counts across all collections
    assert.equal(emptyDb.supplies.length, 0);
    assert.equal(emptyDb.dispenses.length, 0);
    assert.equal(emptyDb.lateRegistrations.length, 0);
    assert.equal(emptyDb.tombstones.length, 0);

    // Verify all stock categories are zero initialized
    for (const cat of STOCK_CATEGORIES) {
      const s = emptyDb.stocks[cat];
      assert.ok(s, `الصنف ${cat} موجود`);
      assert.equal(s.currentStock, 0, `الرصيد الفعلي للصنف ${cat} يجب أن يكون صفر`);
      assert.equal(s.openingStock, 0);
      assert.equal(s.totalReceived, 0);
      assert.equal(s.totalDispensed, 0);
      assert.equal(s.damagedOrCancelled, 0);
    }

    // Verify no mock employee name
    assert.equal(emptyDb.officeSettings.currentEmployee, 'غير محدد');

    // Loading from fresh storage must produce clean state
    storageMap.clear();
    const loaded = loadDatabase();
    assert.equal(loaded.supplies.length, 0);
    assert.equal(loaded.dispenses.length, 0);
    assert.equal(loaded.stocks.birth_certificates.currentStock, 0);
    assert.equal(loaded.officeSettings.currentEmployee, 'غير محدد');
  });

  // Test M: التقارير Read-Only (Expected: فتح التقرير لا ينشئ أي حركة أو يعدل أي رصيد)
  it('Test M: التقارير Read-Only (Expected: فتح التقرير لا ينشئ أي حركة أو يعدل أي رصيد)', () => {
    const db = createEmptyDatabase();
    db.stocks.health_cards_male.currentStock = 77;
    db.stocks.health_cards_male.openingStock = 50;
    db.stocks.health_cards_male.totalReceived = 50;
    db.stocks.health_cards_male.totalDispensed = 23;
    db.dispenses.push({
      id: 'd-rep-1',
      transactionId: 'tx-rep-1',
      date: '2026-03-05',
      receiptNumber: 'HC-01',
      category: 'health_cards_male',
      quantity: 23,
      citizenName: 'مواطن تجريبي',
      dispensedBy: 'الموظف',
      transactionType: 'health_card_male',
      collectedAmount: 1150,
      version: 1,
      updatedAt: '2026-03-05T10:00:00Z',
      syncStatus: 'synced'
    });
    saveDatabase(db);

    const beforeJson = JSON.stringify(db);

    // Generate monthly report multiple times
    const report1 = generateOfficialMonthlyReport(db, 2026, 3);
    const report2 = generateOfficialMonthlyReport(db, 2026, 3);

    // Verify report output
    assert.equal(report1.vitalStats.healthCardsMaleTotal, 23);
    assert.equal(report1.vitalStats.healthCardsTotal, 23);
    assert.equal(report1.vitalStats.birthCertificatesTotal, 0, 'البطاقات الصحية لا تعد مواليد');

    // Strict immutability check
    const afterJson = JSON.stringify(db);
    assert.equal(beforeJson, afterJson, 'توليد التقرير لم يغير أي بايت في قاعدة البيانات');
    assert.equal(db.stocks.health_cards_male.currentStock, 77);
  });
});
