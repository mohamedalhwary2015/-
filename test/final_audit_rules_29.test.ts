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
  addLateRegistration,
  executeFactoryReset,
  manualAdjustStock,
  setOpeningBalance
} from '../src/storage/db';
import {
  enqueueTransaction,
  getPendingQueue,
  clearPendingQueue,
  mergeServerDataSafely
} from '../src/storage/syncManager';
import { generateOfficialMonthlyReport } from '../src/services/reportService';
import { DatabaseSchema, StockCategory, SyncTransactionItem, AuditLogEntry } from '../src/types';

// Mock storage environment
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

describe('Rule 29: الاختبارات الآلية الشاملة للحالات الـ 14 الحرجة', () => {
  beforeEach(() => {
    storageMap.clear();
  });

  // Test 1: Supply Add / Update / Delete
  it('Test 1: Supply Add / Update / Delete يعدل الرصيد الفعلي بدقة', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 100;
    saveDatabase(db);

    // 1. Add
    const withSup = addSupply({
      date: '2026-03-01',
      documentNumber: 'SUP-001',
      category: 'birth_certificates',
      quantity: 50,
      receivedBy: 'الموظف المسئول',
      supplierSource: 'مخزن المديرية'
    });
    assert.equal(withSup.stocks.birth_certificates.currentStock, 150);
    const supId = withSup.supplies[0].id;

    // 2. Update
    const withUpd = updateSupply(supId, { quantity: 70 }, 'الموظف المسئول');
    assert.equal(withUpd.stocks.birth_certificates.currentStock, 170);

    // 3. Delete
    const withDel = deleteSupply(supId, 'الموظف المسئول');
    assert.equal(withDel.stocks.birth_certificates.currentStock, 100);
    assert.equal(withDel.supplies.length, 0);
  });

  // Test 2: Dispense Add / Update / Delete
  it('Test 2: Dispense Add / Update / Delete يخصم ويسترجع الرصيد بدقة', () => {
    const db = createEmptyDatabase();
    db.stocks.death_certificates.currentStock = 50;
    saveDatabase(db);

    // 1. Add
    const withDsp = addDispense({
      date: '2026-03-02',
      citizenName: 'مواطن تجربة',
      transactionType: 'death',
      gender: 'ذكر',
      category: 'death_certificates',
      quantity: 5,
      dispensedBy: 'الموظف المسئول',
      collectedAmount: 0
    });
    assert.equal(withDsp.stocks.death_certificates.currentStock, 45);
    const dspId = withDsp.dispenses[0].id;

    // 2. Update
    const withUpd = updateDispense(dspId, { quantity: 8 }, 'الموظف المسئول');
    assert.equal(withUpd.stocks.death_certificates.currentStock, 42);

    // 3. Delete
    const withDel = deleteDispense(dspId, 'الموظف المسئول');
    assert.equal(withDel.stocks.death_certificates.currentStock, 50);
    assert.equal(withDel.dispenses.length, 0);
  });

  // Test 3: Category change in supply
  it('Test 3: Category change in supply يعكس الكمية من الصنف القديم ويضيفها للصنف الجديد', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 100;
    db.stocks.death_certificates.currentStock = 50;
    saveDatabase(db);

    const s1 = addSupply({
      date: '2026-03-01',
      documentNumber: 'SUP-CAT-01',
      category: 'birth_certificates',
      quantity: 20,
      receivedBy: 'الموظف المسئول',
      supplierSource: 'مخزن المديرية'
    });
    assert.equal(s1.stocks.birth_certificates.currentStock, 120);

    const updated = updateSupply(s1.supplies[0].id, {
      category: 'death_certificates',
      quantity: 20
    });

    assert.equal(updated.stocks.birth_certificates.currentStock, 100);
    assert.equal(updated.stocks.death_certificates.currentStock, 70);
  });

  // Test 4: Category change in dispense
  it('Test 4: Category change in dispense يعيد كمية الصنف القديم ويخصم كمية الصنف الجديد', () => {
    const db = createEmptyDatabase();
    db.stocks.health_cards_male.currentStock = 80;
    db.stocks.health_cards_female.currentStock = 60;
    saveDatabase(db);

    const d1 = addDispense({
      date: '2026-03-01',
      citizenName: 'مواطن تجربة',
      transactionType: 'health_card_male',
      gender: 'ذكر',
      category: 'health_cards_male',
      quantity: 1,
      dispensedBy: 'الموظف المسئول',
      collectedAmount: 50
    });
    assert.equal(d1.stocks.health_cards_male.currentStock, 79);

    const updated = updateDispense(d1.dispenses[0].id, {
      category: 'health_cards_female',
      transactionType: 'health_card_female',
      gender: 'أنثى'
    });

    assert.equal(updated.stocks.health_cards_male.currentStock, 80);
    assert.equal(updated.stocks.health_cards_female.currentStock, 59);
  });

  // Test 5: Idempotent sync
  it('Test 5: Idempotent sync - إرسال نفس العملية مرتين لا يغير الرصيد مرتين', () => {
    const localDb = createEmptyDatabase();
    localDb.stocks.birth_certificates.currentStock = 50;

    const serverData: Partial<DatabaseSchema> = {
      stocks: {
        ...localDb.stocks,
        birth_certificates: {
          ...localDb.stocks.birth_certificates,
          currentStock: 75
        }
      },
      supplies: [
        {
          id: 'sup-sync-idem',
          transactionId: 'tx-idem-1',
          date: '2026-03-01',
          documentNumber: 'DOC-1',
          category: 'birth_certificates',
          quantity: 25,
          receivedBy: 'كاتب',
          supplierSource: 'مخزن',
          version: 1,
          updatedAt: new Date().toISOString()
        }
      ]
    };

    // First merge
    mergeServerDataSafely(localDb, serverData);
    assert.equal(localDb.stocks.birth_certificates.currentStock, 75);

    // Second merge (duplicate transmission)
    mergeServerDataSafely(localDb, serverData);
    assert.equal(localDb.stocks.birth_certificates.currentStock, 75);
  });

  // Test 6: Factory reset isolation
  it('Test 6: Factory reset isolation - يمنع الجلسات السابقة من إحياء البيانات القديمة', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 200;
    saveDatabase(db);

    const clean = executeFactoryReset('مدير المركز');
    assert.equal(clean.stocks.birth_certificates.currentStock, 0);
    assert.equal(clean.supplies.length, 0);
    assert.equal(clean.dispenses.length, 0);
    assert.ok(clean.resetBoundary.resetTimestamp);
  });

  // Test 7: Tombstone enforcement
  it('Test 7: Tombstone enforcement - يمنع إعادة إحياء السجلات المحذوفة', () => {
    const localDb = createEmptyDatabase();
    localDb.stocks.birth_certificates.currentStock = 100;
    localDb.tombstones.push({
      recordId: 'sup-deleted-1',
      recordType: 'supply',
      transactionId: 'tx-sup-del-1',
      deletedAt: new Date().toISOString(),
      version: 2
    });

    const serverDataWithResurrected: Partial<DatabaseSchema> = {
      supplies: [
        {
          id: 'sup-deleted-1',
          transactionId: 'tx-sup-del-1',
          date: '2026-03-01',
          documentNumber: 'DOC-OLD',
          category: 'birth_certificates',
          quantity: 50,
          receivedBy: 'كاتب',
          supplierSource: 'مخزن',
          version: 1,
          updatedAt: new Date().toISOString()
        }
      ]
    };

    mergeServerDataSafely(localDb, serverDataWithResurrected);
    assert.equal(localDb.stocks.birth_certificates.currentStock, 100);
    assert.equal(localDb.supplies.length, 0);
  });

  // Test 8: Regular Audit Log should NOT change currentStock
  it('Test 8: Audit Log عادي لا يغير currentStock أبداً', () => {
    const localDb = createEmptyDatabase();
    localDb.stocks.birth_certificates.currentStock = 45;

    const serverDataWithAuditLog: Partial<DatabaseSchema> = {
      auditLogs: [
        {
          id: 'audit-regular-1',
          timestamp: new Date().toISOString(),
          action: 'تعديل بيانات المكتب الرسمية',
          details: 'تغيير اسم كاتب الصحة',
          performedBy: 'مدير النظام',
          newValue: 999
        },
        {
          id: 'audit-regular-2',
          timestamp: new Date().toISOString(),
          action: 'طباعة تقرير شهري',
          category: 'birth_certificates',
          details: 'طباعة التقرير الإحصائي',
          performedBy: 'الكاتب',
          newValue: 500
        }
      ]
    };

    mergeServerDataSafely(localDb, serverDataWithAuditLog);
    // currentStock MUST remain exactly 45!
    assert.equal(localDb.stocks.birth_certificates.currentStock, 45);
  });

  // Test 9: Opening balance on existing running stock should NOT change currentStock
  it('Test 9: Opening balance on existing running stock لا يغير currentStock', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 120;
    db.stocks.birth_certificates.totalReceived = 50;
    db.stocks.birth_certificates.totalDispensed = 20;
    saveDatabase(db);

    const res = setOpeningBalance('birth_certificates', 300, 'أمين العهدة', 'تعديل رصيد دفتري');
    assert.equal(res.stocks.birth_certificates.openingStock, 300);
    // currentStock MUST remain 120!
    assert.equal(res.stocks.birth_certificates.currentStock, 120);
  });

  // Test 10: Two devices performing conflicting manual adjustments
  it('Test 10: Two devices performing conflicting manual adjustments يسجل SYNC_CONFLICT ولا يدمر الرصيد بصمت', () => {
    const localDb = createEmptyDatabase();
    localDb.stocks.birth_certificates.currentStock = 50;
    saveDatabase(localDb);

    // Terminal A (local) performs a manual adjustment offline to 60
    enqueueTransaction('MANUAL_STOCK_ADJUSTMENT', 'adj-local', 1, {
      category: 'birth_certificates',
      newActualStock: 60,
      timestamp: new Date().toISOString()
    }, 'tx-adj-local');

    // Terminal B sent an adjustment to 80 to the server
    const serverData: Partial<DatabaseSchema> = {
      auditLogs: [
        {
          id: 'audit-remote-adj',
          timestamp: new Date().toISOString(),
          action: 'تسوية رصيد جرد يدوي صريح',
          category: 'birth_certificates',
          details: 'تعديل الرصيد الفعلي من 50 إلى 80',
          performedBy: 'كاتب فرعي',
          newValue: 80,
          transactionId: 'tx-adj-remote',
          operationType: 'MANUAL_STOCK_ADJUSTMENT'
        }
      ]
    };

    mergeServerDataSafely(localDb, serverData);

    // Conflict MUST be registered in auditLogs as SYNC_CONFLICT
    const conflictLog = localDb.auditLogs.find(a => a.action === 'SYNC_CONFLICT');
    assert.ok(conflictLog, 'يجب تسجيل SYNC_CONFLICT عند وجود تعارض حقيقي في تسوية الرصيد');
    // Local stock should NOT be silently destroyed to 80 while local adjustment is pending
    assert.equal(localDb.stocks.birth_certificates.currentStock, 50);

    clearPendingQueue();
  });

  // Test 11: Health cards dispense should not increase birth certificates count
  it('Test 11: Health cards dispense لا تزيد إحصائية شهادات الميلاد أبداً', () => {
    const db = createEmptyDatabase();
    db.stocks.health_cards_male.currentStock = 10;
    db.stocks.health_cards_female.currentStock = 10;
    saveDatabase(db);

    addDispense({
      date: '2026-03-05',
      citizenName: 'مواطن بطاقة ذكر',
      transactionType: 'health_card_male',
      gender: 'ذكر',
      category: 'health_cards_male',
      quantity: 1,
      dispensedBy: 'الكاتب',
      collectedAmount: 50
    });

    addDispense({
      date: '2026-03-05',
      citizenName: 'مواطن بطاقة أنثى',
      transactionType: 'health_card_female',
      gender: 'أنثى',
      category: 'health_cards_female',
      quantity: 1,
      dispensedBy: 'الكاتب',
      collectedAmount: 50
    });

    const report = generateOfficialMonthlyReport(loadDatabase(), 2026, 3);
    assert.equal(report.vitalStats.birthCertificatesTotal, 0, 'شهادات الميلاد يجب أن تكون 0');
    assert.equal(report.vitalStats.birthCertificatesMale, 0);
    assert.equal(report.vitalStats.birthCertificatesFemale, 0);
    assert.equal(report.vitalStats.healthCardsMaleTotal, 1);
    assert.equal(report.vitalStats.healthCardsFemaleTotal, 1);
    assert.equal(report.vitalStats.healthCardsTotal, 2);
    assert.equal(report.vitalStats.healthCardRevenue, 100);
  });

  // Test 12: Late registrations should not modify stock
  it('Test 12: Late registrations لا تؤثر على الأرصدة المخزنية', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 77;
    saveDatabase(db);

    addLateRegistration({
      formNumber: 'FORM-999',
      date: '2026-03-05',
      personName: 'ساقط قيد',
      fatherName: 'أحمد',
      motherName: 'فاطمة',
      eventDate: '2020-01-01',
      eventType: 'ميلاد',
      gender: 'ذكر',
      applicantName: 'ولي الأمر',
      applicantRelation: 'والد',
      status: 'قيد الفحص',
      staffName: 'الموظف المختص'
    });

    const current = loadDatabase();
    assert.equal(current.stocks.birth_certificates.currentStock, 77);
    assert.equal(current.lateRegistrations.length, 1);
  });

  // Test 13: Restart / page refresh retains currentStock exactly
  it('Test 13: Restart / page refresh يحتفظ بـ currentStock كما هو بالضبط', () => {
    const db = createEmptyDatabase();
    db.stocks.birth_certificates.currentStock = 142;
    db.stocks.death_certificates.currentStock = 88;
    saveDatabase(db);

    // Simulate page reload / system restart by reading directly from storage
    const reloaded = loadDatabase();
    assert.equal(reloaded.stocks.birth_certificates.currentStock, 142);
    assert.equal(reloaded.stocks.death_certificates.currentStock, 88);
  });

  // Test 14: No demo / seed / initial stock auto-generated
  it('Test 14: No demo / seed / initial stock auto-generated - قاعدة البيانات الفارغة خالية تماماً', () => {
    const cleanDb = createEmptyDatabase();
    assert.equal(cleanDb.supplies.length, 0);
    assert.equal(cleanDb.dispenses.length, 0);
    assert.equal(cleanDb.lateRegistrations.length, 0);
    assert.equal(cleanDb.auditLogs.length, 0);
    for (const cat of Object.keys(cleanDb.stocks) as StockCategory[]) {
      assert.equal(cleanDb.stocks[cat].currentStock, 0);
      assert.equal(cleanDb.stocks[cat].openingStock, 0);
      assert.equal(cleanDb.stocks[cat].totalReceived, 0);
      assert.equal(cleanDb.stocks[cat].totalDispensed, 0);
    }
  });
});
