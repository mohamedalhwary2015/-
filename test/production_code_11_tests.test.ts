/**
 * PRODUCTION CODE DIRECT VERIFICATION SUITE (11 CRITICAL TESTS)
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 *
 * This test suite executes against the ACTUAL PRODUCTION CODE:
 * - Real Express app endpoints in server.ts via HTTP
 * - Real storage functions in src/storage/db.ts
 * - Real synchronization merge in src/storage/syncManager.ts
 *
 * ZERO SIMULATION - 100% PRODUCTION CODE EXECUTION.
 */

import { describe, it, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {
  app,
  setServerDbForTesting,
  resetServerDbForTesting,
  getServerDbForTesting,
  requireMatchingResetId
} from '../server';
import {
  createEmptyDatabase,
  saveDatabase,
  loadDatabase,
  addDispense,
  deleteDispense,
  addSupply,
  deleteSupply
} from '../src/storage/db';
import {
  mergeServerDataSafely,
  clearPendingQueue
} from '../src/storage/syncManager';
import { DatabaseSchema, SyncTransactionItem, STOCK_CATEGORIES } from '../src/types';

// Mock client localStorage
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

process.env.NODE_ENV = 'test';

let testServer: http.Server;
let baseUrl: string;

function createTestServerDb(resetId: string = 'test-reset-cycle-1'): DatabaseSchema {
  const now = new Date().toISOString();
  const db = createEmptyDatabase();
  db.resetBoundary = {
    resetId,
    resetTimestamp: now,
    resetAt: now,
    resetBy: 'Test Runner'
  };
  return db;
}

describe('التحقق المباشر من الكود الإنتاجي (Production Code Tests - 11 Scenarios)', () => {
  before(async () => {
    await new Promise<void>((resolve) => {
      testServer = http.createServer(app).listen(0, '127.0.0.1', () => {
        const address = testServer.address() as any;
        baseUrl = `http://127.0.0.1:${address.port}`;
        resolve();
      });
    });
  });

  after(async () => {
    await new Promise<void>((resolve) => {
      testServer.close(() => resolve());
    });
  });

  beforeEach(() => {
    storageMap.clear();
    clearPendingQueue();
    resetServerDbForTesting();
  });

  // TEST 1: previousStock=100, serverStock=100, newActual=95 -> Expected: 95
  it('TEST 1: previousStock=100, serverStock=100, newActual=95 -> النتيجة 95 وتحديث رصيد الخادم', async () => {
    const srvDb = createTestServerDb('cycle-t1');
    srvDb.stocks.birth_certificates.currentStock = 100;
    setServerDbForTesting(srvDb, new Set());

    const tx: SyncTransactionItem = {
      transactionId: 'tx-prod-1',
      operationKey: 'MANUAL_STOCK_ADJUSTMENT:adj-prod-1:1',
      recordId: 'adj-prod-1',
      operationType: 'MANUAL_STOCK_ADJUSTMENT',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'client-1',
      resetBoundary: { resetId: 'cycle-t1', resetTimestamp: new Date().toISOString(), resetAt: new Date().toISOString(), resetBy: 'admin' },
      payload: {
        category: 'birth_certificates',
        previousStock: 100,
        oldStock: 100,
        newActualStock: 95,
        newStock: 95,
        reason: 'جرد فعلي متطابق',
        performedBy: 'أمين العهدة'
      }
    };

    const res = await fetch(`${baseUrl}/api/sync/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetId: 'cycle-t1',
        transactions: [tx]
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.serverData.stocks.birth_certificates.currentStock, 95);

    const updatedServerDb = getServerDbForTesting();
    assert.equal(updatedServerDb.stocks.birth_certificates.currentStock, 95);
  });

  // TEST 2: previousStock=100, serverStock=110, newActual=90 -> Expected: SYNC_CONFLICT, serverStock=110
  it('TEST 2: previousStock=100, serverStock=110, newActual=90 -> رفض التسوية، SYNC_CONFLICT، وبقاء الرصيد 110', async () => {
    const srvDb = createTestServerDb('cycle-t2');
    srvDb.stocks.birth_certificates.currentStock = 110; // server has moved ahead
    setServerDbForTesting(srvDb, new Set());

    const tx: SyncTransactionItem = {
      transactionId: 'tx-prod-2',
      operationKey: 'MANUAL_STOCK_ADJUSTMENT:adj-prod-2:1',
      recordId: 'adj-prod-2',
      operationType: 'MANUAL_STOCK_ADJUSTMENT',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'client-offline',
      resetBoundary: { resetId: 'cycle-t2', resetTimestamp: new Date().toISOString(), resetAt: new Date().toISOString(), resetBy: 'admin' },
      payload: {
        category: 'birth_certificates',
        previousStock: 100, // Stale baseline
        oldStock: 100,
        newActualStock: 90,
        newStock: 90,
        reason: 'جرد على رصيد قديم',
        performedBy: 'موظف أوفلاين'
      }
    };

    const res = await fetch(`${baseUrl}/api/sync/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetId: 'cycle-t2',
        transactions: [tx]
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.serverData.stocks.birth_certificates.currentStock, 110, 'رصيد الخادم يظل 110 ولا يكتب فوقه');

    const updatedServerDb = getServerDbForTesting();
    assert.equal(updatedServerDb.stocks.birth_certificates.currentStock, 110);
    const conflictLog = updatedServerDb.auditLogs.find(a => a.action === 'SYNC_CONFLICT');
    assert.ok(conflictLog, 'يجب تدوين تعارض SYNC_CONFLICT في auditLogs');
  });

  // TEST 3: Snapshot missing -> Expected: SYNC_CONFLICT, serverStock unchanged
  it('TEST 3: Snapshot missing -> رفض، تسجيل SYNC_CONFLICT، ورصيد الخادم دون تغيير', async () => {
    const srvDb = createTestServerDb('cycle-t3');
    srvDb.stocks.death_certificates.currentStock = 75;
    setServerDbForTesting(srvDb, new Set());

    const tx: SyncTransactionItem = {
      transactionId: 'tx-prod-3',
      operationKey: 'MANUAL_STOCK_ADJUSTMENT:adj-prod-3:1',
      recordId: 'adj-prod-3',
      operationType: 'MANUAL_STOCK_ADJUSTMENT',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'client-no-snap',
      resetBoundary: { resetId: 'cycle-t3', resetTimestamp: new Date().toISOString(), resetAt: new Date().toISOString(), resetBy: 'admin' },
      payload: {
        category: 'death_certificates',
        // previousStock and oldStock are MISSING!
        newActualStock: 50,
        newStock: 50,
        reason: 'تسوية بدون لقطة رصيد سابقة'
      }
    };

    const res = await fetch(`${baseUrl}/api/sync/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetId: 'cycle-t3',
        transactions: [tx]
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.serverData.stocks.death_certificates.currentStock, 75, 'الرصيد يظل 75 دون تغيير');

    const updatedServerDb = getServerDbForTesting();
    assert.equal(updatedServerDb.stocks.death_certificates.currentStock, 75);
    const conflictLog = updatedServerDb.auditLogs.find(a => a.action === 'SYNC_CONFLICT');
    assert.ok(conflictLog);
    assert.match(conflictLog.details, /غياب Snapshot|غياب أو عدم صلاحية لقطة الرصيد/);
  });

  // TEST 4: existingOpeningBalance=0, newOpeningBalance=50 -> Expected: SYNC_CONFLICT
  it('TEST 4: existingOpeningBalance=0, newOpeningBalance=50 -> تسجيل SYNC_CONFLICT ومنع الاستبدال الصامت', async () => {
    const srvDb = createTestServerDb('cycle-t4');
    srvDb.openingBalances.health_cards_male = {
      category: 'health_cards_male',
      quantity: 0,
      inventoryDate: '2026-01-01',
      inventoryKeeper: 'المسئول الأول',
      notes: 'رصيد صفري مسجل'
    };
    srvDb.stocks.health_cards_male.openingStock = 0;
    srvDb.stocks.health_cards_male.currentStock = 0;
    setServerDbForTesting(srvDb, new Set());

    const tx: SyncTransactionItem = {
      transactionId: 'tx-prod-4',
      operationKey: 'OPENING_BALANCE_SET:ob-prod-4:1',
      recordId: 'ob-prod-4',
      operationType: 'OPENING_BALANCE_SET',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'client-override',
      resetBoundary: { resetId: 'cycle-t4', resetTimestamp: new Date().toISOString(), resetAt: new Date().toISOString(), resetBy: 'admin' },
      payload: {
        category: 'health_cards_male',
        quantity: 50,
        inventoryDate: '2026-01-02',
        inventoryKeeper: 'مسئول آخر',
        notes: 'محاولة استبدال رصيد أول مدة'
      }
    };

    const res = await fetch(`${baseUrl}/api/sync/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetId: 'cycle-t4',
        transactions: [tx]
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.serverData.openingBalances.health_cards_male.quantity, 0, 'الرصيد الأصلي 0 يظل كما هو دون overwrite');

    const updatedServerDb = getServerDbForTesting();
    assert.equal(updatedServerDb.openingBalances.health_cards_male.quantity, 0);
    const conflictLog = updatedServerDb.auditLogs.find(a => a.action === 'SYNC_CONFLICT');
    assert.ok(conflictLog);
    assert.match(conflictLog.details, /تم رفض الاستبدال الصامت|الرصيد المسجل سابقاً/);
  });

  // TEST 5: existingOpeningBalance=100, newOpeningBalance=120 -> Expected: SYNC_CONFLICT
  it('TEST 5: existingOpeningBalance=100, newOpeningBalance=120 -> SYNC_CONFLICT وعدم تغيير الرصيد', async () => {
    const srvDb = createTestServerDb('cycle-t5');
    srvDb.openingBalances.health_cards_female = {
      category: 'health_cards_female',
      quantity: 100,
      inventoryDate: '2026-01-01',
      inventoryKeeper: 'أمين العهدة',
      notes: 'رصيد معتمد'
    };
    srvDb.stocks.health_cards_female.openingStock = 100;
    srvDb.stocks.health_cards_female.currentStock = 100;
    setServerDbForTesting(srvDb, new Set());

    const tx: SyncTransactionItem = {
      transactionId: 'tx-prod-5',
      operationKey: 'OPENING_BALANCE_SET:ob-prod-5:1',
      recordId: 'ob-prod-5',
      operationType: 'OPENING_BALANCE_SET',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'client-stale',
      resetBoundary: { resetId: 'cycle-t5', resetTimestamp: new Date().toISOString(), resetAt: new Date().toISOString(), resetBy: 'admin' },
      payload: {
        category: 'health_cards_female',
        quantity: 120,
        inventoryDate: '2026-01-05'
      }
    };

    const res = await fetch(`${baseUrl}/api/sync/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetId: 'cycle-t5',
        transactions: [tx]
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.serverData.openingBalances.health_cards_female.quantity, 100);

    const updatedServerDb = getServerDbForTesting();
    assert.equal(updatedServerDb.openingBalances.health_cards_female.quantity, 100);
    const conflictLog = updatedServerDb.auditLogs.find(a => a.action === 'SYNC_CONFLICT');
    assert.ok(conflictLog);
  });

  // TEST 6: stock=100, dispense=10, delete dispense -> Expected: 100 (Production db.ts execution)
  it('TEST 6: stock=100, dispense=10, delete dispense -> يعيد الرصيد إلى 100 بدقة', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 100;
    saveDatabase(db);

    const withDisp = addDispense({
      category: 'birth_certificates',
      transactionType: 'birth',
      quantity: 10,
      citizenName: 'مواطن تجربة 6',
      date: '2026-03-01',
      dispensedBy: 'أمين العهدة',
      collectedAmount: 0
    });
    assert.equal(withDisp.stocks.birth_certificates.currentStock, 90);
    const dspId = withDisp.dispenses[0].id;

    const afterDelete = deleteDispense(dspId, 'أمين العهدة');
    assert.equal(afterDelete.stocks.birth_certificates.currentStock, 100, 'الرصيد يجب أن يعود 100 بالتمام');
    assert.equal(afterDelete.dispenses.length, 0);
  });

  // TEST 7: stock=100, supply=20, delete supply -> Expected: 100 (Production db.ts execution)
  it('TEST 7: stock=100, supply=20, delete supply -> يعكس التوريد ويعيد الرصيد إلى 100 بدقة', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 100;
    saveDatabase(db);

    const withSup = addSupply({
      category: 'birth_certificates',
      quantity: 20,
      documentNumber: 'DOC-TEST-7',
      date: '2026-03-01',
      receivedBy: 'أمين المخزن',
      supplierSource: 'المديرية'
    });
    assert.equal(withSup.stocks.birth_certificates.currentStock, 120);
    const supId = withSup.supplies[0].id;

    const afterDelete = deleteSupply(supId, 'مدير النظام');
    assert.equal(afterDelete.stocks.birth_certificates.currentStock, 100, 'الرصيد يعود 100');
    assert.equal(afterDelete.supplies.length, 0);
  });

  // TEST 8: serverStock=150, mergeServerDataSafely() -> Expected: localStock=150 without reapplying movements
  it('TEST 8: serverStock=150, mergeServerDataSafely() -> يجعل localStock: 150 دون إعادة تطبيق الحركات', () => {
    const localDb = createEmptyDatabase();
    localDb.stocks.birth_certificates.currentStock = 100;

    const serverDb = createEmptyDatabase();
    serverDb.stocks.birth_certificates.currentStock = 150;
    serverDb.supplies.push({
      id: 'sup-srv-1',
      category: 'birth_certificates',
      quantity: 50,
      date: '2026-03-01',
      documentNumber: 'SRV-001',
      syncStatus: 'synced'
    } as any);

    const merged = mergeServerDataSafely(localDb, serverDb);

    assert.equal(
      merged.stocks.birth_certificates.currentStock,
      150,
      'الرصيد يجب أن يكون 150 نقلاً عن الخادم المرجعي، ولا تتم إضافة الـ 50 لتصبح 200'
    );
  });

  // TEST 9: old resetId -> Expected: STALE_RESET_ID
  it('TEST 9: old resetId -> رفض بحالة 409 ورمز STALE_RESET_ID', async () => {
    const srvDb = createTestServerDb('current-active-cycle');
    setServerDbForTesting(srvDb, new Set());

    const tx: SyncTransactionItem = {
      transactionId: 'tx-prod-9',
      operationKey: 'SUPPLY_ADD:sup-prod-9:1',
      recordId: 'sup-prod-9',
      operationType: 'SUPPLY_ADD',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'stale-device',
      resetBoundary: { resetId: 'old-stale-cycle', resetTimestamp: '2025-01-01T00:00:00.000Z', resetAt: '2025-01-01T00:00:00.000Z', resetBy: 'old' },
      payload: {
        category: 'birth_certificates',
        quantity: 10
      }
    };

    const res = await fetch(`${baseUrl}/api/sync/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetId: 'old-stale-cycle',
        transactions: [tx]
      })
    });

    assert.equal(res.status, 409);
    const data = await res.json();
    assert.equal(data.success, false);
    assert.equal(data.error, 'STALE_RESET_ID');
  });

  // TEST 10: correct operationKey DISPENSE_ADD:abc:1 version=1 -> Expected: PASS
  it('TEST 10: correct operationKey DISPENSE_ADD:abc:1 مع version=1 -> PASS ويقبل الحركة', async () => {
    const srvDb = createTestServerDb('cycle-t10');
    srvDb.stocks.birth_certificates.currentStock = 50;
    setServerDbForTesting(srvDb, new Set());

    const tx: SyncTransactionItem = {
      transactionId: 'tx-prod-10',
      operationKey: 'DISPENSE_ADD:abc:1',
      recordId: 'abc',
      operationType: 'DISPENSE_ADD',
      version: 1,
      updatedAt: new Date().toISOString(),
      deviceId: 'client-valid',
      resetBoundary: { resetId: 'cycle-t10', resetTimestamp: new Date().toISOString(), resetAt: new Date().toISOString(), resetBy: 'admin' },
      payload: {
        category: 'birth_certificates',
        quantity: 5
      }
    };

    const res = await fetch(`${baseUrl}/api/sync/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetId: 'cycle-t10',
        transactions: [tx]
      })
    });

    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.processedKeys.includes('DISPENSE_ADD:abc:1'));
    assert.equal(data.serverData.stocks.birth_certificates.currentStock, 45);
  });

  // TEST 11: DISPENSE_ADD:abc:2 with version=1 -> Expected: INVALID_OPERATION_KEY
  it('TEST 11: operationKey: DISPENSE_ADD:abc:2 مع version=1 -> يرفض بـ 400 ورمز INVALID_OPERATION_KEY', async () => {
    const srvDb = createTestServerDb('cycle-t11');
    setServerDbForTesting(srvDb, new Set());

    const tx: SyncTransactionItem = {
      transactionId: 'tx-prod-11',
      operationKey: 'DISPENSE_ADD:abc:2', // version mismatch!
      recordId: 'abc',
      operationType: 'DISPENSE_ADD',
      version: 1, // does not match the '2' in key
      updatedAt: new Date().toISOString(),
      deviceId: 'client-mismatch',
      resetBoundary: { resetId: 'cycle-t11', resetTimestamp: new Date().toISOString(), resetAt: new Date().toISOString(), resetBy: 'admin' },
      payload: {
        category: 'birth_certificates',
        quantity: 5
      }
    };

    const res = await fetch(`${baseUrl}/api/sync/transactions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        resetId: 'cycle-t11',
        transactions: [tx]
      })
    });

    assert.equal(res.status, 400);
    const data = await res.json();
    assert.equal(data.error, 'INVALID_OPERATION_KEY');
  });
});
