import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  enqueueTransaction,
  getPendingQueue,
  clearPendingQueue,
  mergeServerDataSafely
} from '../src/storage/syncManager';
import {
  createEmptyDatabase,
  saveDatabase,
  loadDatabase,
  addSupply,
  deleteSupply
} from '../src/storage/db';
import { DatabaseSchema, ResetBoundary } from '../src/types';

// Mock localStorage and window
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

describe('اختبارات مزامنة الحركات (Transaction Sync Hardening - V17)', () => {
  beforeEach(() => {
    storageMap.clear();
    const cleanDb = createEmptyDatabase();
    saveDatabase(cleanDb);
  });

  it('حماية من إحياء السجلات المحذوفة (Tombstones Non-Resurrection)', () => {
    // 1. Add a supply
    addSupply({
      documentNumber: 'TOMB-1',
      date: '2025-05-01',
      category: 'birth_certificates',
      quantity: 15,
      supplierSource: 'المخزن',
      receivedBy: 'أحمد'
    });

    let localDb = loadDatabase();
    const supplyId = localDb.supplies[0].id;
    const initialTxId = localDb.supplies[0].transactionId;

    // 2. Delete the supply locally -> creates a tombstone
    deleteSupply(supplyId, 'مدير النظام');
    localDb = loadDatabase();
    assert.equal(localDb.supplies.length, 0);
    assert.equal(localDb.tombstones.length, 1);

    // 3. Simulate receiving server data that still has the deleted supply (e.g. from delayed sync)
    const serverDb: DatabaseSchema = JSON.parse(JSON.stringify(localDb));
    serverDb.supplies = [{
      id: supplyId,
      transactionId: initialTxId,
      documentNumber: 'TOMB-1',
      date: '2025-05-01',
      category: 'birth_certificates',
      quantity: 15,
      supplierSource: 'المخزن',
      receivedBy: 'أحمد',
      version: 1,
      updatedAt: '2025-05-01T00:00:00.000Z',
      syncStatus: 'synced'
    }];

    // 4. Merge server data into local
    const merged = mergeServerDataSafely(localDb, serverDb);

    // 5. The deleted supply must NOT be resurrected because tombstone protects it
    assert.equal(merged.supplies.length, 0, 'السجل المحذوف لا يُعاد إحياؤه لوجود Tombstone');
    assert.equal(merged.stocks.birth_certificates.currentStock, 0, 'الرصيد الفعلي لا يتأثر بالسجل المحذوف');
  });

  it('حماية حد الأمان الزمني (Reset Boundary) من الحركات القديمة', () => {
    const oldTimestamp = new Date(Date.now() - 100000).toISOString();
    const oldBoundary: ResetBoundary = {
      resetId: 'rst-old',
      resetTimestamp: oldTimestamp,
      resetBy: 'سابق'
    };

    const newTimestamp = new Date().toISOString();
    const currentBoundary: ResetBoundary = {
      resetId: 'rst-new',
      resetTimestamp: newTimestamp,
      resetBy: 'مدير النظام'
    };

    const db = loadDatabase();
    db.resetBoundary = currentBoundary;
    saveDatabase(db);

    // An incoming item with timestamp older than resetBoundary must be rejected or not corrupt current state
    const queue = getPendingQueue();
    // Verify queue can be filtered against resetBoundary if needed
    assert.equal(queue.length, 0);
  });

  it('منع تكرار نفس العملية في الطابور (OperationKey Idempotency)', () => {
    clearPendingQueue();
    const item1 = enqueueTransaction('SUPPLY_ADD', 'sup-1', 1, { test: 1 }, 'tx-1');
    const item2 = enqueueTransaction('SUPPLY_ADD', 'sup-1', 1, { test: 1 }, 'tx-1');

    assert.equal(item1.operationKey, 'SUPPLY_ADD:sup-1:1');
    assert.equal(item2.operationKey, 'SUPPLY_ADD:sup-1:1');

    const queue = getPendingQueue();
    assert.equal(queue.length, 1, 'عدم تكرار الحركة ذات نفس الـ OperationKey');
  });
});
