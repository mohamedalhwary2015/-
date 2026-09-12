import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  loadDatabase,
  saveDatabase,
  addSupply,
  updateSupply,
  deleteSupply,
  addDispense,
  updateDispense,
  deleteDispense,
  addLateRegistration,
  updateLateRegistration,
  deleteLateRegistration,
  manualAdjustStock,
  executeFactoryReset,
  createEmptyDatabase
} from '../src/storage/db';
import { getPendingQueue } from '../src/storage/syncManager';
import { calculateTheoreticalStockForCategory, runFullIntegrityCheck } from '../src/services/stockService';
import { generateOfficialMonthlyReport } from '../src/services/reportService';
import { safelyPurgeDuplicateTransactions } from '../src/storage/repairEngine';
import { STOCK_CATEGORIES } from '../src/types';

// Mock localStorage for Node test runner
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
  dispatchEvent: () => {}
};

describe('مكتب صحة سفلاق - اختبارات الأمان والنزاهة الدفترية', () => {
  beforeEach(() => {
    storageMap.clear();
    const cleanDb = createEmptyDatabase();
    saveDatabase(cleanDb);
  });

  it('حماية الرصيد الفعلي (currentStock) - عدم إعادة الحساب التلقائي', () => {
    const db = loadDatabase();
    // Simulate setting actual operational stock
    db.stocks.birth_certificates.currentStock = 120;
    db.stocks.birth_certificates.openingStock = 50;
    saveDatabase(db);

    const reloaded = loadDatabase();
    assert.equal(reloaded.stocks.birth_certificates.currentStock, 120, 'الرصيد الفعلي يجب أن يظل 120 ولا يستبدل');

    // Theoretical audit calculation
    const audit = calculateTheoreticalStockForCategory(reloaded, 'birth_certificates');
    assert.equal(audit.currentStock, 120);
    assert.equal(audit.theoreticalStock, 50);
    assert.equal(audit.difference, 70);
    assert.equal(audit.isBalanced, false, 'يجب تسجيل الفارق الرقابي دون تعديل الرصيد الفعلي');
  });

  it('تعديل وحذف أذون التوريد بدقة (Revert Old -> Apply New)', () => {
    addSupply({
      documentNumber: '101',
      date: '2025-05-01',
      category: 'birth_certificates',
      quantity: 50,
      supplierSource: 'مخزن الإدارة الصحية',
      receivedBy: 'أحمد علي'
    });

    let db = loadDatabase();
    assert.equal(db.stocks.birth_certificates.currentStock, 50);
    assert.equal(db.stocks.birth_certificates.totalReceived, 50);
    const supplyId = db.supplies[0].id;

    // Edit supply quantity from 50 to 80
    updateSupply(supplyId, { quantity: 80 });
    db = loadDatabase();
    assert.equal(db.stocks.birth_certificates.currentStock, 80);
    assert.equal(db.stocks.birth_certificates.totalReceived, 80);

    // Delete supply -> should revert the 80
    deleteSupply(supplyId, 'مدير النظام');
    db = loadDatabase();
    assert.equal(db.stocks.birth_certificates.currentStock, 0);
    assert.equal(db.stocks.birth_certificates.totalReceived, 0);
  });

  it('تعديل وحذف حركات الصرف بدقة (Revert Old -> Apply New)', () => {
    // Give initial stock
    let db = loadDatabase();
    db.stocks.health_cards_male.currentStock = 100;
    saveDatabase(db);

    addDispense({
      category: 'health_cards_male',
      transactionType: 'health_card_male',
      quantity: 1,
      citizenName: 'محمد السيد',
      nationalId: '29001012601234',
      date: '2025-05-02',
      childOrDeceasedName: 'عمر محمد',
      gender: 'ذكر',
      collectedAmount: 50,
      dispensedBy: 'موظف الصحة'
    });

    db = loadDatabase();
    assert.equal(db.stocks.health_cards_male.currentStock, 99);
    assert.equal(db.stocks.health_cards_male.totalDispensed, 1);
    const dispenseId = db.dispenses[0].id;

    // Update dispense to 2 items
    updateDispense(dispenseId, { quantity: 2, collectedAmount: 100 });
    db = loadDatabase();
    assert.equal(db.stocks.health_cards_male.currentStock, 98);
    assert.equal(db.stocks.health_cards_male.totalDispensed, 2);

    // Delete dispense -> should refund the 2 items back to stock
    deleteDispense(dispenseId, 'مدير النظام');
    db = loadDatabase();
    assert.equal(db.stocks.health_cards_male.currentStock, 100);
    assert.equal(db.stocks.health_cards_male.totalDispensed, 0);
  });

  it('الفصل الرقابي الحاسم في الإحصائيات (البطاقات الصحية لا تعد كشهادات ميلاد)', () => {
    const db = loadDatabase();
    // Add 1 birth certificate dispense
    addDispense({
      category: 'birth_certificates',
      transactionType: 'birth',
      quantity: 1,
      citizenName: 'محمود حسن',
      date: '2025-05-10',
      childOrDeceasedName: 'ياسين محمود',
      gender: 'ذكر',
      collectedAmount: 0,
      dispensedBy: 'موظف الصحة'
    });

    // Add 3 health card dispenses
    addDispense({
      category: 'health_cards_male',
      transactionType: 'health_card_male',
      quantity: 1,
      citizenName: 'علي سالم',
      date: '2025-05-11',
      childOrDeceasedName: 'سالم علي',
      gender: 'ذكر',
      collectedAmount: 50,
      dispensedBy: 'موظف الصحة'
    });
    addDispense({
      category: 'health_cards_female',
      transactionType: 'health_card_female',
      quantity: 2,
      citizenName: 'ياسر كمال',
      date: '2025-05-12',
      childOrDeceasedName: 'مريم ياسر',
      gender: 'أنثى',
      collectedAmount: 100,
      dispensedBy: 'موظف الصحة'
    });

    const report = generateOfficialMonthlyReport(loadDatabase(), 2025, 5);
    // Birth certificates total must be strictly 1
    assert.equal(report.vitalStats.birthCertificatesTotal, 1);
    assert.equal(report.vitalStats.birthCertificatesMale, 1);
    assert.equal(report.vitalStats.birthCertificatesFemale, 0);

    // Health cards must be separate: 1 male + 2 female = 3
    assert.equal(report.vitalStats.healthCardsMaleTotal, 1);
    assert.equal(report.vitalStats.healthCardsFemaleTotal, 2);
    assert.equal(report.vitalStats.healthCardsTotal, 3);
    assert.equal(report.vitalStats.totalCollectedRevenue, 150);
  });

  it('تصفير المصنع الشامل (Factory Reset) وتعيين حد الأمان الزمني', () => {
    addSupply({
      documentNumber: '999',
      date: '2025-05-01',
      category: 'death_certificates',
      quantity: 40,
      supplierSource: 'المخزن',
      receivedBy: 'أحمد'
    });

    executeFactoryReset('مسؤول النظام');
    const freshDb = loadDatabase();

    // Must be completely zeroed
    assert.equal(freshDb.supplies.length, 0);
    assert.equal(freshDb.dispenses.length, 0);
    assert.equal(freshDb.stocks.death_certificates.currentStock, 0);
    assert.equal(freshDb.stocks.death_certificates.totalReceived, 0);

    // Must establish a Reset Boundary
    assert.ok(freshDb.resetBoundary);
    assert.ok(freshDb.resetBoundary.resetId);
    assert.ok(freshDb.resetBoundary.resetTimestamp);

    // Queue must be purged
    assert.equal(getPendingQueue().length, 0);
  });

  it('ربط العمليات بـ Transaction Queue وثبات transactionId والحماية من التكرار', () => {
    // 1. Add Supply
    addSupply({
      documentNumber: 'SYNC-100',
      date: '2025-05-15',
      category: 'birth_certificates',
      quantity: 25,
      supplierSource: 'الإدارة',
      receivedBy: 'محمود'
    });

    let queue = getPendingQueue();
    assert.equal(queue.length, 1);
    const supplyItem = queue[0];
    assert.equal(supplyItem.operationType, 'SUPPLY_ADD');
    assert.equal(supplyItem.version, 1);
    assert.ok(supplyItem.transactionId.startsWith('tx-sup-'));
    assert.equal(supplyItem.operationKey, `SUPPLY_ADD:${supplyItem.recordId}:1`);

    // 2. Update Supply - transactionId must remain identical
    const db = loadDatabase();
    const supplyId = db.supplies[0].id;
    const initialTxId = db.supplies[0].transactionId;

    updateSupply(supplyId, { quantity: 30 });
    queue = getPendingQueue();
    assert.equal(queue.length, 2);
    const updateItem = queue[1];
    assert.equal(updateItem.operationType, 'SUPPLY_UPDATE');
    assert.equal(updateItem.version, 2);
    assert.equal(updateItem.transactionId, initialTxId, 'transactionId يجب ألا يتغير عند التعديل');
    assert.equal(updateItem.operationKey, `SUPPLY_UPDATE:${supplyId}:2`);

    // 3. Delete Supply - tombstone created with same transactionId
    deleteSupply(supplyId, 'مدير النظام');
    queue = getPendingQueue();
    assert.equal(queue.length, 3);
    const deleteItem = queue[2];
    assert.equal(deleteItem.operationType, 'SUPPLY_DELETE');
    assert.equal(deleteItem.transactionId, initialTxId, 'transactionId يجب أن يظل ثابتاً عند الحذف');

    const dbAfterDelete = loadDatabase();
    assert.equal(dbAfterDelete.supplies.length, 0);
    const tombstone = dbAfterDelete.tombstones.find(t => t.recordId === supplyId);
    assert.ok(tombstone, 'يجب تسجيل Tombstone بعد الحذف');
    assert.equal(tombstone.transactionId, initialTxId);

    // 4. Test Late Registration Queue
    addLateRegistration({
      formNumber: 'LR-2025-01',
      date: '2025-05-16',
      eventType: 'ميلاد',
      personName: 'خالد مصطفى',
      fatherName: 'مصطفى كامل',
      motherName: 'زينب أحمد',
      eventDate: '2024-01-01',
      gender: 'ذكر',
      applicantName: 'مصطفى كامل',
      applicantRelation: 'أب',
      status: 'قيد الفحص',
      staffName: 'موظف الصحة'
    });

    queue = getPendingQueue();
    assert.equal(queue.length, 4);
    const lateRegItem = queue[3];
    assert.equal(lateRegItem.operationType, 'LATE_REG_ADD');
    assert.ok(lateRegItem.transactionId.startsWith('tx-lreg-'));

    // 5. Test Dispense Queue
    addDispense({
      category: 'death_certificates',
      transactionType: 'death',
      quantity: 1,
      citizenName: 'فاطمة عمر',
      date: '2025-05-17',
      childOrDeceasedName: 'عمر السيد',
      gender: 'ذكر',
      collectedAmount: 0,
      dispensedBy: 'موظف الصحة'
    });

    queue = getPendingQueue();
    assert.equal(queue.length, 5);
    const dispenseItem = queue[4];
    assert.equal(dispenseItem.operationType, 'DISPENSE_ADD');
    assert.ok(dispenseItem.transactionId.startsWith('tx-dsp-'));
  });

  it('تغيير الصنف في التوريد والصرف يعدل كلا الصنفين بدقة', () => {
    // Start with supplies
    addSupply({
      documentNumber: 'CAT-1',
      date: '2025-05-01',
      category: 'birth_certificates',
      quantity: 20,
      supplierSource: 'المخزن',
      receivedBy: 'أحمد'
    });

    let db = loadDatabase();
    assert.equal(db.stocks.birth_certificates.currentStock, 20);
    assert.equal(db.stocks.death_certificates.currentStock, 0);

    const supId = db.supplies[0].id;
    // Change category to death_certificates
    updateSupply(supId, { category: 'death_certificates' as any, quantity: 20 });

    db = loadDatabase();
    assert.equal(db.stocks.birth_certificates.currentStock, 0, 'تم استرجاع رصيد الصنف القديم');
    assert.equal(db.stocks.death_certificates.currentStock, 20, 'تمت إضافة الرصيد للصنف الجديد');
  });
});
