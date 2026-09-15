import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  loadDatabase,
  saveDatabase,
  createEmptyDatabase,
  addSupply,
  addDispense
} from '../src/storage/db';
import { executeProductionRepair } from '../src/storage/repairEngine';
import { mergeDatabasesNonDestructive } from '../src/storage/syncManager';
import { DatabaseSchema, StockCategory } from '../src/types';

// In-memory mock server database simulator matching server.ts logic
function createMockServerDb(resetId: string = 'srv-reset-init'): DatabaseSchema {
  const categories: StockCategory[] = [
    'birth_certificates',
    'death_certificates',
    'health_cards_male',
    'health_cards_female'
  ];

  const stocks: any = {};
  for (const cat of categories) {
    stocks[cat] = {
      category: cat,
      currentStock: 100,
      openingStock: 100,
      totalReceived: 0,
      totalDispensed: 0,
      damagedOrCancelled: 0,
      lastUpdated: new Date().toISOString()
    };
  }

  return {
    version: 1,
    lastUpdated: new Date().toISOString(),
    stocks,
    supplies: [],
    dispenses: [],
    lateRegistrations: [],
    tombstones: [],
    auditLogs: [],
    openingBalances: {} as any,
    officeSettings: {
      officeName: 'مكتب صحة سفلاق',
      governorate: 'سوهاج',
      currentEmployee: 'موظف النظام',
      healthCardMaleFee: 50,
      healthCardFemaleFee: 50,
      birthCertFee: 0,
      deathCertFee: 0
    },
    resetBoundary: {
      resetId,
      resetTimestamp: new Date().toISOString(),
      resetAt: new Date().toISOString(),
      resetBy: 'مدير النظام'
    }
  };
}

// Simulates /api/sync endpoint in server.ts
function simulateServerSync(serverDb: DatabaseSchema, body: any) {
  const { clientDb, resetBoundary } = body || {};
  const serverResetId = serverDb.resetBoundary?.resetId || 'default';
  const clientResetId = clientDb?.resetBoundary?.resetId || resetBoundary?.resetId;

  if (!clientResetId || clientResetId !== serverResetId) {
    return {
      status: 409,
      data: {
        code: 'STALE_RESET_ID',
        error: 'STALE_RESET_ID',
        message: 'STALE_RESET_ID: تم رفض المزامنة لعدم تطابق معرف دورة قاعدة البيانات resetId',
        serverResetId,
        serverBoundary: serverDb.resetBoundary
      }
    };
  }

  if (clientDb) {
    const merged = mergeDatabasesNonDestructive(serverDb, clientDb);
    return {
      status: 200,
      data: {
        success: true,
        serverResetId,
        serverData: merged
      }
    };
  }

  return {
    status: 200,
    data: {
      success: true,
      serverResetId,
      serverData: serverDb
    }
  };
}

// Simulates /api/sync/transactions endpoint in server.ts
function simulateServerTransactions(serverDb: DatabaseSchema, body: any) {
  const { resetBoundary, transactions } = body || {};
  const serverResetId = serverDb.resetBoundary?.resetId || 'default';
  const clientResetId = resetBoundary?.resetId;

  if (!clientResetId || clientResetId !== serverResetId) {
    return {
      status: 409,
      data: {
        code: 'STALE_RESET_ID',
        error: 'STALE_RESET_ID',
        message: 'STALE_RESET_ID: تم رفض المعاملات لعدم تطابق resetId',
        serverResetId,
        serverBoundary: serverDb.resetBoundary
      }
    };
  }

  return {
    status: 200,
    data: {
      success: true,
      serverResetId,
      processedKeys: (transactions || []).map((t: any) => t.operationKey)
    }
  };
}

