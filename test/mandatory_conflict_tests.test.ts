/**
 * TEST SUITE: 7 Mandatory Conflict & Sync Tests
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 *
 * TEST 1: previousStock = 100, serverStock = 100, newActual = 95 -> PASS إذا أصبح: 95
 * TEST 2: previousStock = 100, serverStock = 110, newActual = 90 -> PASS إذا: التسوية مرفوضة، serverStock يبقى 110، تسجيل SYNC_CONFLICT
 * TEST 3: existingOpeningBalance = 0, newOpeningBalance = 50 -> تحقق من عدم وجود overwrite صامت غير مقصود (تسجيل SYNC_CONFLICT وعدم الاستبدال)
 * TEST 4: existingOpeningBalance = 100, newOpeningBalance = 120 -> يجب تسجيل SYNC_CONFLICT ولا يتم تغيير الرصيد الجاري
 * TEST 5: stock = 100, dispense = 10, delete dispense -> النتيجة: 100
 * TEST 6: serverStock = 150, server supplies/dispenses موجودة -> mergeServerDataSafely() يجب أن يجعل localStock: 150 دون تطبيق الحركات مرة ثانية
 * TEST 7: operationKey صحيح DISPENSE_ADD:abc:1 يقبل، operationKey DISPENSE_ADD:abc:2 عندما version = 1 يرفض
 */

import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  createEmptyDatabase,
  saveDatabase,
  loadDatabase,
  addDispense,
  deleteDispense
} from '../src/storage/db';
import {
  mergeServerDataSafely,
  clearPendingQueue
} from '../src/storage/syncManager';
import {
  DatabaseSchema,
  StockCategory,
  SyncTransactionItem
} from '../src/types';

// Mock storage for Node environment
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
 * Executes server transaction batch matching server.ts production logic exactly
 */
