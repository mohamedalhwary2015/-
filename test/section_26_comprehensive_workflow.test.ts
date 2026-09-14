/**
 * مكتب صحة سفلاق - منظومة تسجيل الأرصدة وساقط القيد
 * Test Suite: Section 26 Comprehensive 17-Step Offline/Online/Sync/Reset Workflow
 * 
 * سيناريو الاختبار الحاسم المطلوب بالكامل (17 خطوة متتالية):
 * 1. إنشاء حالة Offline حقيقية تجريبية داخل بيئة الاختبار.
 * 2. تسجيل رصيد افتتاحي.
 * 3. تسجيل توريد.
 * 4. تسجيل صرف.
 * 5. التحقق الدقيق من الرصيد الفعلي.
 * 6. فصل الإنترنت (وضع Offline الصريح).
 * 7. تسجيل حركة أخرى أثناء انقطاع الاتصال.
 * 8. إعادة الاتصال بالإنترنت (Online).
 * 9. تنفيذ المزامنة (Sync).
 * 10. محاكاة فتح جهاز ثانٍ (Device B).
 * 11. التحقق من تطابق البيانات على الجهاز الثاني.
 * 12. تنفيذ تعديل (Edit) على حركة.
 * 13. تنفيذ حذف (Delete) لحركة.
 * 14. التحقق من وصول التعديل والحذف للجهاز الثاني دون بعث السجل المحذوف.
 * 15. تنفيذ ضبط مصنع وتصفير شامل (Factory Reset) في بيئة الاختبار.
 * 16. محاولة إرسال حركة قديمة سابقة للتصفير من جهاز Offline.
 * 17. التأكد الصارم من رفض الحركة تماماً وحماية قاعدة البيانات النظيفة.
 */

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
  setOpeningBalance,
  executeFactoryReset
} from '../src/storage/db';
import {
  enqueueTransaction,
  getPendingQueue,
  clearPendingQueue,
  mergeServerDataSafely
} from '../src/storage/syncManager';
import { DatabaseSchema, StockCategory, SyncTransactionItem } from '../src/types';

// Mock in-memory storage for test isolated instances
class MockLocalStorage {
  private map = new Map<string, string>();
  getItem(key: string): string | null {
    return this.map.get(key) || null;
  }
  setItem(key: string, val: string): void {
    this.map.set(key, val);
  }
  removeItem(key: string): void {
    this.map.delete(key);
  }
  clear(): void {
    this.map.clear();
  }
}

/**
 * Simulates server transaction processing strictly according to server.ts
 */