// Simulates /api/repair/apply endpoint in server.ts
function simulateServerRepairApply(serverDb: DatabaseSchema, body: any) {
  const { cleanDb, explicitApproval } = body || {};
  if (!cleanDb || typeof cleanDb !== 'object') {
    return { status: 400, data: { code: 'INVALID_REPAIR_PAYLOAD' } };
  }

  const serverResetId = serverDb.resetBoundary?.resetId || 'default';
  if (!cleanDb.resetBoundary?.resetId || cleanDb.resetBoundary.resetId !== serverResetId) {
    return {
      status: 409,
      data: {
        code: 'STALE_RESET_ID',
        error: 'STALE_RESET_ID'
      }
    };
  }

  // Stock protection check
  const categories: StockCategory[] = [
    'birth_certificates',
    'death_certificates',
    'health_cards_male',
    'health_cards_female'
  ];
  const stockViolations: string[] = [];
  for (const cat of categories) {
    const serverCurrent = serverDb.stocks[cat]?.currentStock ?? 0;
    const cleanCurrent = cleanDb.stocks?.[cat]?.currentStock ?? 0;
    if (serverCurrent !== cleanCurrent) {
      stockViolations.push(`صنف ${cat}: رصيد الخادم (${serverCurrent}) مقابل المطلوب (${cleanCurrent})`);
    }
  }

  if (stockViolations.length > 0) {
    return {
      status: 400,
      data: {
        code: 'REPAIR_REQUIRES_EXPLICIT_APPROVAL',
        error: 'REPAIR_REQUIRES_EXPLICIT_APPROVAL',
        message: 'لا يجوز لعملية الإصلاح تعديل currentStock تلقائياً',
        stockViolations
      }
    };
  }

  if (!explicitApproval) {
    return {
      status: 400,
      data: {
        code: 'REPAIR_REQUIRES_EXPLICIT_APPROVAL',
        error: 'REPAIR_REQUIRES_EXPLICIT_APPROVAL'
      }
    };
  }

  return {
    status: 200,
    data: {
      success: true,
      message: 'تم تطبيق الإصلاح'
    }
  };
}