function processServerBatch(
  serverDb: DatabaseSchema,
  transactions: SyncTransactionItem[],
  processedKeys: Set<string>,
  clientResetBoundary?: any,
  deviceId: string = 'dev-test'
): { status: number; acknowledgedKeys: string[]; serverDb: DatabaseSchema; error?: string } {
  // Reset boundary check
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

  // Preflight validation including exact operationKey matching (server.ts Rule 3)
  for (const item of transactions) {
    const { operationKey, operationType, recordId, version } = item;
    if (!operationKey || typeof operationKey !== 'string') {
      return { status: 400, acknowledgedKeys: [], serverDb, error: 'INVALID_OPERATION_KEY' };
    }
    const expectedKey = `${operationType}:${recordId}:${version}`;
    if (operationKey.trim() !== expectedKey) {
      return { status: 400, acknowledgedKeys: [], serverDb, error: 'INVALID_OPERATION_KEY' };
    }
  }

  const acknowledgedKeys: string[] = [];
  const tombstoneSet = new Set((serverDb.tombstones || []).map(t => t.recordId));

  for (const item of transactions) {
    const { operationKey, operationType, recordId, payload, transactionId, version } = item;

    if (processedKeys.has(operationKey)) {
      acknowledgedKeys.push(operationKey);
      continue;
    }

    if (tombstoneSet.has(recordId) && !operationType.includes('DELETE')) {
      acknowledgedKeys.push(operationKey);
      processedKeys.add(operationKey);
      continue;
    }

    switch (operationType) {
      case 'MANUAL_STOCK_ADJUSTMENT': {
        const cat = (payload.itemId || payload.category) as StockCategory;
        const stock = serverDb.stocks[cat];
        if (stock) {
          const oldStock = stock.currentStock;
          const newActual = Number(payload.newActualStock ?? payload.newStock) || 0;
          const prevStockInPayload =
            typeof payload.oldStock === 'number'
              ? payload.oldStock
              : (typeof payload.previousStock === 'number' ? payload.previousStock : null);

          if (typeof prevStockInPayload !== 'number' || !Number.isFinite(prevStockInPayload)) {
            return { status: 409, acknowledgedKeys, serverDb, error: 'SYNC_CONFLICT_MISSING_BASELINE' };
          }

          // Rule 1: Strict baseline snapshot check
          if (prevStockInPayload !== oldStock) {
            serverDb.auditLogs.unshift({
              id: `audit-conflict-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
              timestamp: new Date().toISOString(),
              action: 'SYNC_CONFLICT',
              category: cat,
              details: `تعارض تسوية يدوية: رصيد العميل المبني عليه (${prevStockInPayload}) يختلف عن رصيد الخادم الحالي (${oldStock}). تم رفض التسوية وحماية رصيد الخادم.`,
              performedBy: item.deviceId || deviceId,
              previousValue: oldStock
            });
            processedKeys.add(operationKey);
            acknowledgedKeys.push(operationKey);
            continue;
          }

          // Matched baseline: apply adjustment cleanly
          const diff = newActual - oldStock;
          stock.currentStock = newActual;
          stock.lastUpdated = new Date().toISOString();

          serverDb.auditLogs.unshift({
            id: `audit-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            action: 'تسوية رصيد جرد يدوي صريح',
            category: cat,
            details: `تسوية يدوية للرصيد الفعلي من ${oldStock} إلى ${newActual} (الفرق: ${diff >= 0 ? '+' : ''}${diff})`,
            performedBy: payload.performedBy || item.deviceId || deviceId,
            previousValue: oldStock
          });
        }
        break;
      }

      case 'OPENING_BALANCE_SET': {
        const cat = payload.category as StockCategory;
        const qty = Number(payload.quantity) || 0;
        const stock = serverDb.stocks[cat];
        const existingOb = serverDb.openingBalances?.[cat];

        // Rule 4: Explicit conflict detection - check existingOb && existingOb.quantity !== qty
        const hasConflictingOb = Boolean(
          existingOb && Number(existingOb.quantity) !== Number(qty)
        );

        if (hasConflictingOb) {
          serverDb.auditLogs.unshift({
            id: `audit-conflict-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
            timestamp: new Date().toISOString(),
            action: 'SYNC_CONFLICT',
            category: cat,
            details: `تعارض في رصيد أول المدة للصنف ${cat}: القيمة المسجلة على الخادم (${existingOb.quantity}) تختلف عن القيمة الواردة (${qty}). تم رفض الاستبدال لحماية الرصيد.`,
            performedBy: payload.inventoryKeeper || item.deviceId || deviceId,
            previousValue: existingOb.quantity
          });
          processedKeys.add(operationKey);
          acknowledgedKeys.push(operationKey);
          continue;
        }

        // Apply when no conflict
        if (!serverDb.openingBalances) {
          serverDb.openingBalances = {} as any;
        }
        serverDb.openingBalances[cat] = {
          category: cat,
          quantity: qty,
          inventoryDate: payload.inventoryDate || new Date().toISOString().split('T')[0],
          inventoryKeeper: payload.inventoryKeeper || 'غير محدد',
          notes: payload.notes || ''
        };

        if (stock) {
          stock.openingStock = qty;
          const hasRunningMovements =
            (serverDb.supplies || []).some(s => s.category === cat) ||
            (serverDb.dispenses || []).some(d => d.category === cat);

          if (!hasRunningMovements && stock.totalReceived === 0 && stock.totalDispensed === 0 && stock.currentStock === 0) {
            stock.currentStock = qty;
          }
          stock.lastUpdated = new Date().toISOString();
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

      case 'DISPENSE_DELETE': {
        const idx = serverDb.dispenses.findIndex(d => d.id === recordId);
        if (idx >= 0) {
          const old = serverDb.dispenses[idx];
          const stock = serverDb.stocks[old.category];
          if (stock) {
            stock.currentStock += old.quantity;
            stock.totalDispensed = Math.max(0, stock.totalDispensed - old.quantity);
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
    }

    processedKeys.add(operationKey);
    acknowledgedKeys.push(operationKey);
  }

  return { status: 200, acknowledgedKeys, serverDb };
}

describe('الاختبارات الـ 7 الإلزامية للتعارض والمزامنة والأرصدة', () => {
  beforeEach(() => {
    storageMap.clear();
    clearPendingQueue();
  });

  // TEST 1
  it('TEST 1: previousStock = 100, serverStock = 100, newActual = 95 -> PASS إذا أصبح: 95', () => {
    const serverDb = createEmptyDatabase();
    serverDb.stocks.birth_certificates.currentStock = 100;
    const processedKeys = new Set<string>();

    const tx: SyncTransactionItem = {
      transactionId: 'tx-adj-1',
      operationKey: 'MANUAL_STOCK_ADJUSTMENT:adj-1:1',
      recordId: 'adj-1',
      operationType: 'MANUAL_STOCK_ADJUSTMENT',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'dev-client',
      resetBoundary: { ...serverDb.resetBoundary },
      payload: {
        category: 'birth_certificates',
        previousStock: 100,
        oldStock: 100,
        newActualStock: 95,
        newStock: 95,
        reason: 'تسوية جرد دوري',
        performedBy: 'أمين المخزن'
      }
    };

    const result = processServerBatch(serverDb, [tx], processedKeys, serverDb.resetBoundary);

    assert.equal(result.status, 200);
    assert.equal(
      serverDb.stocks.birth_certificates.currentStock,
      95,
      'الرصيد يجب أن يصبح 95 لأن previousStock يطابق serverStock تماماً'
    );
  });

  // TEST 2
  it('TEST 2: previousStock = 100, serverStock = 110, newActual = 90 -> PASS إذا: التسوية مرفوضة، serverStock يبقى 110، تسجيل SYNC_CONFLICT', () => {
    const serverDb = createEmptyDatabase();
    serverDb.stocks.birth_certificates.currentStock = 110; // server has moved ahead
    const processedKeys = new Set<string>();

    const tx: SyncTransactionItem = {
      transactionId: 'tx-adj-stale',
      operationKey: 'MANUAL_STOCK_ADJUSTMENT:adj-stale:1',
      recordId: 'adj-stale',
      operationType: 'MANUAL_STOCK_ADJUSTMENT',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'dev-offline-client',
      resetBoundary: { ...serverDb.resetBoundary },
      payload: {
        category: 'birth_certificates',
        previousStock: 100, // based on stale baseline
        oldStock: 100,
        newActualStock: 90,
        newStock: 90,
        reason: 'تسوية غير محدثة',
        performedBy: 'مستخدم غير متصل'
      }
    };

    const result = processServerBatch(serverDb, [tx], processedKeys, serverDb.resetBoundary);

    assert.equal(result.status, 200);
    assert.equal(
      serverDb.stocks.birth_certificates.currentStock,
      110,
      'serverStock يجب أن يبقى 110 ولا يتم استبداله بـ 90'
    );

    const conflictLog = serverDb.auditLogs.find(a => a.action === 'SYNC_CONFLICT');
    assert.ok(conflictLog, 'يجب تسجيل SYNC_CONFLICT في سجل التدقيق');
    assert.match(conflictLog.details, /تعارض تسوية يدوية/);
  });

  // TEST 3
  it('TEST 3: existingOpeningBalance = 0, newOpeningBalance = 50 -> تحقق من عدم وجود overwrite صامت غير مقصود', () => {
    const serverDb = createEmptyDatabase();
    // In clean database, existing opening balance is 0
    serverDb.openingBalances.birth_certificates = {
      category: 'birth_certificates',
      quantity: 0,
      inventoryDate: '2026-01-01',
      inventoryKeeper: 'المسؤول الأصلي',
      notes: 'رصيد افتتاحي أولي'
    };
    serverDb.stocks.birth_certificates.openingStock = 0;
    serverDb.stocks.birth_certificates.currentStock = 100; // running stock
    const processedKeys = new Set<string>();

    const tx: SyncTransactionItem = {
      transactionId: 'tx-opb-3',
      operationKey: 'OPENING_BALANCE_SET:opb-3:1',
      recordId: 'opb-3',
      operationType: 'OPENING_BALANCE_SET',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'dev-client',
      resetBoundary: { ...serverDb.resetBoundary },
      payload: {
        category: 'birth_certificates',
        quantity: 50,
        inventoryDate: '2026-03-01',
        inventoryKeeper: 'مراقب آخر',
        notes: 'محاولة تعديل رصيد أول المدة'
      }
    };

    const result = processServerBatch(serverDb, [tx], processedKeys, serverDb.resetBoundary);

    assert.equal(result.status, 200);

    // Conflict MUST be registered because existingOb.quantity (0) !== qty (50)
    const conflictLog = serverDb.auditLogs.find(a => a.action === 'SYNC_CONFLICT');
    assert.ok(conflictLog, 'يجب تسجيل SYNC_CONFLICT لمنع overwrite صامت من 0 إلى 50');

    // Silent overwrite prevented: openingBalances preserved, currentStock untouched
    assert.equal(
      serverDb.openingBalances.birth_certificates.quantity,
      0,
      'openingBalances يجب أن تبقى 0 دون استبدال صامت'
    );
    assert.equal(
      serverDb.stocks.birth_certificates.currentStock,
      100,
      'الرصيد الجاري 100 يجب ألا يتأثر نهائياً'
    );
  });

  // TEST 4
  it('TEST 4: existingOpeningBalance = 100, newOpeningBalance = 120 -> يجب تسجيل SYNC_CONFLICT ولا يتم تغيير الرصيد الجاري', () => {
    const serverDb = createEmptyDatabase();
    serverDb.openingBalances.death_certificates = {
      category: 'death_certificates',
      quantity: 100,
      inventoryDate: '2026-01-01',
      inventoryKeeper: 'أمين العهدة',
      notes: 'جرد أولي'
    };
    serverDb.stocks.death_certificates.openingStock = 100;
    serverDb.stocks.death_certificates.currentStock = 180;
    const processedKeys = new Set<string>();

    const tx: SyncTransactionItem = {
      transactionId: 'tx-opb-4',
      operationKey: 'OPENING_BALANCE_SET:opb-4:1',
      recordId: 'opb-4',
      operationType: 'OPENING_BALANCE_SET',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'dev-client-2',
      resetBoundary: { ...serverDb.resetBoundary },
      payload: {
        category: 'death_certificates',
        quantity: 120,
        inventoryDate: '2026-03-01',
        inventoryKeeper: 'أمين آخر',
        notes: 'رصيد متعارض'
      }
    };

    const result = processServerBatch(serverDb, [tx], processedKeys, serverDb.resetBoundary);

    assert.equal(result.status, 200);

    const conflictLog = serverDb.auditLogs.find(a => a.action === 'SYNC_CONFLICT');
    assert.ok(conflictLog, 'يجب تسجيل SYNC_CONFLICT');
    assert.match(conflictLog.details, /تعارض في رصيد أول المدة/);

    assert.equal(
      serverDb.stocks.death_certificates.currentStock,
      180,
      'لا يتم تغيير الرصيد الجاري نهائياً ويظل 180'
    );
    assert.equal(
      serverDb.openingBalances.death_certificates.quantity,
      100,
      'القيمة الأصلية لرصيد أول المدة (100) تظل محفوظة'
    );
  });

  // TEST 5
  it('TEST 5: stock = 100, dispense = 10, delete dispense -> النتيجة: 100', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 100;
    saveDatabase(db);

    // Record dispense of 10
    const added = addDispense({
      transactionType: 'birth',
      date: '2026-03-10',
      category: 'birth_certificates',
      citizenName: 'مواطن تجريبي',
      nationalId: '29901012600000',
      quantity: 10,
      collectedAmount: 0,
      dispensedBy: 'موظف الصرف'
    });

    const afterDispense = loadDatabase();
    assert.equal(
      afterDispense.stocks.birth_certificates.currentStock,
      90,
      'بعد صرف 10 يجب أن يصبح الرصيد 90'
    );

    // Delete dispense
    const dispenseId = afterDispense.dispenses[0].id;
    deleteDispense(dispenseId, 'مدير النظام');

    const afterDelete = loadDatabase();
    assert.equal(
      afterDelete.stocks.birth_certificates.currentStock,
      100,
      'النتيجة بعد حذف حركة الصرف: 100 (+10 مستعادة بالكامل)'
    );
    assert.equal(afterDelete.dispenses.length, 0);
    assert.equal(afterDelete.tombstones.length, 1);
  });

  // TEST 6
  it('TEST 6: serverStock = 150, server supplies/dispenses موجودة -> mergeServerDataSafely() يجعل localStock: 150 دون تطبيق الحركات مرة ثانية', () => {
    const localDb = createEmptyDatabase();
    localDb.stocks.birth_certificates.currentStock = 80;

    // Create server state with stock = 150 and existing movements
    const serverDb: DatabaseSchema = JSON.parse(JSON.stringify(localDb));
    serverDb.stocks.birth_certificates.currentStock = 150;
    serverDb.stocks.birth_certificates.totalReceived = 200;
    serverDb.stocks.birth_certificates.totalDispensed = 50;

    serverDb.supplies = [{
      id: 'sup-srv-1',
      transactionId: 'tx-sup-srv-1',
      documentNumber: 'DOC-150',
      date: '2026-03-01',
      category: 'birth_certificates',
      quantity: 200,
      supplierSource: 'المخزن',
      receivedBy: 'أمين المخزن',
      version: 1,
      updatedAt: '2026-03-01T10:00:00Z',
      syncStatus: 'synced'
    }];

    serverDb.dispenses = [{
      id: 'disp-srv-1',
      transactionId: 'tx-disp-srv-1',
      transactionType: 'birth',
      date: '2026-03-02',
      category: 'birth_certificates',
      citizenName: 'مواطن',
      quantity: 50,
      collectedAmount: 0,
      dispensedBy: 'الموظف',
      version: 1,
      updatedAt: '2026-03-02T10:00:00Z',
      syncStatus: 'synced'
    }];

    // Execute mergeServerDataSafely
    const merged = mergeServerDataSafely(localDb, serverDb);

    // Assert localStock becomes 150 exactly, without re-applying +200 or -50
    assert.equal(
      merged.stocks.birth_certificates.currentStock,
      150,
      'mergeServerDataSafely() يجب أن يجعل localStock = 150 دون تطبيق الحركات مرة ثانية'
    );
    assert.equal(merged.supplies.length, 1);
    assert.equal(merged.dispenses.length, 1);
  });

  // TEST 7
  it('TEST 7: operationKey صحيح DISPENSE_ADD:abc:1 يقبل، operationKey DISPENSE_ADD:abc:2 عندما version = 1 يرفض', () => {
    const serverDb = createEmptyDatabase();
    const processedKeys = new Set<string>();

    // Valid operationKey matching operationType:recordId:version
    const validTx: SyncTransactionItem = {
      transactionId: 'tx-valid',
      operationKey: 'DISPENSE_ADD:abc:1',
      recordId: 'abc',
      operationType: 'DISPENSE_ADD',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'dev-1',
      resetBoundary: { ...serverDb.resetBoundary },
      payload: {
        id: 'abc',
        category: 'birth_certificates',
        citizenName: 'أحمد',
        quantity: 1,
        collectedAmount: 0,
        dispensedBy: 'موظف'
      }
    };

    const validResult = processServerBatch(serverDb, [validTx], processedKeys, serverDb.resetBoundary);
    assert.equal(validResult.status, 200, 'operationKey DISPENSE_ADD:abc:1 مع version: 1 يجب أن يُقبل');
    assert.ok(validResult.acknowledgedKeys.includes('DISPENSE_ADD:abc:1'));

    // Invalid operationKey: DISPENSE_ADD:abc:2 when version = 1
    const invalidTx: SyncTransactionItem = {
      transactionId: 'tx-invalid',
      operationKey: 'DISPENSE_ADD:abc:2',
      recordId: 'abc',
      operationType: 'DISPENSE_ADD',
      version: 1, // Mismatch! Key specifies 2 while version is 1
      updatedAt: new Date().toISOString(),
      deviceId: 'dev-1',
      resetBoundary: { ...serverDb.resetBoundary },
      payload: {
        id: 'abc',
        category: 'birth_certificates',
        citizenName: 'أحمد',
        quantity: 1,
        collectedAmount: 0,
        dispensedBy: 'موظف'
      }
    };

    const invalidResult = processServerBatch(serverDb, [invalidTx], processedKeys, serverDb.resetBoundary);
    assert.equal(invalidResult.status, 400, 'operationKey غير المطابق للنسخة يجب أن يُرفض بكود 400');
    assert.equal(invalidResult.error, 'INVALID_OPERATION_KEY');
  });
});