function serverProcessTransactions(
  serverDb: DatabaseSchema,
  transactions: SyncTransactionItem[],
  processedKeys: Set<string>,
  clientResetBoundary?: any
): { status: number; acknowledgedKeys: string[]; serverDb: DatabaseSchema; errorCode?: string } {
  // Server-side strict reset boundary check
  if (serverDb.resetBoundary && serverDb.resetBoundary.resetTimestamp) {
    const serverResetTime = new Date(serverDb.resetBoundary.resetTimestamp).getTime();
    if (
      !clientResetBoundary ||
      (clientResetBoundary.resetId && clientResetBoundary.resetId !== serverDb.resetBoundary.resetId &&
       new Date(clientResetBoundary.resetTimestamp).getTime() < serverResetTime)
    ) {
      return {
        status: 409,
        acknowledgedKeys: [],
        serverDb,
        errorCode: 'RESET_BOUNDARY_VIOLATION'
      };
    }
  }

  const acknowledgedKeys: string[] = [];
  const tombstoneSet = new Set((serverDb.tombstones || []).map(t => t.recordId));

  for (const item of transactions) {
    const { operationKey, operationType, recordId, payload, transactionId, version } = item;

    // Idempotency: execute exactly once
    if (processedKeys.has(operationKey)) {
      acknowledgedKeys.push(operationKey);
      continue;
    }

    // Tombstone protection: do not resurrect deleted records
    if (tombstoneSet.has(recordId) && !operationType.includes('DELETE')) {
      acknowledgedKeys.push(operationKey);
      processedKeys.add(operationKey);
      continue;
    }

    switch (operationType) {
      case 'OPENING_BALANCE_SET': {
        const cat = payload.category as StockCategory;
        serverDb.openingBalances = serverDb.openingBalances || ({} as any);
        serverDb.openingBalances[cat] = {
          category: cat,
          quantity: payload.quantity,
          inventoryDate: payload.inventoryDate,
          inventoryKeeper: payload.inventoryKeeper,
          notes: payload.notes
        };
        const stock = serverDb.stocks[cat];
        if (stock) {
          stock.openingStock = payload.quantity;
          if (stock.currentStock === 0 && stock.totalReceived === 0 && stock.totalDispensed === 0) {
            stock.currentStock = payload.quantity;
          }
        }
        break;
      }
      case 'SUPPLY_ADD': {
        const exists = serverDb.supplies.some(s => s.id === recordId || s.transactionId === transactionId);
        if (!exists) {
          serverDb.supplies.unshift({ ...payload, syncStatus: 'synced' });
          const stock = serverDb.stocks[payload.category as StockCategory];
          if (stock) {
            stock.currentStock += payload.quantity;
            stock.totalReceived += payload.quantity;
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
      case 'SUPPLY_DELETE': {
        const idx = serverDb.supplies.findIndex(s => s.id === recordId);
        if (idx >= 0) {
          const existing = serverDb.supplies[idx];
          const stock = serverDb.stocks[existing.category as StockCategory];
          if (stock) {
            stock.currentStock -= existing.quantity;
            stock.totalReceived -= existing.quantity;
          }
          serverDb.supplies.splice(idx, 1);
        }
        if (!tombstoneSet.has(recordId)) {
          serverDb.tombstones.push({
            recordId,
            recordType: 'supply',
            transactionId,
            deletedAt: new Date().toISOString(),
            version: version || 1
          });
          tombstoneSet.add(recordId);
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
                stock.currentStock -= diff;
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
          const existing = serverDb.dispenses[idx];
          const stock = serverDb.stocks[existing.category as StockCategory];
          if (stock) {
            stock.currentStock += existing.quantity;
            stock.totalDispensed -= existing.quantity;
          }
          serverDb.dispenses.splice(idx, 1);
        }
        if (!tombstoneSet.has(recordId)) {
          serverDb.tombstones.push({
            recordId,
            recordType: 'dispense',
            transactionId,
            deletedAt: new Date().toISOString(),
            version: version || 1
          });
          tombstoneSet.add(recordId);
        }
        break;
      }
    }

    acknowledgedKeys.push(operationKey);
    processedKeys.add(operationKey);
  }

  return { status: 200, acknowledgedKeys, serverDb };
}

describe('Section 26: اختبار سيناريو العمليات الحرج الـ 17 خطوة بالكامل', () => {
  let mockStorageA: MockLocalStorage;
  let mockStorageB: MockLocalStorage;

  beforeEach(() => {
    mockStorageA = new MockLocalStorage();
    mockStorageB = new MockLocalStorage();

    // Default to Device A context
    (global as any).localStorage = mockStorageA;
    (global as any).window = {
      dispatchEvent: () => {},
      localStorage: mockStorageA
    };
  });

  it('تنفيذ السيناريو الكامل 17 خطوة: Offline -> Movements -> Online -> Device B -> Edit -> Delete -> Reset -> Reject Old', () => {
    // -------------------------------------------------------------------------
    // الخطوة 1: إنشاء حالة Offline حقيقية تجريبية داخل Test Environment
    // -------------------------------------------------------------------------
    const clientDbA = createEmptyDatabase();
    saveDatabase(clientDbA);
    clearPendingQueue();

    assert.equal(clientDbA.supplies.length, 0, 'البيانات خالية من أي Demo');
    assert.equal(clientDbA.dispenses.length, 0);
    assert.equal(clientDbA.stocks.birth_certificates.currentStock, 0);

    // -------------------------------------------------------------------------
    // الخطوة 2: تسجيل رصيد افتتاحي
    // -------------------------------------------------------------------------
    setOpeningBalance('birth_certificates', 100, 'أمين المخزن', 'رصيد افتتاحي معتمد');
    const dbAfterOpening = loadDatabase();
    assert.equal(dbAfterOpening.stocks.birth_certificates.openingStock, 100);
    assert.equal(dbAfterOpening.stocks.birth_certificates.currentStock, 100, 'الرصيد الفعلي أصبح 100 لأن الصنف كان غير مستخدم');

    // -------------------------------------------------------------------------
    // الخطوة 3: تسجيل توريد
    // -------------------------------------------------------------------------
    const supRes = addSupply({
      documentNumber: 'SUP-E2E-001',
      date: '2026-03-02',
      category: 'birth_certificates',
      quantity: 50,
      receivedBy: 'الموظف المختص',
      supplierSource: 'مخزن المديرية'
    });
    assert.equal(supRes.stocks.birth_certificates.currentStock, 150, 'الرصيد الفعلي زاد إلى 150 بعد توريد 50');
    const supplyRecordId = supRes.supplies[0].id;

    // -------------------------------------------------------------------------
    // الخطوة 4: تسجيل صرف
    // -------------------------------------------------------------------------
    const dspRes = addDispense({
      date: '2026-03-03',
      citizenName: 'مواطن أول',
      transactionType: 'birth',
      gender: 'ذكر',
      category: 'birth_certificates',
      quantity: 10,
      dispensedBy: 'الموظف المختص',
      collectedAmount: 0
    });
    assert.equal(dspRes.stocks.birth_certificates.currentStock, 140, 'الرصيد الفعلي انخفض إلى 140 بعد صرف 10');
    const dispenseRecordId = dspRes.dispenses[0].id;

    // -------------------------------------------------------------------------
    // الخطوة 5: التحقق من الرصيد
    // -------------------------------------------------------------------------
    const verifiedDb = loadDatabase();
    assert.equal(verifiedDb.stocks.birth_certificates.currentStock, 140);
    assert.equal(verifiedDb.stocks.birth_certificates.openingStock, 100);
    assert.equal(verifiedDb.stocks.birth_certificates.totalReceived, 50);
    assert.equal(verifiedDb.stocks.birth_certificates.totalDispensed, 10);

    // -------------------------------------------------------------------------
    // الخطوة 6: افصل الإنترنت (وضع Offline الصريح - الحركات تبقى في الطابور المحلي)
    // -------------------------------------------------------------------------
    // الجهاز A offline، سنقوم بتسجيل حركة صرف إضافية وحركة توريد إضافية
    // -------------------------------------------------------------------------
    // الخطوة 7: سجل حركة أخرى أثناء انقطاع الإنترنت
    // -------------------------------------------------------------------------
    const offlineDsp = addDispense({
      date: '2026-03-04',
      citizenName: 'مواطن ثاني (Offline)',
      transactionType: 'birth',
      gender: 'أنثى',
      category: 'birth_certificates',
      quantity: 15,
      dispensedBy: 'الموظف المختص',
      collectedAmount: 0
    });
    assert.equal(offlineDsp.stocks.birth_certificates.currentStock, 125, 'الرصيد انخفض محلياً إلى 125 أثناء الـ Offline');

    const offlineQueue = getPendingQueue();
    assert.ok(offlineQueue.length >= 4, 'طابور الحركات غير المتزامنة يحتوي كل العمليات المحلية');

    // -------------------------------------------------------------------------
    // الخطوة 8: أعد الإنترنت (Online)
    // -------------------------------------------------------------------------
    // تهيئة قاعدة الخادم المركزي ومفاتيحه
    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = { ...loadDatabase().resetBoundary };
    const processedKeys = new Set<string>();

    // -------------------------------------------------------------------------
    // الخطوة 9: تنفيذ المزامنة (Sync) للجهاز A
    // -------------------------------------------------------------------------
    const syncRes = serverProcessTransactions(serverDb, offlineQueue, processedKeys, loadDatabase().resetBoundary);
    assert.equal(syncRes.status, 200);
    assert.equal(serverDb.stocks.birth_certificates.currentStock, 125, 'الخادم تلقى كل الحركات وأصبح رصيده 125');
    assert.equal(serverDb.supplies.length, 1);
    assert.equal(serverDb.dispenses.length, 2);

    // تفريغ طابور الجهاز A بعد تأكيد الخادم
    clearPendingQueue();

    // -------------------------------------------------------------------------
    // الخطوة 10: افتح جهازاً ثانياً (Device B)
    // -------------------------------------------------------------------------
    // Switch global storage to Device B
    (global as any).localStorage = mockStorageB;
    (global as any).window.localStorage = mockStorageB;

    const clientDbB = createEmptyDatabase();
    clientDbB.resetBoundary = { ...serverDb.resetBoundary };
    saveDatabase(clientDbB);

    // جهاز B يقوم بعمل مزامنة أولية مع الخادم
    mergeServerDataSafely(clientDbB, serverDb);

    // -------------------------------------------------------------------------
    // الخطوة 11: تحقق من البيانات على الجهاز الثاني (Device B)
    // -------------------------------------------------------------------------
    const reloadedB = loadDatabase();
    assert.equal(reloadedB.stocks.birth_certificates.currentStock, 125, 'الجهاز B يرى الرصيد الفعلي الصحيح 125');
    assert.equal(reloadedB.supplies.length, 1, 'الجهاز B يرى التوريد');
    assert.equal(reloadedB.dispenses.length, 2, 'الجهاز B يرى الصرفيتين');

    // -------------------------------------------------------------------------
    // الخطوة 12: نفذ تعديل (Edit) على حركة الصرف الأولى (تعديل الكمية من 10 إلى 5)
    // -------------------------------------------------------------------------
    const editRes = updateDispense(dispenseRecordId, { quantity: 5 }, 'الموظف على جهاز B');
    assert.equal(editRes.stocks.birth_certificates.currentStock, 130, 'الرصيد الفعلي على B زاد إلى 130 بعد تخفيض المنصرف');

    const queueFromB = getPendingQueue();
    // إرسال تعديل B إلى الخادم
    const syncEditRes = serverProcessTransactions(serverDb, queueFromB, processedKeys, editRes.resetBoundary);
    assert.equal(syncEditRes.status, 200);
    assert.equal(serverDb.stocks.birth_certificates.currentStock, 130, 'الخادم عكس التعديل وأصبح 130');
    clearPendingQueue();

    // -------------------------------------------------------------------------
    // الخطوة 13: نفذ حذف (Delete) لحركة التوريد
    // -------------------------------------------------------------------------
    const delRes = deleteSupply(supplyRecordId, 'الموظف على جهاز B');
    assert.equal(delRes.stocks.birth_certificates.currentStock, 80, 'الرصيد أصبح 80 بعد حذف التوريد (130 - 50)');
    assert.equal(delRes.supplies.length, 0);

    const queueDelFromB = getPendingQueue();
    const syncDelRes = serverProcessTransactions(serverDb, queueDelFromB, processedKeys, delRes.resetBoundary);
    assert.equal(syncDelRes.status, 200);
    assert.equal(serverDb.stocks.birth_certificates.currentStock, 80, 'الخادم عكس الحذف وأصبح 80');
    assert.equal(serverDb.supplies.length, 0);
    clearPendingQueue();

    // -------------------------------------------------------------------------
    // الخطوة 14: تحقق من الجهاز الأول (Device A) بعد مزامنة التعديل والحذف
    // -------------------------------------------------------------------------
    // العودة للجهاز A
    (global as any).localStorage = mockStorageA;
    (global as any).window.localStorage = mockStorageA;

    const currentA = loadDatabase();
    mergeServerDataSafely(currentA, serverDb);

    const reloadedA = loadDatabase();
    assert.equal(reloadedA.stocks.birth_certificates.currentStock, 80, 'الجهاز A تطابق رصيده تماماً إلى 80');
    assert.equal(reloadedA.supplies.length, 0, 'التوريد المحذوف لم يعد للجهاز A');
    assert.equal(reloadedA.dispenses.find(d => d.id === dispenseRecordId)?.quantity, 5, 'تعديل الكمية تم بنجاح على A');

    // -------------------------------------------------------------------------
    // الخطوة 15: نفذ ضبط مصنع وتصفير شامل (Factory Reset) في بيئة الاختبار
    // -------------------------------------------------------------------------
    const resetTime = new Date().toISOString();
    const newResetId = 'srv-reset-e2e-isolated';
    serverDb.resetBoundary = {
      resetId: newResetId,
      resetTimestamp: resetTime,
      resetBy: 'مدير النظام المركزي في بيئة الاختبار'
    };
    serverDb.supplies = [];
    serverDb.dispenses = [];
    serverDb.lateRegistrations = [];
    serverDb.tombstones = [];
    for (const cat of Object.keys(serverDb.stocks) as StockCategory[]) {
      serverDb.stocks[cat].currentStock = 0;
      serverDb.stocks[cat].openingStock = 0;
      serverDb.stocks[cat].totalReceived = 0;
      serverDb.stocks[cat].totalDispensed = 0;
    }

    // -------------------------------------------------------------------------
    // الخطوة 16: حاول إرسال حركة قديمة سابقة للتصفير من جهاز Offline قديم
    // -------------------------------------------------------------------------
    const stalePreResetTransaction: SyncTransactionItem = {
      transactionId: 'tx-stale-offline-old',
      operationKey: 'op-stale-offline-old',
      recordId: 'rec-stale-offline-old',
      operationType: 'SUPPLY_ADD',
      version: 1,
      updatedAt: '2026-03-01T10:00:00.000Z',
      deviceId: 'device-offline-stale',
      resetBoundary: {
        resetId: clientDbA.resetBoundary.resetId, // معرف الجلسة القديمة قبل التصفير
        resetTimestamp: clientDbA.resetBoundary.resetTimestamp,
        resetBy: clientDbA.resetBoundary.resetBy
      },
      payload: {
        id: 'rec-stale-offline-old',
        date: '2026-03-01',
        category: 'birth_certificates',
        quantity: 999,
        documentNumber: 'STALE-999',
        supplierSource: 'محاولة اختراق ما بعد التصفير'
      }
    };

    const staleRes = serverProcessTransactions(
      serverDb,
      [stalePreResetTransaction],
      processedKeys,
      stalePreResetTransaction.resetBoundary
    );

    // -------------------------------------------------------------------------
    // الخطوة 17: تأكد الصارم من رفض الحركة القديمة تماماً وحماية قاعدة البيانات
    // -------------------------------------------------------------------------
    assert.equal(staleRes.status, 409, 'تم رفض الحركة برمز 409 لانتهاك حد الأمان الزمني');
    assert.equal(staleRes.errorCode, 'RESET_BOUNDARY_VIOLATION');
    assert.equal(serverDb.supplies.length, 0, 'قاعدة البيانات النظيفة لم تقبل التوريد القديم إطلاقاً');
    assert.equal(serverDb.stocks.birth_certificates.currentStock, 0, 'الرصيد النظيف ظل 0 ولم يتلوث بالحركة القديمة');
  });
});
