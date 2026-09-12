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
  executeFactoryReset
} from '../src/storage/db';
import {
  enqueueTransaction,
  getPendingQueue,
  clearPendingQueue,
  mergeServerDataSafely
} from '../src/storage/syncManager';
import { calculateTheoreticalStockForCategory } from '../src/services/stockService';
import { generateOfficialMonthlyReport } from '../src/services/reportService';
import { DatabaseSchema, StockCategory, SyncTransactionItem } from '../src/types';

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
 * Helper: simulates server-side processing of transactions according to server.ts logic
 */
function simulateServerTransactionProcessing(
  serverDb: DatabaseSchema,
  transactions: SyncTransactionItem[],
  processedKeys: Set<string>,
  clientResetBoundary?: any
): { status: number; acknowledgedKeys: string[]; serverDb: DatabaseSchema; errorCode?: string } {
  // Reset boundary check (server.ts rule)
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
              // Revert old category, apply new category
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
              // Revert old category, apply new category
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

describe('التحقق الإلزامي من المتطلبات الـ 12 بدقة حاسمة', () => {
  beforeEach(() => {
    storageMap.clear();
    const cleanDb = createEmptyDatabase();
    saveDatabase(cleanDb);
    clearPendingQueue();
  });

  // Test 1: ADD Supply Offline → Online
  it('Test 1: ADD Supply Offline -> Online يدخل في الطابور ويطبق على السيرفر بدقة', () => {
    addSupply({
      documentNumber: 'OFF-SUP-01',
      date: '2025-05-01',
      category: 'birth_certificates',
      quantity: 50,
      supplierSource: 'مخزن الإدارة الصحية',
      receivedBy: 'محمود عثمان'
    });

    const queue = getPendingQueue();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].operationType, 'SUPPLY_ADD');

    const clientDb = loadDatabase();
    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = { ...clientDb.resetBoundary };
    const processedKeys = new Set<string>();
    const res = simulateServerTransactionProcessing(serverDb, queue, processedKeys, clientDb.resetBoundary);

    assert.equal(res.status, 200);
    assert.equal(res.acknowledgedKeys.length, 1);
    assert.equal(res.serverDb.stocks.birth_certificates.currentStock, 50);
    assert.equal(res.serverDb.supplies.length, 1);
  });

  // Test 2: ADD Dispense Offline → Online
  it('Test 2: ADD Dispense Offline -> Online يدخل في الطابور ويخصم من رصيد السيرفر', () => {
    // Setup initial stock on client & server
    const clientDb = loadDatabase();
    clientDb.stocks.birth_certificates.currentStock = 100;
    saveDatabase(clientDb);

    addDispense({
      category: 'birth_certificates',
      transactionType: 'birth',
      quantity: 5,
      citizenName: 'أحمد إبراهيم',
      date: '2025-05-02',
      childOrDeceasedName: 'إبراهيم أحمد',
      gender: 'ذكر',
      collectedAmount: 0,
      dispensedBy: 'موظف الصحة'
    });

    const queue = getPendingQueue();
    assert.equal(queue.length, 1);
    assert.equal(queue[0].operationType, 'DISPENSE_ADD');

    const currentClientDb = loadDatabase();
    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = { ...currentClientDb.resetBoundary };
    serverDb.stocks.birth_certificates.currentStock = 100;
    const processedKeys = new Set<string>();
    const res = simulateServerTransactionProcessing(serverDb, queue, processedKeys, currentClientDb.resetBoundary);

    assert.equal(res.status, 200);
    assert.equal(res.serverDb.stocks.birth_certificates.currentStock, 95);
    assert.equal(res.serverDb.stocks.birth_certificates.totalDispensed, 5);
  });

  // Test 3: UPDATE Supply
  it('Test 3: UPDATE Supply يعدل الكمية في الطابور وعلى السيرفر مع ثبات transactionId', () => {
    addSupply({
      documentNumber: 'SUP-UPD-1',
      date: '2025-05-01',
      category: 'death_certificates',
      quantity: 20,
      supplierSource: 'المخزن',
      receivedBy: 'أحمد'
    });

    const db = loadDatabase();
    const supId = db.supplies[0].id;
    const initialTxId = db.supplies[0].transactionId;

    updateSupply(supId, { quantity: 35 });
    const updatedDb = loadDatabase();
    assert.equal(updatedDb.stocks.death_certificates.currentStock, 35);

    const queue = getPendingQueue();
    assert.equal(queue.length, 2);
    const updateItem = queue[1];
    assert.equal(updateItem.operationType, 'SUPPLY_UPDATE');
    assert.equal(updateItem.transactionId, initialTxId);

    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = { ...updatedDb.resetBoundary };
    const processedKeys = new Set<string>();
    simulateServerTransactionProcessing(serverDb, queue, processedKeys, updatedDb.resetBoundary);
    assert.equal(serverDb.stocks.death_certificates.currentStock, 35);
  });

  // Test 4: UPDATE Dispense
  it('Test 4: UPDATE Dispense يعدل كمية المنصرف ويعدل الرصيد مع ثبات transactionId', () => {
    const clientDb = loadDatabase();
    clientDb.stocks.health_cards_male.currentStock = 100;
    saveDatabase(clientDb);

    addDispense({
      category: 'health_cards_male',
      transactionType: 'health_card_male',
      quantity: 4,
      citizenName: 'حسن علي',
      date: '2025-05-03',
      collectedAmount: 200,
      dispensedBy: 'موظف الصحة'
    });

    const db = loadDatabase();
    const dspId = db.dispenses[0].id;
    const initialTxId = db.dispenses[0].transactionId;

    // Update quantity from 4 to 1
    updateDispense(dspId, { quantity: 1, collectedAmount: 50 });
    const afterUpdateDb = loadDatabase();
    assert.equal(afterUpdateDb.stocks.health_cards_male.currentStock, 99); // 100 - 1

    const queue = getPendingQueue();
    assert.equal(queue.length, 2);
    assert.equal(queue[1].operationType, 'DISPENSE_UPDATE');
    assert.equal(queue[1].transactionId, initialTxId);

    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = { ...afterUpdateDb.resetBoundary };
    serverDb.stocks.health_cards_male.currentStock = 100;
    const processedKeys = new Set<string>();
    simulateServerTransactionProcessing(serverDb, queue, processedKeys, afterUpdateDb.resetBoundary);
    assert.equal(serverDb.stocks.health_cards_male.currentStock, 99);
  });

  // Test 5: تغيير Category في Supply
  it('Test 5: تغيير Category في Supply يعكس الكمية من الصنف القديم ويضيفها للصنف الجديد', () => {
    addSupply({
      documentNumber: 'CAT-SUP',
      date: '2025-05-01',
      category: 'birth_certificates',
      quantity: 30,
      supplierSource: 'المخزن',
      receivedBy: 'أحمد'
    });

    const supId = loadDatabase().supplies[0].id;
    updateSupply(supId, { category: 'death_certificates' as any, quantity: 30 });

    const localDb = loadDatabase();
    assert.equal(localDb.stocks.birth_certificates.currentStock, 0, 'استرجاع رصيد الصنف القديم محلياً');
    assert.equal(localDb.stocks.death_certificates.currentStock, 30, 'تطبيق الرصيد على الصنف الجديد محلياً');

    // Verify on server
    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = { ...localDb.resetBoundary };
    const processedKeys = new Set<string>();
    simulateServerTransactionProcessing(serverDb, getPendingQueue(), processedKeys, localDb.resetBoundary);

    assert.equal(serverDb.stocks.birth_certificates.currentStock, 0, 'استرجاع رصيد الصنف القديم على السيرفر');
    assert.equal(serverDb.stocks.death_certificates.currentStock, 30, 'تطبيق الرصيد على الصنف الجديد على السيرفر');
  });

  // Test 6: تغيير Category في Dispense
  it('Test 6: تغيير Category في Dispense يعيد كمية الصنف القديم ويخصم كمية الصنف الجديد', () => {
    const clientDb = loadDatabase();
    clientDb.stocks.health_cards_male.currentStock = 50;
    clientDb.stocks.health_cards_female.currentStock = 50;
    saveDatabase(clientDb);

    addDispense({
      category: 'health_cards_male',
      transactionType: 'health_card_male',
      quantity: 5,
      citizenName: 'مواطن',
      date: '2025-05-04',
      collectedAmount: 250,
      dispensedBy: 'موظف الصحة'
    });

    const dspId = loadDatabase().dispenses[0].id;
    // Change category to health_cards_female
    updateDispense(dspId, { category: 'health_cards_female', transactionType: 'health_card_female', quantity: 5 });

    const localDb = loadDatabase();
    assert.equal(localDb.stocks.health_cards_male.currentStock, 50, 'تمت إعادة رصيد كروت الذكور');
    assert.equal(localDb.stocks.health_cards_female.currentStock, 45, 'تم خصم رصيد كروت الإناث');

    // Verify on server
    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = { ...localDb.resetBoundary };
    serverDb.stocks.health_cards_male.currentStock = 50;
    serverDb.stocks.health_cards_female.currentStock = 50;
    const processedKeys = new Set<string>();
    simulateServerTransactionProcessing(serverDb, getPendingQueue(), processedKeys, localDb.resetBoundary);

    assert.equal(serverDb.stocks.health_cards_male.currentStock, 50, 'السيرفر أعاد رصيد كروت الذكور');
    assert.equal(serverDb.stocks.health_cards_female.currentStock, 45, 'السيرفر خصم رصيد كروت الإناث');
  });

  // Test 7: DELETE Supply
  it('Test 7: DELETE Supply يسترجع الرصيد ويولد Tombstone ويمنع إعادة الإحياء', () => {
    addSupply({
      documentNumber: 'DEL-SUP',
      date: '2025-05-01',
      category: 'birth_certificates',
      quantity: 25,
      supplierSource: 'المخزن',
      receivedBy: 'أحمد'
    });

    const supId = loadDatabase().supplies[0].id;
    deleteSupply(supId, 'مدير النظام');

    const db = loadDatabase();
    assert.equal(db.supplies.length, 0);
    assert.equal(db.stocks.birth_certificates.currentStock, 0);
    assert.equal(db.tombstones.length, 1);

    // Verify server execution
    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = { ...db.resetBoundary };
    const processedKeys = new Set<string>();
    simulateServerTransactionProcessing(serverDb, getPendingQueue(), processedKeys, db.resetBoundary);

    assert.equal(serverDb.supplies.length, 0);
    assert.equal(serverDb.stocks.birth_certificates.currentStock, 0);
    assert.equal(serverDb.tombstones.length, 1);
  });

  // Test 8: DELETE Dispense
  it('Test 8: DELETE Dispense يعيد الكمية المصروفة للرصيد ويسجل Tombstone', () => {
    const clientDb = loadDatabase();
    clientDb.stocks.death_certificates.currentStock = 10;
    saveDatabase(clientDb);

    addDispense({
      category: 'death_certificates',
      transactionType: 'death',
      quantity: 2,
      citizenName: 'مواطن',
      date: '2025-05-05',
      collectedAmount: 0,
      dispensedBy: 'موظف الصحة'
    });

    const dspId = loadDatabase().dispenses[0].id;
    deleteDispense(dspId, 'مدير النظام');

    const db = loadDatabase();
    assert.equal(db.dispenses.length, 0);
    assert.equal(db.stocks.death_certificates.currentStock, 10);
    assert.equal(db.tombstones.length, 1);

    // Verify on server
    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = { ...db.resetBoundary };
    serverDb.stocks.death_certificates.currentStock = 10;
    const processedKeys = new Set<string>();
    simulateServerTransactionProcessing(serverDb, getPendingQueue(), processedKeys, db.resetBoundary);

    assert.equal(serverDb.dispenses.length, 0);
    assert.equal(serverDb.stocks.death_certificates.currentStock, 10);
    assert.equal(serverDb.tombstones.length, 1);
  });

  // Test 9: إرسال نفس Transaction مرتين (Idempotency)
  it('Test 9: إرسال نفس Transaction مرتين ينفذ العملية مرة واحدة فقط (Idempotent)', () => {
    addSupply({
      documentNumber: 'IDEMPOTENT-1',
      date: '2025-05-01',
      category: 'birth_certificates',
      quantity: 40,
      supplierSource: 'المخزن',
      receivedBy: 'أحمد'
    });

    const queue = getPendingQueue();
    assert.equal(queue.length, 1);

    const clientDb = loadDatabase();
    const serverDb = createEmptyDatabase();
    serverDb.resetBoundary = { ...clientDb.resetBoundary };
    const processedKeys = new Set<string>();

    // Send first time
    simulateServerTransactionProcessing(serverDb, queue, processedKeys, clientDb.resetBoundary);
    assert.equal(serverDb.stocks.birth_certificates.currentStock, 40);
    assert.equal(serverDb.supplies.length, 1);

    // Send second time (duplicate transmission)
    const secondRes = simulateServerTransactionProcessing(serverDb, queue, processedKeys, clientDb.resetBoundary);
    assert.equal(secondRes.acknowledgedKeys.length, 1);
    assert.equal(serverDb.stocks.birth_certificates.currentStock, 40, 'الرصيد لم يتضاعف');
    assert.equal(serverDb.supplies.length, 1, 'السجل لم يتكرر');
  });

  // Test 10: جهاز A Offline ثم Factory Reset على النظام ثم عودة A Online
  it('Test 10: جهاز A Offline ثم Factory Reset على النظام ثم عودة A Online يرفض الحركات القديمة', () => {
    // 1. Device A creates an offline supply
    addSupply({
      documentNumber: 'OLD-PRE-RESET',
      date: '2025-05-01',
      category: 'birth_certificates',
      quantity: 50,
      supplierSource: 'المخزن القديم',
      receivedBy: 'أحمد'
    });
    const deviceAQueue = getPendingQueue();
    const deviceABoundary = loadDatabase().resetBoundary;

    // 2. Central Server performs Factory Reset
    const centralServerDb = createEmptyDatabase();
    centralServerDb.resetBoundary = {
      resetId: 'rst-central-new',
      resetTimestamp: new Date(Date.now() + 1000).toISOString(),
      resetBy: 'مدير النظام المركزي'
    };

    // 3. Device A comes online later and tries to send its old queue
    const processedKeys = new Set<string>();
    const res = simulateServerTransactionProcessing(
      centralServerDb,
      deviceAQueue,
      processedKeys,
      deviceABoundary
    );

    // Must be rejected due to reset boundary violation
    assert.equal(res.status, 409);
    assert.equal(res.errorCode, 'RESET_BOUNDARY_VIOLATION');
    assert.equal(centralServerDb.supplies.length, 0, 'لم يتم قبول الحركات السابقة للتصفير');
    assert.equal(centralServerDb.stocks.birth_certificates.currentStock, 0);
  });

  // Test 11: التأكد أن Current Stock لا يتم استبداله بالحساب النظري
  it('Test 11: التأكد أن Current Stock لا يتم استبداله بالحساب النظري أبداً', () => {
    const db = loadDatabase();
    db.stocks.birth_certificates.currentStock = 85;
    db.stocks.birth_certificates.openingStock = 20;
    saveDatabase(db);

    const reloaded = loadDatabase();
    assert.equal(reloaded.stocks.birth_certificates.currentStock, 85);

    const audit = calculateTheoreticalStockForCategory(reloaded, 'birth_certificates');
    assert.equal(audit.currentStock, 85, 'الرصيد الفعلي يظل 85 دون أي تغيير');
    assert.equal(audit.theoreticalStock, 20);
    assert.equal(audit.difference, 65);
    assert.equal(audit.isBalanced, false);
  });

  // Test 12: التأكد أن صرف Health Cards لا يزيد Birth Count
  it('Test 12: التأكد أن صرف Health Cards لا يزيد Birth Count ويبقى عدد المواليد 0 عند عدم وجود مواليد فعلية', () => {
    // Add only health cards
    addDispense({
      category: 'health_cards_male',
      transactionType: 'health_card_male',
      quantity: 10,
      citizenName: 'مواطن 1',
      date: '2025-05-15',
      collectedAmount: 500,
      dispensedBy: 'موظف الصحة'
    });
    addDispense({
      category: 'health_cards_female',
      transactionType: 'health_card_female',
      quantity: 8,
      citizenName: 'مواطنة 2',
      date: '2025-05-16',
      collectedAmount: 400,
      dispensedBy: 'موظف الصحة'
    });

    const report = generateOfficialMonthlyReport(loadDatabase(), 2025, 5);

    // Birth counts must be strictly zero!
    assert.equal(report.vitalStats.birthCertificatesTotal, 0, 'عدد المواليد يجب أن يكون 0 تماماً');
    assert.equal(report.vitalStats.birthCertificatesMale, 0);
    assert.equal(report.vitalStats.birthCertificatesFemale, 0);
    assert.equal(report.vitalStats.birthNotificationsTotal, 0);

    // Health cards must be recorded accurately
    assert.equal(report.vitalStats.healthCardsMaleTotal, 10);
    assert.equal(report.vitalStats.healthCardsFemaleTotal, 8);
    assert.equal(report.vitalStats.healthCardsTotal, 18);
    assert.equal(report.vitalStats.healthCardRevenue, 900);
  });
});