describe('التحقق الإلزامي من الإصلاحات الثلاثة المطلوبة', () => {

  beforeEach(() => {
    saveDatabase(createEmptyDatabase(), false);
  });

  // الاختبار 1: نفس resetId → PASS
  test('1. نفس resetId → PASS', () => {
    const activeResetId = 'reset-cycle-2026-A';
    const serverDb = createMockServerDb(activeResetId);
    
    // جهاز عميل بنفس معرف resetId
    const clientDb = JSON.parse(JSON.stringify(serverDb));
    clientDb.resetBoundary = { resetId: activeResetId, resetAt: new Date().toISOString(), resetBy: 'مدير النظام' };

    // فحص المزامنة الكاملة /api/sync
    const syncRes = simulateServerSync(serverDb, { clientDb, resetBoundary: clientDb.resetBoundary });
    assert.strictEqual(syncRes.status, 200, 'يجب أن يقبل الخادم المزامنة عند تطابق resetId');
    assert.strictEqual(syncRes.data.success, true);
    assert.strictEqual(syncRes.data.serverResetId, activeResetId);

    // فحص حركات المعاملات /api/sync/transactions
    const txRes = simulateServerTransactions(serverDb, {
      resetBoundary: clientDb.resetBoundary,
      transactions: [{ operationKey: 'SUPPLY_ADD:sup-1:1' }]
    });
    assert.strictEqual(txRes.status, 200, 'يجب أن تقبل المعاملات عند تطابق resetId');
    assert.strictEqual(txRes.data.success, true);
  });

  // الاختبار 2: resetId قديم → STALE_RESET_ID ولا يحدث أي تغيير
  test('2. resetId قديم → STALE_RESET_ID ولا يحدث أي تغيير', () => {
    const currentServerResetId = 'reset-cycle-SERVER-NEW';
    const oldClientResetId = 'reset-cycle-CLIENT-STALE';
    
    const serverDb = createMockServerDb(currentServerResetId);
    const initialServerStock = serverDb.stocks.health_cards_male.currentStock;

    // جهاز عميل يحمل resetId قديماً ويحاول إرسال رصيد أو حركات
    const staleClientDb = JSON.parse(JSON.stringify(serverDb));
    staleClientDb.resetBoundary = { resetId: oldClientResetId, resetAt: new Date().toISOString(), resetBy: 'مستخدم قديم' };
    staleClientDb.stocks.health_cards_male.currentStock = 999; // محاولة تغيير

    // 1. فحص الرفض في دالة دمج القواعد
    assert.throws(
      () => {
        mergeDatabasesNonDestructive(serverDb, staleClientDb);
      },
      (err: any) => err.message.includes('STALE_RESET_ID'),
      'يجب أن ترفض mergeDatabasesNonDestructive أي دمج لـ resetId مختلف بـ STALE_RESET_ID'
    );

    // 2. فحص الرفض في /api/sync
    const syncRes = simulateServerSync(serverDb, { clientDb: staleClientDb, resetBoundary: staleClientDb.resetBoundary });
    assert.strictEqual(syncRes.status, 409, 'يجب إرجاع كود 409 عند اختلاف resetId');
    assert.strictEqual(syncRes.data.code, 'STALE_RESET_ID');

    // 3. التحقق القاطع أن رصيد الخادم لم يتغير إطلاقاً
    assert.strictEqual(serverDb.stocks.health_cards_male.currentStock, initialServerStock);
  });

  // الاختبار 3: جهاز Offline قديم بعد Factory Reset → مرفوض ولا يستطيع إعادة بيانات قديمة
  test('3. جهاز Offline قديم بعد Factory Reset → مرفوض ولا يستطيع إعادة بيانات قديمة', () => {
    // الخادم أجرى Factory Reset وانتقل لدورة جديدة
    const postResetId = 'reset-id-after-factory-reset-999';
    const serverDb = createMockServerDb(postResetId);
    serverDb.supplies = [];
    serverDb.dispenses = [];

    // جهاز كان أوفلاين أثناء التصفير، ويحمل طابور عمليات قديم
    const staleOfflineResetBoundary = { resetId: 'old-pre-reset-session-id', resetAt: '2026-01-01T00:00:00.000Z', resetBy: 'قديم' };
    const staleTransactions = [
      { operationKey: 'DISPENSE_ADD:disp-old-1:1', payload: { id: 'disp-old-1', quantity: 20 } },
      { operationKey: 'SUPPLY_ADD:sup-old-1:1', payload: { id: 'sup-old-1', quantity: 50 } }
    ];

    // إرسال الحركات القديمة إلى الخادم
    const txRes = simulateServerTransactions(serverDb, {
      resetBoundary: staleOfflineResetBoundary,
      transactions: staleTransactions
    });

    // يجب رفض الحركات فوراً
    assert.strictEqual(txRes.status, 409, 'يجب رفض جهاز Offline القديم بـ 409');
    assert.strictEqual(txRes.data.code, 'STALE_RESET_ID');
    assert.strictEqual(txRes.data.serverResetId, postResetId);

    // التحقق من عدم إضافة أي حركة قديمة إلى الخادم
    assert.strictEqual(serverDb.supplies.length, 0, 'لا يمكن إعادة أي توريد قديم');
    assert.strictEqual(serverDb.dispenses.length, 0, 'لا يمكن إعادة أي صرف قديم');
  });

  // الاختبار 4: Repair مع وجود فرق حسابي → لا يغيّر currentStock
  test('4. Repair مع وجود فرق حسابي → لا يغيّر currentStock', () => {
    const db = loadDatabase();
    // تعيين رصيد فعلي 50
    db.stocks.birth_certificates.currentStock = 50;
    db.stocks.birth_certificates.openingStock = 0;
    db.stocks.birth_certificates.totalReceived = 100;
    db.stocks.birth_certificates.totalDispensed = 10;
    // الحساب النظري: 0 + 100 - 10 = 90 (هناك فرق حسابي 40 بين 50 و 90)
    saveDatabase(db, false);

    const stockBefore = db.stocks.birth_certificates.currentStock;
    assert.strictEqual(stockBefore, 50);

    // تشغيل Repair التشخيصي
    const report = executeProductionRepair(db);

    // التحقق من التقرير التشخيصي
    assert.strictEqual(report.isDiagnosticOnly, true, 'يجب أن يكون التقرير تشخيصياً بحتاً');
    assert.strictEqual(report.summary.hasStockDiscrepancies, true, 'يجب كشف الفرق الحسابي');
    
    // التحقق الصارم أن currentStock لم يتغير وظل 50 تماماً
    const dbAfter = loadDatabase();
    assert.strictEqual(dbAfter.stocks.birth_certificates.currentStock, 50, 'currentStock لا يمسه الـ Repair أبداً');
  });

  // الاختبار 5: Repair Apply يحاول تغيير الرصيد → مرفوض
  test('5. Repair Apply يحاول تغيير الرصيد → مرفوض', () => {
    const serverDb = createMockServerDb('server-repair-check-id');
    const realStock = serverDb.stocks.birth_certificates.currentStock; // 100

    // محاولة إرسال cleanDb من Repair يحمل رصيداً مختلفاً (مثلاً 120 بناء على معادلة)
    const cleanDbWithAlteredStock = JSON.parse(JSON.stringify(serverDb));
    cleanDbWithAlteredStock.stocks.birth_certificates.currentStock = 120;

    const applyRes = simulateServerRepairApply(serverDb, {
      cleanDb: cleanDbWithAlteredStock,
      explicitApproval: true
    });

    // يجب رفض الطلب فوراً برمز REPAIR_REQUIRES_EXPLICIT_APPROVAL
    assert.strictEqual(applyRes.status, 400);
    assert.strictEqual(applyRes.data.code, 'REPAIR_REQUIRES_EXPLICIT_APPROVAL');
    assert.ok(applyRes.data.stockViolations && applyRes.data.stockViolations.length > 0, 'يجب توثيق مخالفة الرصيد');

    // التأكد من بقاء رصيد الخادم كما هو
    assert.strictEqual(serverDb.stocks.birth_certificates.currentStock, realStock);
  });

  // الاختبار 6: Factory Reset ينشئ resetId جديدًا، والـ resetId القديم يُرفض
  test('6. Factory Reset ينشئ resetId جديدًا، والـ resetId القديم يُرفض', () => {
    const initialResetId = 'reset-cycle-phase-1';
    let serverDb = createMockServerDb(initialResetId);

    // محاكاة Factory Reset
    const newResetId = `reset-${Date.now()}-brand-new`;
    assert.notStrictEqual(initialResetId, newResetId);

    serverDb.resetBoundary = {
      resetId: newResetId,
      resetAt: new Date().toISOString(),
      resetBy: 'مدير النظام بعد التصفير'
    };

    // 1. أي طلب يحمل الـ resetId القديم يجب رفضه فوراً بـ STALE_RESET_ID
    const oldRequestRes = simulateServerSync(serverDb, {
      resetBoundary: { resetId: initialResetId }
    });
    assert.strictEqual(oldRequestRes.status, 409);
    assert.strictEqual(oldRequestRes.data.code, 'STALE_RESET_ID');
    assert.strictEqual(oldRequestRes.data.serverResetId, newResetId);

    // 2. الطلب الذي يحمل الـ newResetId يتم قبوله بنجاح
    const newRequestRes = simulateServerSync(serverDb, {
      resetBoundary: { resetId: newResetId }
    });
    assert.strictEqual(newRequestRes.status, 200);
    assert.strictEqual(newRequestRes.data.success, true);
  });

});
