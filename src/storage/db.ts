import { 
  AppDatabase, 
  DispenseRecord, 
  LateRegistrationRecord, 
  LateRegStatus,
  LateRegTrackingStep,
  OpeningBalanceRecord, 
  OpeningBalanceItem, 
  ResetBoundary,
  SerialRange,
  StockCategory, 
  SupplyTransaction,
  SyncTombstone,
  STOCK_CATEGORIES_INFO
} from '../types';

export { STOCK_CATEGORIES_INFO };
import { 
  validateDispenseAvailability, 
  recalculateAllStocks, 
  runFullIntegrityCheck 
} from '../services/stockService';
export { validateDispenseAvailability, recalculateAllStocks, runFullIntegrityCheck };
import { getApiAuthHeaders, getAdminSecretKey } from './apiAuth';
import { 
  executeAutoSync, 
  markHasPendingChanges,
  enqueueSyncItem,
  generateGlobalTxId,
  getOrCreateDeviceId,
  isFactoryResetInProgress,
  setFactoryResetInProgress,
  clearAllSyncQueueAndLocks,
  saveDurableSnapshotToIDB,
  saveAutoSyncConfig,
  getPendingQueueCount,
  checkRealInternetConnection
} from './syncManager';

const STORAGE_KEY = 'saflaq_health_office_db_v1';
let debounceSyncTimer: any = null;

export const INITIAL_DATABASE: AppDatabase = {
  version: 1,
  lastBackupDate: new Date().toISOString(),
  officeSettings: {
    officeName: 'مكتب صحة سفلاق',
    center: 'مركز ساقلتة',
    directorate: 'الإدارة الصحية بساقلتة',
    governorate: 'محافظة سوهاج',
    currentEmployee: 'كاتب صحة سفلاق',
  },
  stocks: {
    birth_certificates: {
      id: 'birth_certificates',
      name: 'شهادات الميلاد الورقية الرسمية',
      category: 'birth',
      currentStock: 145,
      totalReceived: 150,
      totalDispensed: 2,
      damagedOrCancelled: 3,
      minThreshold: 30,
      unit: 'شهادة / استمارة',
      lastUpdated: new Date().toISOString(),
    },
    birth_notifications: {
      id: 'birth_notifications',
      name: 'بلاغات الميلاد (إخطار تبليغ)',
      category: 'birth',
      currentStock: 0,
      totalReceived: 0,
      totalDispensed: 2,
      damagedOrCancelled: 0,
      minThreshold: 30,
      unit: 'أصل بلاغ',
      lastUpdated: new Date().toISOString(),
    },
    death_certificates: {
      id: 'death_certificates',
      name: 'شهادات الوفاة الورقية الرسمية',
      category: 'death',
      currentStock: 0,
      totalReceived: 0,
      totalDispensed: 2,
      damagedOrCancelled: 1,
      minThreshold: 20,
      unit: 'شهادة / استمارة',
      lastUpdated: new Date().toISOString(),
    },
    death_notifications: {
      id: 'death_notifications',
      name: 'بلاغات الوفاة (إخطار تبليغ)',
      category: 'death',
      currentStock: 0,
      totalReceived: 0,
      totalDispensed: 2,
      damagedOrCancelled: 0,
      minThreshold: 20,
      unit: 'أصل بلاغ',
      lastUpdated: new Date().toISOString(),
    },
    health_cards_male: {
      id: 'health_cards_male',
      name: 'بطاقات صحية ذكور (تطعيمات ورعاية)',
      category: 'health_card',
      currentStock: 99,
      totalReceived: 100,
      totalDispensed: 1,
      damagedOrCancelled: 0,
      minThreshold: 25,
      unit: 'بطاقة',
      lastUpdated: new Date().toISOString(),
    },
    health_cards_female: {
      id: 'health_cards_female',
      name: 'بطاقات صحية إناث (تطعيمات ورعاية)',
      category: 'health_card',
      currentStock: 99,
      totalReceived: 100,
      totalDispensed: 1,
      damagedOrCancelled: 0,
      minThreshold: 25,
      unit: 'بطاقة',
      lastUpdated: new Date().toISOString(),
    },
    late_reg_under_year: {
      id: 'late_reg_under_year',
      name: 'استمارات ساقط قيد (أقل من عام)',
      category: 'late_registration',
      currentStock: 0,
      totalReceived: 0,
      totalDispensed: 0,
      damagedOrCancelled: 0,
      minThreshold: 15,
      unit: 'استمارة / نموذج',
      lastUpdated: new Date().toISOString(),
    },
    late_reg_over_year: {
      id: 'late_reg_over_year',
      name: 'استمارات ساقط قيد (أكبر من عام)',
      category: 'late_registration',
      openingStock: 0,
      openingSerialFrom: '001401',
      openingSerialTo: '001440',
      currentStock: 0,
      totalReceived: 0,
      totalDispensed: 0,
      damagedOrCancelled: 0,
      minThreshold: 15,
      unit: 'استمارة / نموذج',
      lastUpdated: new Date().toISOString(),
    },
  },
  openingBalances: {
    asOfDate: '2026-01-01',
    minuteNumber: 'محضر جرد عهدة رقم 1 لسنة 2026',
    inventoryKeeper: 'أحمد محمود (كاتب صحة سفلاق)',
    committeeLeader: 'د. مفتش صحة سفلاق',
    committeeMember: 'مراقب أول صحة سفلاق',
    officeManager: 'مدير مكتب صحة سفلاق',
    notes: 'تم جرد العهدة الدفترية والمستندية بمكتب صحة سفلاق ومطابقة الأرصدة مع دفاتر القيد الرسمية وسجلات السجل المدني بساقلتة.',
    createdAt: '2026-01-01T08:00:00Z',
    updatedAt: '2026-01-01T08:00:00Z',
    items: {
      birth_certificates: {
        stockCategory: 'birth_certificates',
        openingQuantity: 150,
        serialFrom: '0141851',
        serialTo: '0142000',
        minThreshold: 30,
        notes: 'دفاتر مسلسلة معتمدة من مديرية الشؤون الصحية بسوهاج',
      },
      birth_notifications: {
        stockCategory: 'birth_notifications',
        openingQuantity: 150,
        serialFrom: '003201',
        serialTo: '003350',
        minThreshold: 30,
        notes: 'دفاتر إخطار تبليغ ولادة',
      },
      death_certificates: {
        stockCategory: 'death_certificates',
        openingQuantity: 80,
        serialFrom: '089401',
        serialTo: '089480',
        minThreshold: 20,
        notes: 'دفاتر شهادات وفاة ورقية وتصاريح دفن',
      },
      death_notifications: {
        stockCategory: 'death_notifications',
        openingQuantity: 80,
        serialFrom: '001101',
        serialTo: '001180',
        minThreshold: 20,
        notes: 'دفاتر إخطار تبليغ وفاة',
      },
      health_cards_male: {
        stockCategory: 'health_cards_male',
        openingQuantity: 100,
        serialFrom: '084901',
        serialTo: '085000',
        minThreshold: 25,
        notes: 'بطاقات صحية زرقاء مخصصة للأطفال الذكور',
      },
      health_cards_female: {
        stockCategory: 'health_cards_female',
        openingQuantity: 100,
        serialFrom: '094901',
        serialTo: '095000',
        minThreshold: 25,
        notes: 'بطاقات صحية وردية مخصصة للأطفال الإناث',
      },
      late_reg_under_year: {
        stockCategory: 'late_reg_under_year',
        openingQuantity: 50,
        serialFrom: '002101',
        serialTo: '002150',
        minThreshold: 15,
        notes: 'استمارات ساقط قيد نموذج 26 أ.ح أقل من عام',
      },
      late_reg_over_year: {
        stockCategory: 'late_reg_over_year',
        openingQuantity: 40,
        serialFrom: '001401',
        serialTo: '001440',
        minThreshold: 15,
        notes: 'استمارات ساقط قيد نموذج 26 أ.ح أكبر من عام',
      },
    },
  },
  supplyTransactions: [
    {
      id: 'sup-1',
      stockCategory: 'birth_certificates',
      date: '2026-08-15',
      quantity: 150,
      documentNumber: 'إذن 44/2026 مديرية سوهاج',
      serialFrom: '0142001',
      serialTo: '0142150',
      supplierName: 'مخازن الإدارة الصحية بساقلتة',
      receivedBy: 'أحمد محمود (كاتب الصحة)',
      notes: 'الدفعة الدورية للربع الثالث',
      createdAt: '2026-08-15T09:30:00Z',
    },
    {
      id: 'sup-2',
      stockCategory: 'health_cards_male',
      date: '2026-08-20',
      quantity: 100,
      documentNumber: 'توريد رقم 118',
      serialFrom: '085001',
      serialTo: '085100',
      supplierName: 'إدارة رعاية الأمومة والطفولة',
      receivedBy: 'أحمد محمود',
      notes: 'بطاقات صحية زرقاء مخصصة للذكور',
      createdAt: '2026-08-20T10:15:00Z',
    },
    {
      id: 'sup-3',
      stockCategory: 'health_cards_female',
      date: '2026-08-20',
      quantity: 100,
      documentNumber: 'توريد رقم 119',
      serialFrom: '095001',
      serialTo: '095100',
      supplierName: 'إدارة رعاية الأمومة والطفولة',
      receivedBy: 'أحمد محمود',
      notes: 'بطاقات صحية وردية مخصصة للإناث',
      createdAt: '2026-08-20T10:20:00Z',
    },
  ],
  dispenseRecords: [
    {
      id: 'disp-1',
      dispenseType: 'birth_male',
      date: '2026-09-02',
      time: '10:15',
      beneficiaryName: 'حمزة محمود عبد الرحيم السيد',
      gender: 'male',
      eventDate: '2026-09-01',
      fatherName: 'محمود عبد الرحيم السيد',
      fatherNationalId: '29305142601977',
      motherName: 'فاطمة جابر حسن خلف',
      motherNationalId: '29811232600884',
      address: 'قرية سفلاق - مركز ساقلتة - سوهاج',
      reporterName: 'محمود عبد الرحيم السيد (الأب)',
      reporterRelation: 'الأب',
      reporterPhone: '01012345678',
      certificateNumber: '0142089',
      healthCardReceiptNumber: 'قسيمة 56832',
      paymentAmount: 50,
      notificationNumber: 'بل-3301',
      itemsDeducted: [
        { stockCategory: 'birth_certificates', quantity: 1 },
        { stockCategory: 'birth_notifications', quantity: 1 },
        { stockCategory: 'health_cards_male', quantity: 1 },
      ],
      dispensedBy: 'أحمد محمود (كاتب صحة سفلاق)',
      notes: 'تم فحص الإخطار الطبي للولادة بمستشفى ساقلتة المركزي وتسليم البطاقة الزرقاء',
      createdAt: '2026-09-02T10:15:00Z',
    },
    {
      id: 'disp-2',
      dispenseType: 'birth_female',
      date: '2026-09-03',
      time: '11:40',
      beneficiaryName: 'مريم السيد البدوي عبد القادر',
      gender: 'female',
      eventDate: '2026-09-02',
      fatherName: 'السيد البدوي عبد القادر',
      fatherNationalId: '29107122602331',
      motherName: 'زينب محمد عبد العال',
      motherNationalId: '29509182601442',
      address: 'شارع داير الناحية - سفلاق',
      reporterName: 'السيد البدوي عبد القادر',
      reporterRelation: 'الأب',
      reporterPhone: '01123456789',
      certificateNumber: '0142090',
      healthCardReceiptNumber: 'قسيمة 56833',
      paymentAmount: 50,
      notificationNumber: 'بل-3302',
      itemsDeducted: [
        { stockCategory: 'birth_certificates', quantity: 1 },
        { stockCategory: 'birth_notifications', quantity: 1 },
        { stockCategory: 'health_cards_female', quantity: 1 },
      ],
      dispensedBy: 'أحمد محمود (كاتب صحة سفلاق)',
      notes: 'تم استيفاء إيصال التوريد 33 ع.ح وتسليم البطاقة الصحية الوردية',
      createdAt: '2026-09-03T11:40:00Z',
    },
    {
      id: 'disp-3',
      dispenseType: 'death',
      date: '2026-09-03',
      time: '13:10',
      beneficiaryName: 'إبراهيم علي حسن الشريف',
      gender: 'male',
      eventDate: '2026-09-03',
      fatherName: 'علي حسن الشريف',
      motherName: 'خضرة أحمد عبد الله',
      address: 'نجع حميد - سفلاق',
      reporterName: 'حسن إبراهيم علي (الابن)',
      reporterRelation: 'الابن',
      reporterPhone: '01234567890',
      certificateNumber: '089451',
      healthCardReceiptNumber: 'غير مطلوب (حالة وفاة)',
      paymentAmount: 0,
      notificationNumber: 'وف-1104',
      itemsDeducted: [
        { stockCategory: 'death_certificates', quantity: 1 },
        { stockCategory: 'death_notifications', quantity: 1 },
      ],
      dispensedBy: 'أحمد محمود (كاتب صحة سفلاق)',
      notes: 'تم مناظرة الجثمان بمعرفة مفتش الصحة واستخراج تصريح الدفن رقم 215/2026',
      createdAt: '2026-09-03T13:10:00Z',
    },
    {
      id: 'disp-4',
      dispenseType: 'death',
      date: '2026-09-04',
      time: '09:20',
      beneficiaryName: 'فاطمة عبد الرحيم محمد خليل',
      gender: 'female',
      eventDate: '2026-09-03',
      fatherName: 'عبد الرحيم محمد خليل',
      motherName: 'زينب أحمد محمود',
      address: 'سفلاق - ساقلتة - سوهاج',
      reporterName: 'محمود عبد الرحيم محمد (الأخ)',
      reporterRelation: 'الأخ',
      reporterPhone: '01012345678',
      certificateNumber: '089452',
      healthCardReceiptNumber: 'غير مطلوب (حالة وفاة)',
      paymentAmount: 0,
      notificationNumber: 'وف-1105',
      itemsDeducted: [
        { stockCategory: 'death_certificates', quantity: 1 },
        { stockCategory: 'death_notifications', quantity: 1 },
      ],
      dispensedBy: 'أحمد محمود (كاتب صحة سفلاق)',
      notes: 'تم استخراج تصريح الدفن واستيفاء إخطار الوفاة وقيده بالدفتر الورقي',
      createdAt: '2026-09-04T09:20:00Z',
    },
  ],
  lateRegistrations: [
    {
      id: 'late-1',
      formNumber: 'س-ق-2026/041',
      submissionDate: '2026-08-28',
      type: 'birth',
      personName: 'يوسف جمال عبد الفتاح عثمان',
      gender: 'male',
      eventDate: '2024-03-15',
      eventPlace: 'المنزل - قرية سفلاق',
      fatherName: 'جمال عبد الفتاح عثمان',
      motherName: 'هناء محمد مصطفى',
      applicantName: 'جمال عبد الفتاح عثمان',
      applicantRelation: 'الأب',
      applicantNationalId: '28804052601112',
      applicantPhone: '01099887766',
      applicantAddress: 'سفلاق - ساقلتة - سوهاج',
      delayReason: 'الولادة تمت بالمنزل وسفر الأب للعمل بالخارج وتعذر استخراج الشهادة في الميعاد القانوني',
      notes: 'تم استيفاء استمارة ساقط القيد نموذج 26 أ.ح ومرفق شهادة شاهدين معتمدين وعقد زواج الوالدين، وجارٍ العرض على اللجنة الطبية الثلاثية بالإدارة الصحية بساقلتة لتقدير السن.',
      status: 'medical_comm',
      staffName: 'أحمد محمود',
      createdAt: '2026-08-28T10:00:00Z',
      updatedAt: '2026-08-30T12:00:00Z',
    },
    {
      id: 'late-2',
      formNumber: 'س-ق-2026/042',
      submissionDate: '2026-09-01',
      type: 'death',
      personName: 'عائشة بدري رضوان خلف',
      gender: 'female',
      eventDate: '2025-11-20',
      eventPlace: 'قرية سفلاق',
      fatherName: 'بدري رضوان خلف',
      motherName: 'نادية عبد السلام',
      applicantName: 'رضوان بدري رضوان',
      applicantRelation: 'الشقيق',
      applicantNationalId: '27903102602234',
      applicantPhone: '01155443322',
      applicantAddress: 'سفلاق - بجوار مدرسة سفلاق الإعدادية',
      delayReason: 'توفيت بالمنزل ولم يتم إبلاغ الصحة في حينه لجهل الأسرة بالإجراءات القانونية',
      notes: 'تم تحرير محضر إداري بمركز شرطة ساقلتة برقم 3145 إداري ساقلتة لسنة 2026، وبانتظار قرار النيابة العامة وإفادة السجل المدني للتحقق من عدم وجود قيد مسبق.',
      status: 'under_review',
      staffName: 'أحمد محمود',
      createdAt: '2026-09-01T09:30:00Z',
      updatedAt: '2026-09-01T09:30:00Z',
    },
  ],
};

export function getDatabase(): AppDatabase {
  if (typeof window === 'undefined') return INITIAL_DATABASE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(INITIAL_DATABASE));
      return INITIAL_DATABASE;
    }
    const parsed = JSON.parse(raw) as AppDatabase;

    // Backward compatibility: ensure all stock categories exist in parsed database without injecting mock balances
    if (parsed && parsed.stocks) {
      let needsSave = false;
      for (const key of Object.keys(STOCK_CATEGORIES_INFO) as StockCategory[]) {
        if (!parsed.stocks[key]) {
          const info = STOCK_CATEGORIES_INFO[key];
          parsed.stocks[key] = {
            id: key,
            name: info?.name || key,
            category: info?.category || 'birth',
            currentStock: 0,
            totalReceived: 0,
            totalDispensed: 0,
            damagedOrCancelled: 0,
            openingStock: 0,
            openingSerialFrom: '',
            openingSerialTo: '',
            minThreshold: info?.minThreshold || 20,
            unit: info?.unit || 'استمارة',
            lastUpdated: new Date().toISOString(),
          };
          needsSave = true;
        } else if (parsed.stocks[key].openingStock === undefined) {
          parsed.stocks[key].openingStock = 0;
          parsed.stocks[key].openingSerialFrom = '';
          parsed.stocks[key].openingSerialTo = '';
          needsSave = true;
        }
      }
      if (!parsed.openingBalances && INITIAL_DATABASE.openingBalances) {
        parsed.openingBalances = INITIAL_DATABASE.openingBalances;
        needsSave = true;
      }

      // Backward compatibility: ensure all existing records have stable transactionId and marked synced
      (parsed.dispenseRecords || []).forEach((r) => {
        if (!r.transactionId) {
          r.transactionId = `tx-${r.id}`;
          r.syncStatus = r.syncStatus || 'synced';
          needsSave = true;
        }
      });
      (parsed.supplyTransactions || []).forEach((s) => {
        if (!s.transactionId) {
          s.transactionId = `tx-${s.id}`;
          s.syncStatus = s.syncStatus || 'synced';
          needsSave = true;
        }
      });
      (parsed.lateRegistrations || []).forEach((l) => {
        if (!l.transactionId) {
          l.transactionId = `tx-${l.id}`;
          l.syncStatus = l.syncStatus || 'synced';
          needsSave = true;
        }
      });

      if (needsSave) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(parsed));
      }
    }

    return parsed;
  } catch (error) {
    console.error('Failed to load database from localStorage:', error);
    return INITIAL_DATABASE;
  }
}

export function saveDatabase(db: AppDatabase): void {
  if (typeof window === 'undefined') return;
  try {
    db.lastBackupDate = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
    markHasPendingChanges(true);

    // Debounced automatic background sync and durable snapshot
    if (typeof window !== 'undefined') {
      if (isFactoryResetInProgress()) {
        return;
      }
      if (debounceSyncTimer) clearTimeout(debounceSyncTimer);
      debounceSyncTimer = setTimeout(() => {
        if (!isFactoryResetInProgress()) {
          executeAutoSync(db, 'change').catch(() => {});
        }
      }, 1200);
    }
  } catch (error) {
    console.error('Failed to save database to localStorage:', error);
  }
}

export function backupBeforeMigration(): void {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const backupKey = `saflaq_backup_before_migration_${Date.now()}`;
      localStorage.setItem(backupKey, raw);
      localStorage.setItem('saflaq_latest_pre_migration_backup', raw);
    }
  } catch (err) {
    console.warn('Backup before migration failed:', err);
  }
}

export function addSupplyTransaction(
  data: Omit<SupplyTransaction, 'id' | 'createdAt'>
): { db: AppDatabase; supply: SupplyTransaction } {
  const db = getDatabase();
  const now = new Date().toISOString();
  const txId = (data as any).transactionId || generateGlobalTxId();
  const devId = (data as any).deviceId || getOrCreateDeviceId();
  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
  const supplyId = 'sup-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);

  const supply: SupplyTransaction = {
    ...data,
    id: supplyId,
    createdAt: now,
    transactionId: txId,
    deviceId: devId,
    syncStatus: 'pending',
    isOfflineCreated: isOffline,
  };

  db.supplyTransactions.unshift(supply);

  // Update stocks
  const stock = db.stocks[data.stockCategory];
  if (stock) {
    stock.currentStock += Number(data.quantity) || 0;
    stock.totalReceived = (stock.totalReceived || 0) + (Number(data.quantity) || 0);
    stock.lastUpdated = now;
  }

  // Enqueue for central idempotent synchronization
  const syncId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;
  enqueueSyncItem({
    syncId,
    operationKey: `SUPPLY:${supply.id}:${syncId}`,
    transactionId: txId,
    deviceId: devId,
    userId: supply.receivedBy || 'أحمد محمود',
    operationType: 'SUPPLY',
    tableName: 'supplyTransactions',
    recordId: supply.id,
    payload: supply,
  }).catch((err) => console.warn('Enqueue supply notice:', err));

  saveDatabase(db);
  return { db, supply };
}

export function updateSupplyTransaction(
  id: string,
  updates: Partial<SupplyTransaction>,
  employeeName?: string
): AppDatabase {
  const db = getDatabase();
  const txIndex = db.supplyTransactions.findIndex((t) => t.id === id);
  if (txIndex === -1) return db;

  const oldTx = db.supplyTransactions[txIndex];
  const targetCategory = updates.stockCategory || oldTx.stockCategory;
  const targetQuantity = updates.quantity !== undefined ? Number(updates.quantity) : Number(oldTx.quantity);
  const now = new Date().toISOString();

  // If category changed or quantity changed
  if (targetCategory !== oldTx.stockCategory) {
    // Revert old category stock
    const oldStock = db.stocks[oldTx.stockCategory];
    if (oldStock) {
      if (oldStock.currentStock < oldTx.quantity) {
        throw new Error(`لا يمكن تغيير الصنف لأن الكمية المتبقية من (${oldStock.name}) غير كافية لخصم التوريد القديم`);
      }
      oldStock.currentStock -= oldTx.quantity;
      oldStock.totalReceived = Math.max(0, (oldStock.totalReceived || 0) - oldTx.quantity);
      oldStock.lastUpdated = now;
    }
    // Add to new category stock
    const newStock = db.stocks[targetCategory];
    if (newStock) {
      newStock.currentStock += targetQuantity;
      newStock.totalReceived = (newStock.totalReceived || 0) + targetQuantity;
      newStock.lastUpdated = now;
    }
  } else if (targetQuantity !== oldTx.quantity) {
    // Same category, delta difference
    const delta = targetQuantity - oldTx.quantity;
    const stock = db.stocks[targetCategory];
    if (stock) {
      if (delta < 0 && stock.currentStock < Math.abs(delta)) {
        throw new Error(`لا يمكن تقليل كمية التوريد بمقدار ${Math.abs(delta)} لأن الرصيد الحالي (${stock.currentStock}) أقل من الكمية المراد تخفيضها (تم صرف جزء منها بالفعل)`);
      }
      stock.currentStock += delta;
      stock.totalReceived = (stock.totalReceived || 0) + delta;
      stock.lastUpdated = now;
    }
  }

  const updatedSupply: SupplyTransaction = {
    ...oldTx,
    ...updates,
    id: oldTx.id,
    quantity: targetQuantity,
    stockCategory: targetCategory,
    transactionId: oldTx.transactionId || `tx-${oldTx.id}`,
    syncStatus: 'pending',
  };

  db.supplyTransactions[txIndex] = updatedSupply;

  // Enqueue UPDATE_SUPPLY for server sync
  const syncId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;
  enqueueSyncItem({
    syncId,
    operationKey: `UPDATE_SUPPLY:${updatedSupply.id}:${syncId}`,
    transactionId: updatedSupply.transactionId || `tx-${updatedSupply.id}`,
    deviceId: updatedSupply.deviceId || getOrCreateDeviceId(),
    userId: employeeName || updatedSupply.receivedBy || 'أحمد محمود',
    operationType: 'UPDATE_SUPPLY',
    tableName: 'supplyTransactions',
    recordId: updatedSupply.id,
    payload: {
      oldCategory: oldTx.stockCategory,
      oldQuantity: oldTx.quantity,
      newCategory: targetCategory,
      newQuantity: targetQuantity,
      supply: updatedSupply,
    },
  }).catch((err) => console.warn('Enqueue update supply notice:', err));

  saveDatabase(db);
  return db;
}

export function deleteSupplyTransaction(id: string, deletedBy?: string): AppDatabase {
  const db = getDatabase();
  const txIndex = db.supplyTransactions.findIndex((t) => t.id === id);

  if (!db.syncTombstones) {
    db.syncTombstones = [];
  }

  // Idempotency check
  const isAlreadyTombstoned = db.syncTombstones.some(
    (t) => t.recordId === id && t.operationType === 'DELETE_SUPPLY'
  );
  if (isAlreadyTombstoned) {
    db.supplyTransactions = db.supplyTransactions.filter((t) => t.id !== id);
    saveDatabase(db);
    return db;
  }

  if (txIndex === -1) return db;

  const tx = db.supplyTransactions[txIndex];
  const now = new Date().toISOString();
  const stock = db.stocks[tx.stockCategory];

  // Check if stock has enough units to cancel the supply
  if (stock) {
    if (stock.currentStock < tx.quantity) {
      throw new Error(`لا يمكن حذف حركة التوريد رقم (${tx.documentNumber || tx.id}) لأن الرصيد الحالي (${stock.currentStock}) أقل من كمية التوريد (${tx.quantity}) حيث تم صرف أجزاء منها بالفعل`);
    }
    stock.currentStock -= tx.quantity;
    stock.totalReceived = Math.max(0, (stock.totalReceived || 0) - tx.quantity);
    stock.lastUpdated = now;
  }

  // Create Tombstone
  const syncId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;
  const tombstone: SyncTombstone = {
    id: `tomb-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
    recordId: tx.id,
    transactionId: tx.transactionId || `tx-${tx.id}`,
    operationKey: `DELETE_SUPPLY:${tx.id}:${syncId}`,
    operationType: 'DELETE_SUPPLY',
    deletedAt: now,
    deviceId: tx.deviceId || getOrCreateDeviceId(),
    deletedBy: deletedBy || 'أحمد محمود',
    details: {
      documentNumber: tx.documentNumber,
      stockCategory: tx.stockCategory,
      quantity: tx.quantity,
    },
  };
  db.syncTombstones.push(tombstone);

  db.supplyTransactions.splice(txIndex, 1);

  // Enqueue DELETE_SUPPLY
  enqueueSyncItem({
    syncId,
    operationKey: `DELETE_SUPPLY:${tx.id}:${syncId}`,
    transactionId: tx.transactionId || `tx-${tx.id}`,
    deviceId: tx.deviceId || getOrCreateDeviceId(),
    userId: tombstone.deletedBy || 'أحمد محمود',
    operationType: 'DELETE_SUPPLY',
    tableName: 'supplyTransactions',
    recordId: tx.id,
    payload: {
      recordId: tx.id,
      stockCategory: tx.stockCategory,
      quantity: tx.quantity,
      transactionId: tx.transactionId,
      deletedAt: now,
      deletedBy: tombstone.deletedBy,
    },
  }).catch((err) => console.warn('Enqueue delete supply notice:', err));

  saveDatabase(db);
  return db;
}

export function addDispenseRecord(
  data: Omit<DispenseRecord, 'id' | 'createdAt'>
): { db: AppDatabase; record: DispenseRecord } {
  const db = getDatabase();

  // 1. Strict Stock Availability Check (No negative stock, no Math.max concealing)
  const validation = validateDispenseAvailability(db.stocks, data.itemsDeducted);
  if (!validation.isValid) {
    throw new Error(validation.errorMessage || 'الرصيد غير كافٍ لإتمام عملية الصرف');
  }

  const now = new Date().toISOString();
  const txId = (data as any).transactionId || generateGlobalTxId();
  const devId = (data as any).deviceId || getOrCreateDeviceId();
  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;
  const recordId = 'disp-' + (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).substring(2, 7)}`);

  const record: DispenseRecord = {
    ...data,
    id: recordId,
    createdAt: now,
    transactionId: txId,
    deviceId: devId,
    syncStatus: 'pending',
    isOfflineCreated: isOffline,
  };

  db.dispenseRecords.unshift(record);

  // Deduct stocks strictly
  data.itemsDeducted.forEach((item) => {
    const stock = db.stocks[item.stockCategory];
    if (stock) {
      stock.currentStock -= item.quantity;
      stock.totalDispensed = (stock.totalDispensed || 0) + item.quantity;
      stock.lastUpdated = now;
    }
  });

  // Enqueue for central idempotent synchronization with unique operationKey
  const syncId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;
  enqueueSyncItem({
    syncId,
    operationKey: `DISPENSE:${record.id}:${syncId}`,
    transactionId: txId,
    deviceId: devId,
    userId: record.dispensedBy || 'أحمد محمود',
    operationType: 'DISPENSE',
    tableName: 'dispenseRecords',
    recordId: record.id,
    payload: record,
  }).catch((err) => console.warn('Enqueue dispense notice:', err));

  saveDatabase(db);
  return { db, record };
}

export function updateDispenseRecord(
  id: string,
  updates: Partial<DispenseRecord>,
  employeeName?: string
): AppDatabase {
  const db = getDatabase();
  const recordIndex = db.dispenseRecords.findIndex((r) => r.id === id);
  if (recordIndex === -1) return db;

  const oldRecord = db.dispenseRecords[recordIndex];
  const now = new Date().toISOString();

  // If itemsDeducted is being updated, calculate exact differences
  if (
    updates.itemsDeducted &&
    JSON.stringify(updates.itemsDeducted) !== JSON.stringify(oldRecord.itemsDeducted)
  ) {
    const oldTotals: Partial<Record<StockCategory, number>> = {};
    (oldRecord.itemsDeducted || []).forEach((it) => {
      oldTotals[it.stockCategory] = (oldTotals[it.stockCategory] || 0) + Number(it.quantity || 0);
    });
    const newTotals: Partial<Record<StockCategory, number>> = {};
    updates.itemsDeducted.forEach((it) => {
      newTotals[it.stockCategory] = (newTotals[it.stockCategory] || 0) + Number(it.quantity || 0);
    });

    const allCategories = new Set([
      ...Object.keys(oldTotals),
      ...Object.keys(newTotals),
    ]) as Set<StockCategory>;

    // Pre-check availability for any category that requires INCREASING quantity
    for (const cat of allCategories) {
      const oldQty = oldTotals[cat] || 0;
      const newQty = newTotals[cat] || 0;
      const diff = newQty - oldQty;
      if (diff > 0) {
        const stock = db.stocks[cat];
        const available = stock ? Number(stock.currentStock) || 0 : 0;
        if (diff > available) {
          throw new Error(`الرصيد غير كافٍ لزيادة المنصرف للصنف (${stock?.name || cat}): المتاح ${available}، والمطلوب إضافته ${diff}`);
        }
      }
    }

    // Apply Deltas
    allCategories.forEach((cat) => {
      const oldQty = oldTotals[cat] || 0;
      const newQty = newTotals[cat] || 0;
      const diff = newQty - oldQty;
      if (diff !== 0) {
        const stock = db.stocks[cat];
        if (stock) {
          stock.currentStock -= diff;
          stock.totalDispensed = (stock.totalDispensed || 0) + diff;
          stock.lastUpdated = now;
        }
      }
    });
  }

  const updatedRecord: DispenseRecord = {
    ...oldRecord,
    ...updates,
    id: oldRecord.id, // Strictly preserve original ID
    transactionId: oldRecord.transactionId || oldRecord.id, // Strictly preserve transaction ID
    updatedAt: now,
    syncStatus: 'pending',
  };

  db.dispenseRecords[recordIndex] = updatedRecord;

  // Enqueue for central idempotent synchronization with unique operationKey
  const syncId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;
  enqueueSyncItem({
    syncId,
    operationKey: `UPDATE_DISPENSE:${updatedRecord.id}:${syncId}`,
    transactionId: updatedRecord.transactionId || updatedRecord.id,
    deviceId: updatedRecord.deviceId || getOrCreateDeviceId(),
    userId: employeeName || updatedRecord.dispensedBy || db.officeSettings?.currentEmployee || 'كاتب صحة سفلاق',
    operationType: 'UPDATE_DISPENSE',
    tableName: 'dispenseRecords',
    recordId: updatedRecord.id,
    payload: updatedRecord,
  }).catch((err) => console.warn('Enqueue update dispense notice:', err));

  saveDatabase(db);
  return db;
}

export function deleteDispenseRecord(id: string, deletedBy?: string): AppDatabase {
  const db = getDatabase();
  const record = db.dispenseRecords.find((r) => r.id === id);

  // Initialize syncTombstones array if missing
  if (!db.syncTombstones) {
    db.syncTombstones = [];
  }

  // Idempotency check: verify if recordId is already in tombstones
  const isAlreadyTombstoned = db.syncTombstones.some(
    (t) => t.recordId === id && t.operationType === 'DELETE_DISPENSE'
  );

  if (isAlreadyTombstoned) {
    // Already processed: do NOT restore stock again (Idempotency guarantee)
    db.dispenseRecords = db.dispenseRecords.filter((r) => r.id !== id);
    saveDatabase(db);
    return db;
  }

  if (!record) {
    return db;
  }

  const now = new Date().toISOString();
  const txId = record.transactionId || record.id;
  const devId = record.deviceId || getOrCreateDeviceId();
  const syncId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;

  // 1. Return deducted quantities to inventory stock once
  if (record.itemsDeducted && Array.isArray(record.itemsDeducted)) {
    record.itemsDeducted.forEach((item) => {
      const stock = db.stocks[item.stockCategory];
      if (stock) {
        stock.currentStock += Number(item.quantity || 0);
        stock.totalDispensed = Math.max(0, (stock.totalDispensed || 0) - Number(item.quantity || 0));
        stock.lastUpdated = now;
      }
    });
  }

  // 2. Register permanent Tombstone locally
  const tombstone: SyncTombstone = {
    id: `tomb-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
    recordId: record.id,
    transactionId: txId,
    operationKey: `DELETE_DISPENSE:${record.id}:${syncId}`,
    operationType: 'DELETE_DISPENSE',
    deletedAt: now,
    deviceId: devId,
    deletedBy: deletedBy || 'كاتب صحة سفلاق',
    itemsRestored: record.itemsDeducted,
    details: {
      beneficiaryName: record.beneficiaryName,
      itemsRestored: record.itemsDeducted,
    },
  };
  db.syncTombstones.push(tombstone);

  // 3. Remove record from active dispense records array
  db.dispenseRecords = db.dispenseRecords.filter((r) => r.id !== id);

  // 4. Enqueue Sync Item with DELETE_DISPENSE and unique operationKey
  enqueueSyncItem({
    syncId,
    operationKey: `DELETE_DISPENSE:${record.id}:${syncId}`,
    transactionId: txId,
    deviceId: devId,
    userId: tombstone.deletedBy || 'كاتب صحة سفلاق',
    operationType: 'DELETE_DISPENSE',
    tableName: 'dispenseRecords',
    recordId: record.id,
    payload: {
      recordId: record.id,
      transactionId: txId,
      deviceId: devId,
      deletedAt: now,
      deletedBy: tombstone.deletedBy,
      itemsRestored: record.itemsDeducted,
    },
  }).catch((err) => console.warn('Enqueue delete dispense notice:', err));

  saveDatabase(db);
  return db;
}

export function addLateRegistration(
  data: Omit<LateRegistrationRecord, 'id' | 'createdAt' | 'updatedAt'>,
  deductStock: boolean = false
): { db: AppDatabase; record: LateRegistrationRecord } {
  const db = getDatabase();
  const now = new Date().toISOString();
  const txId = (data as any).transactionId || generateGlobalTxId();
  const devId = (data as any).deviceId || getOrCreateDeviceId();
  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

  const record: LateRegistrationRecord = {
    ...data,
    id: 'late-' + Date.now(),
    createdAt: now,
    updatedAt: now,
    transactionId: txId,
    deviceId: devId,
    syncStatus: 'pending',
    isOfflineCreated: isOffline,
  };

  // If requested and ageCategory is specified, deduct from appropriate stock with strict availability check
  if (deductStock && data.ageCategory) {
    const stockCat: StockCategory =
      data.ageCategory === 'under_one_year' ? 'late_reg_under_year' : 'late_reg_over_year';
    const targetStock = db.stocks[stockCat];
    if (!targetStock || targetStock.currentStock < 1) {
      throw new Error(`الرصيد غير كافٍ لصرف استمارة ساقط قيد (${targetStock?.name || stockCat}). الرصيد الحالي: ${targetStock?.currentStock || 0}`);
    }
    targetStock.currentStock -= 1;
    targetStock.totalDispensed += 1;
    targetStock.lastUpdated = now;
  }

  db.lateRegistrations.unshift(record);

  // Enqueue for central synchronization
  const syncId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;
  enqueueSyncItem({
    syncId,
    operationKey: `LATE_REG_ADD:${record.id}:${syncId}`,
    transactionId: txId,
    deviceId: devId,
    userId: record.staffName || 'أحمد محمود',
    operationType: 'LATE_REG_ADD',
    tableName: 'lateRegistrations',
    recordId: record.id,
    payload: { record, deductStock },
  }).catch((err) => console.warn('Enqueue late reg notice:', err));

  saveDatabase(db);
  return { db, record };
}

export function updateLateRegistration(
  id: string,
  updates: Partial<LateRegistrationRecord>
): AppDatabase {
  const db = getDatabase();
  const index = db.lateRegistrations.findIndex((r) => r.id === id);
  if (index !== -1) {
    const updatedRecord = {
      ...db.lateRegistrations[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    db.lateRegistrations[index] = updatedRecord;

    const syncId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;
    const txId = generateGlobalTxId();
    const devId = getOrCreateDeviceId();
    enqueueSyncItem({
      syncId,
      operationKey: `LATE_REG_UPDATE:${id}:${syncId}`,
      transactionId: txId,
      deviceId: devId,
      userId: updatedRecord.staffName || 'كاتب صحة سفلاق',
      operationType: 'LATE_REG_UPDATE',
      tableName: 'lateRegistrations',
      recordId: id,
      payload: updatedRecord,
    }).catch((err) => console.warn('Enqueue late reg update notice:', err));

    saveDatabase(db);
  }
  return db;
}

export function trackLateRegistrationStatus(
  id: string,
  newStatus: LateRegStatus,
  actionDetails: {
    actionTitle: string;
    date: string;
    notes?: string;
    docNumber?: string;
    committeeDecision?: string;
    staffName: string;
    rejectionReason?: string;
    finalRegistrationNumber?: string;
    finalCertificateNumber?: string;
  }
): AppDatabase {
  const db = getDatabase();
  const index = db.lateRegistrations.findIndex((r) => r.id === id);
  if (index === -1) return db;

  const current = db.lateRegistrations[index];
  const now = new Date();
  const timeStr = now.toTimeString().slice(0, 5);

  const newStep: LateRegTrackingStep = {
    id: 'step-' + Date.now(),
    status: newStatus,
    date: actionDetails.date || now.toISOString().split('T')[0],
    time: timeStr,
    actionTitle: actionDetails.actionTitle,
    officialDocNumber: actionDetails.docNumber,
    committeeDecision: actionDetails.committeeDecision,
    notes: actionDetails.notes,
    performedBy: actionDetails.staffName || current.staffName || 'كاتب صحة سفلاق',
  };

  const updatedHistory = [...(current.trackingHistory || [])];
  // If no initial step exists, record creation step
  if (updatedHistory.length === 0) {
    updatedHistory.push({
      id: 'step-init-' + current.id,
      status: 'under_review',
      date: current.submissionDate,
      actionTitle: 'تقديم الاستمارة وفحص المستندات بمكتب صحة سفلاق',
      notes: current.notes || 'استلام الطلب وقيده في الدفتر الورقي',
      performedBy: current.staffName || 'كاتب صحة سفلاق',
    });
  }
  updatedHistory.push(newStep);

  const updates: Partial<LateRegistrationRecord> = {
    status: newStatus,
    trackingHistory: updatedHistory,
    staffName: actionDetails.staffName || current.staffName,
    updatedAt: now.toISOString(),
  };

  if (actionDetails.notes) {
    const formattedNote = `[${actionDetails.date} - ${actionDetails.actionTitle}]: ${actionDetails.notes}`;
    updates.notes = current.notes ? `${current.notes}\n${formattedNote}` : formattedNote;
  }

  if (newStatus === 'medical_comm') {
    updates.medicalCommitteeDocNumber = actionDetails.docNumber;
    if (actionDetails.committeeDecision) {
      updates.medicalCommitteeDecision = actionDetails.committeeDecision;
      updates.medicalCommitteeDecisionDate = actionDetails.date;
    }
  } else if (newStatus === 'civil_registry') {
    updates.civilRegistryDocNumber = actionDetails.docNumber;
    updates.civilRegistrySendDate = actionDetails.date;
  } else if (newStatus === 'approved') {
    updates.finalRegistrationNumber = actionDetails.finalRegistrationNumber || actionDetails.docNumber;
    updates.finalCertificateNumber = actionDetails.finalCertificateNumber;
    updates.resolvedDate = actionDetails.date;
  } else if (newStatus === 'rejected') {
    updates.rejectionReason = actionDetails.rejectionReason || actionDetails.notes;
    updates.rejectionDate = actionDetails.date;
  }

  db.lateRegistrations[index] = {
    ...current,
    ...updates,
  };

  const updateTxId = generateGlobalTxId();
  const devId = getOrCreateDeviceId();
  const syncId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;
  enqueueSyncItem({
    syncId,
    operationKey: `LATE_REG_UPDATE:${id}:${syncId}`,
    transactionId: updateTxId,
    deviceId: devId,
    userId: actionDetails.staffName || current.staffName || 'كاتب صحة سفلاق',
    operationType: 'LATE_REG_UPDATE',
    tableName: 'lateRegistrations',
    recordId: id,
    payload: db.lateRegistrations[index],
  }).catch((err) => console.warn('Enqueue late reg update notice:', err));

  saveDatabase(db);
  return db;
}

export function deleteLateRegistration(id: string, deletedBy?: string): AppDatabase {
  const db = getDatabase();
  const record = db.lateRegistrations.find((r) => r.id === id);

  if (!db.syncTombstones) {
    db.syncTombstones = [];
  }

  const isAlreadyTombstoned = db.syncTombstones.some(
    (t) => t.recordId === id && t.operationType === 'DELETE_LATE_REG'
  );
  if (isAlreadyTombstoned) {
    db.lateRegistrations = db.lateRegistrations.filter((r) => r.id !== id);
    saveDatabase(db);
    return db;
  }

  if (!record) return db;

  const now = new Date().toISOString();
  const devId = record.deviceId || getOrCreateDeviceId();
  const txId = record.transactionId || `tx-${record.id}`;
  const syncId = typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `sync-${Date.now()}`;

  // If a stock was deducted for this late registration, restore it
  if (record.ageCategory) {
    const stockCat: StockCategory =
      record.ageCategory === 'under_one_year' ? 'late_reg_under_year' : 'late_reg_over_year';
    if (db.stocks[stockCat]) {
      db.stocks[stockCat].currentStock += 1;
      db.stocks[stockCat].totalDispensed = Math.max(0, (db.stocks[stockCat].totalDispensed || 0) - 1);
      db.stocks[stockCat].lastUpdated = now;
    }
  }

  const tombstone: SyncTombstone = {
    id: `tomb-${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`,
    recordId: record.id,
    transactionId: txId,
    operationKey: `DELETE_LATE_REG:${record.id}:${syncId}`,
    operationType: 'DELETE_LATE_REG',
    deletedAt: now,
    deviceId: devId,
    deletedBy: deletedBy || 'أحمد محمود',
    details: {
      personName: record.personName,
      formNumber: record.formNumber,
    },
  };
  db.syncTombstones.push(tombstone);

  db.lateRegistrations = db.lateRegistrations.filter((r) => r.id !== id);

  enqueueSyncItem({
    syncId,
    operationKey: `DELETE_LATE_REG:${record.id}:${syncId}`,
    transactionId: txId,
    deviceId: devId,
    userId: tombstone.deletedBy || 'أحمد محمود',
    operationType: 'DELETE_LATE_REG',
    tableName: 'lateRegistrations',
    recordId: record.id,
    payload: {
      recordId: record.id,
      transactionId: txId,
      deletedAt: now,
      deletedBy: tombstone.deletedBy,
    },
  }).catch((err) => console.warn('Enqueue delete late reg notice:', err));

  saveDatabase(db);
  return db;
}

export function manualAdjustStock(
  category: StockCategory,
  newQuantity: number,
  reason: string
): AppDatabase {
  const db = getDatabase();
  const stock = db.stocks[category];
  if (stock) {
    const diff = newQuantity - stock.currentStock;
    stock.currentStock = Math.max(0, newQuantity);
    if (diff < 0) {
      stock.damagedOrCancelled += Math.abs(diff);
    }
    stock.lastUpdated = new Date().toISOString();
    saveDatabase(db);
  }
  return db;
}

export function saveOpeningBalances(
  record: OpeningBalanceRecord,
  mode: 'recalculate' | 'override_current' = 'recalculate'
): AppDatabase {
  const db = getDatabase();
  const now = new Date().toISOString();
  db.openingBalances = {
    ...record,
    updatedAt: now,
  };

  (Object.keys(record.items) as StockCategory[]).forEach((cat) => {
    const itemData = record.items[cat];
    const stock = db.stocks[cat];
    if (stock && itemData) {
      stock.openingStock = itemData.openingQuantity;
      stock.openingSerialFrom = itemData.serialFrom;
      stock.openingSerialTo = itemData.serialTo;
      stock.openingSerialRanges = itemData.serialRanges;
      if (itemData.minThreshold !== undefined && itemData.minThreshold >= 0) {
        stock.minThreshold = itemData.minThreshold;
      }
      if (mode === 'override_current') {
        stock.currentStock = Math.max(0, itemData.openingQuantity);
      } else {
        // Recalculate: current = opening + totalReceived - totalDispensed - damagedOrCancelled
        stock.currentStock = Math.max(
          0,
          (itemData.openingQuantity || 0) +
            (stock.totalReceived || 0) -
            (stock.totalDispensed || 0) -
            (stock.damagedOrCancelled || 0)
        );
      }
      stock.lastUpdated = now;
    }
  });

  saveDatabase(db);
  return db;
}

export function updateGovSystemStatus(
  dispenseId: string,
  entered: boolean,
  refNumber?: string
): AppDatabase {
  const db = getDatabase();
  const record = db.dispenseRecords.find((r) => r.id === dispenseId);
  if (record) {
    record.enteredIntoGovSystem = entered;
    record.govSystemEntryDate = entered ? new Date().toISOString().split('T')[0] : undefined;
    if (refNumber !== undefined) {
      record.govSystemRefNumber = refNumber;
    }
    saveDatabase(db);
  }
  return db;
}

export interface BackupInspectionResult {
  valid: boolean;
  error?: string;
  data?: AppDatabase;
  stats?: {
    version: number;
    officeName: string;
    lastBackupDate: string;
    dispenseCount: number;
    birthCount: number;
    deathCount: number;
    supplyCount: number;
    lateRegCount: number;
    totalStockUnits: number;
    feesTotal: number;
  };
}

export function inspectBackupContent(jsonString: string): BackupInspectionResult {
  try {
    const parsed = JSON.parse(jsonString) as AppDatabase;
    if (!parsed || typeof parsed !== 'object') {
      return { valid: false, error: 'الملف لا يحتوي على كائن JSON صالح.' };
    }
    if (!parsed.stocks || typeof parsed.stocks !== 'object') {
      return { valid: false, error: 'الملف ينقصه قسم أرصدة المستندات (stocks).' };
    }
    if (!Array.isArray(parsed.dispenseRecords)) {
      return { valid: false, error: 'الملف ينقصه جدول المنصرف (dispenseRecords).' };
    }
    if (!Array.isArray(parsed.lateRegistrations)) {
      return { valid: false, error: 'الملف ينقصه جدول استمارات ساقط القيد (lateRegistrations).' };
    }

    const birthCount = parsed.dispenseRecords.filter(
      (r) => r.dispenseType === 'birth_male' || r.dispenseType === 'birth_female'
    ).length;
    const deathCount = parsed.dispenseRecords.filter((r) => r.dispenseType === 'death').length;
    const stockList = Object.values(parsed.stocks) as import('../types').StockItem[];
    const totalStockUnits = stockList.reduce((sum, s) => sum + (Number(s.currentStock) || 0), 0);
    const feesTotal = parsed.dispenseRecords.reduce(
      (sum, r) => sum + (Number(r.paymentAmount) || 0),
      0
    );

    return {
      valid: true,
      data: parsed,
      stats: {
        version: parsed.version || 1,
        officeName: parsed.officeSettings?.officeName || 'مكتب صحة سفلاق',
        lastBackupDate: parsed.lastBackupDate || new Date().toISOString(),
        dispenseCount: parsed.dispenseRecords.length,
        birthCount,
        deathCount,
        supplyCount: Array.isArray(parsed.supplyTransactions) ? parsed.supplyTransactions.length : 0,
        lateRegCount: parsed.lateRegistrations.length,
        totalStockUnits,
        feesTotal,
      },
    };
  } catch (error) {
    console.error('Inspect error:', error);
    return { valid: false, error: 'الملف غير صالح أو تالف ولا يمكن قراءته.' };
  }
}

export async function createManualBackupWithLocation(
  suggestedName?: string
): Promise<{ success: boolean; filename: string; method: 'picker' | 'download'; error?: string }> {
  const db = getDatabase();
  const now = new Date();
  const dateStr = now.toISOString().split('T')[0];
  const timeStr = `${String(now.getHours()).padStart(2, '0')}-${String(now.getMinutes()).padStart(2, '0')}`;
  const filename = suggestedName || `نسخة_احتياطية_مكتب_صحة_سفلاق_${dateStr}_${timeStr}.json`;
  const jsonStr = JSON.stringify(db, null, 2);

  // Check if File System Access API is supported (window.showSaveFilePicker)
  if (typeof window !== 'undefined' && 'showSaveFilePicker' in window) {
    try {
      const picker = (window as unknown as {
        showSaveFilePicker: (options: {
          suggestedName: string;
          types: Array<{ description: string; accept: Record<string, string[]> }>;
        }) => Promise<FileSystemFileHandle>;
      }).showSaveFilePicker;

      const handle = await picker({
        suggestedName: filename,
        types: [
          {
            description: 'ملف قاعدة بيانات مكتب صحة سفلاق (JSON)',
            accept: { 'application/json': ['.json'] },
          },
        ],
      });

      const writable = await handle.createWritable();
      await writable.write(jsonStr);
      await writable.close();

      db.lastBackupDate = new Date().toISOString();
      saveDatabase(db);

      return { success: true, filename: handle.name || filename, method: 'picker' };
    } catch (err: unknown) {
      if ((err as Error).name === 'AbortError') {
        return { success: false, filename, method: 'picker', error: 'تم إلغاء تحديد المسار بواسطة المستخدم.' };
      }
      console.warn('showSaveFilePicker failed or unpermitted, falling back to download:', err);
    }
  }

  // Fallback to standard browser file download
  try {
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    db.lastBackupDate = new Date().toISOString();
    saveDatabase(db);

    return { success: true, filename, method: 'download' };
  } catch (err) {
    return { success: false, filename, method: 'download', error: 'تعذر تنزيل الملف على الجهاز.' };
  }
}

export function exportDatabaseBackup(): void {
  const db = getDatabase();
  const jsonStr = JSON.stringify(db, null, 2);
  const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const dateStr = new Date().toISOString().split('T')[0];
  a.href = url;
  a.download = `نسخة_احتياطية_مكتب_صحة_سفلاق_${dateStr}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importDatabaseBackup(jsonString: string): boolean {
  try {
    const inspection = inspectBackupContent(jsonString);
    if (!inspection.valid || !inspection.data) {
      return false;
    }
    saveDatabase(inspection.data);
    return true;
  } catch (error) {
    console.error('Error importing backup:', error);
    return false;
  }
}

export function exportToCSV(filename: string, rows: string[][]): void {
  // UTF-8 BOM for Arabic Excel compatibility
  const BOM = '\uFEFF';
  const csvContent = BOM + rows.map((e) => e.map(val => `"${(val || '').replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.setAttribute('href', url);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

export function createEmptyDatabase(): AppDatabase {
  const now = new Date().toISOString();
  return {
    version: 1,
    lastBackupDate: now,
    officeSettings: {
      officeName: 'مكتب صحة سفلاق',
      center: 'مركز ساقلتة',
      directorate: 'مديرية الشؤون الصحية بسوهاج',
      governorate: 'محافظة سوهاج',
      currentEmployee: 'كاتب صحة سفلاق',
    },
    stocks: {
      birth_certificates: {
        id: 'birth_certificates',
        name: 'شهادات الميلاد الورقية الرسمية',
        category: 'birth',
        currentStock: 0,
        totalReceived: 0,
        totalDispensed: 0,
        damagedOrCancelled: 0,
        openingStock: 0,
        openingSerialFrom: '',
        openingSerialTo: '',
        minThreshold: 30,
        unit: 'شهادة / استمارة',
        lastUpdated: now,
      },
      birth_notifications: {
        id: 'birth_notifications',
        name: 'بلاغات الميلاد (إخطار تبليغ)',
        category: 'birth',
        currentStock: 0,
        totalReceived: 0,
        totalDispensed: 0,
        damagedOrCancelled: 0,
        openingStock: 0,
        openingSerialFrom: '',
        openingSerialTo: '',
        minThreshold: 30,
        unit: 'أصل بلاغ',
        lastUpdated: now,
      },
      death_certificates: {
        id: 'death_certificates',
        name: 'شهادات الوفاة الورقية الرسمية',
        category: 'death',
        currentStock: 0,
        totalReceived: 0,
        totalDispensed: 0,
        damagedOrCancelled: 0,
        openingStock: 0,
        openingSerialFrom: '',
        openingSerialTo: '',
        minThreshold: 20,
        unit: 'شهادة / استمارة',
        lastUpdated: now,
      },
      death_notifications: {
        id: 'death_notifications',
        name: 'بلاغات الوفاة (إخطار تبليغ)',
        category: 'death',
        currentStock: 0,
        totalReceived: 0,
        totalDispensed: 0,
        damagedOrCancelled: 0,
        openingStock: 0,
        openingSerialFrom: '',
        openingSerialTo: '',
        minThreshold: 20,
        unit: 'أصل بلاغ',
        lastUpdated: now,
      },
      health_cards_male: {
        id: 'health_cards_male',
        name: 'بطاقات صحية ذكور (تطعيمات ورعاية)',
        category: 'health_card',
        currentStock: 0,
        totalReceived: 0,
        totalDispensed: 0,
        damagedOrCancelled: 0,
        openingStock: 0,
        openingSerialFrom: '',
        openingSerialTo: '',
        minThreshold: 25,
        unit: 'بطاقة',
        lastUpdated: now,
      },
      health_cards_female: {
        id: 'health_cards_female',
        name: 'بطاقات صحية إناث (تطعيمات ورعاية)',
        category: 'health_card',
        currentStock: 0,
        totalReceived: 0,
        totalDispensed: 0,
        damagedOrCancelled: 0,
        openingStock: 0,
        openingSerialFrom: '',
        openingSerialTo: '',
        minThreshold: 25,
        unit: 'بطاقة',
        lastUpdated: now,
      },
      late_reg_under_year: {
        id: 'late_reg_under_year',
        name: 'استمارات ساقط قيد (أقل من عام)',
        category: 'late_registration',
        currentStock: 0,
        totalReceived: 0,
        totalDispensed: 0,
        damagedOrCancelled: 0,
        openingStock: 0,
        openingSerialFrom: '',
        openingSerialTo: '',
        minThreshold: 15,
        unit: 'استمارة / نموذج',
        lastUpdated: now,
      },
      late_reg_over_year: {
        id: 'late_reg_over_year',
        name: 'استمارات ساقط قيد (أكبر من عام)',
        category: 'late_registration',
        currentStock: 0,
        totalReceived: 0,
        totalDispensed: 0,
        damagedOrCancelled: 0,
        openingStock: 0,
        openingSerialFrom: '',
        openingSerialTo: '',
        minThreshold: 15,
        unit: 'استمارة / نموذج',
        lastUpdated: now,
      },
    },
    openingBalances: {
      asOfDate: new Date().toISOString().split('T')[0],
      minuteNumber: '',
      inventoryKeeper: 'كاتب صحة سفلاق',
      committeeLeader: '',
      committeeMember: '',
      officeManager: '',
      notes: 'رصيد صفري نظيف',
      createdAt: now,
      updatedAt: now,
      items: {
        birth_certificates: { stockCategory: 'birth_certificates', openingQuantity: 0, serialFrom: '', serialTo: '' },
        birth_notifications: { stockCategory: 'birth_notifications', openingQuantity: 0, serialFrom: '', serialTo: '' },
        death_certificates: { stockCategory: 'death_certificates', openingQuantity: 0, serialFrom: '', serialTo: '' },
        death_notifications: { stockCategory: 'death_notifications', openingQuantity: 0, serialFrom: '', serialTo: '' },
        health_cards_male: { stockCategory: 'health_cards_male', openingQuantity: 0, serialFrom: '', serialTo: '' },
        health_cards_female: { stockCategory: 'health_cards_female', openingQuantity: 0, serialFrom: '', serialTo: '' },
        late_reg_under_year: { stockCategory: 'late_reg_under_year', openingQuantity: 0, serialFrom: '', serialTo: '' },
        late_reg_over_year: { stockCategory: 'late_reg_over_year', openingQuantity: 0, serialFrom: '', serialTo: '' },
      },
    },
    supplyTransactions: [],
    dispenseRecords: [],
    lateRegistrations: [],
  };
}

export interface FactoryResetOptions {
  resetBy?: string;
  reason?: string;
  preserveOfficeSettings?: boolean;
}

export interface FactoryResetVerificationReport {
  verified: boolean;
  timestamp: string;
  checks: {
    dispenseRecordsEmpty: boolean;
    supplyTransactionsEmpty: boolean;
    lateRegistrationsEmpty: boolean;
    allStockBalancesZero: boolean;
    syncQueueEmpty: boolean;
    boundaryEstablished: boolean;
    serverResetSuccess?: boolean;
  };
  details: {
    dispensesCount: number;
    suppliesCount: number;
    lateRegCount: number;
    nonZeroStocks: string[];
    pendingQueueCount: number;
    resetId: string;
    resetAt: string;
    serverMessage?: string;
  };
}

export interface FactoryResetResult {
  success: boolean;
  database: AppDatabase;
  verification: FactoryResetVerificationReport;
  backupSnapshotId?: string;
  message: string;
}

/**
 * Validates that all operational data has been physically cleared and zeroed.
 */
export async function verifyFactoryReset(
  db: AppDatabase,
  serverResponse?: any
): Promise<FactoryResetVerificationReport> {
  const dispensesCount = (db.dispenseRecords || []).length;
  const suppliesCount = (db.supplyTransactions || []).length;
  const lateRegCount = (db.lateRegistrations || []).length;

  const nonZeroStocks: string[] = [];
  if (db.stocks) {
    for (const [key, stock] of Object.entries(db.stocks)) {
      if (
        stock.currentStock !== 0 ||
        stock.totalReceived !== 0 ||
        stock.totalDispensed !== 0 ||
        stock.openingStock !== 0
      ) {
        nonZeroStocks.push(key);
      }
    }
  }

  let queueCount = 0;
  try {
    queueCount = await getPendingQueueCount();
  } catch {}

  const boundaryEstablished = Boolean(db.resetBoundary && db.resetBoundary.resetId);
  const serverResetSuccess = serverResponse ? serverResponse.success === true : undefined;

  const dispenseRecordsEmpty = dispensesCount === 0;
  const supplyTransactionsEmpty = suppliesCount === 0;
  const lateRegistrationsEmpty = lateRegCount === 0;
  const allStockBalancesZero = nonZeroStocks.length === 0;
  const syncQueueEmpty = queueCount === 0;

  const verified =
    dispenseRecordsEmpty &&
    supplyTransactionsEmpty &&
    lateRegistrationsEmpty &&
    allStockBalancesZero &&
    syncQueueEmpty &&
    boundaryEstablished &&
    (serverResetSuccess !== false);

  return {
    verified,
    timestamp: new Date().toISOString(),
    checks: {
      dispenseRecordsEmpty,
      supplyTransactionsEmpty,
      lateRegistrationsEmpty,
      allStockBalancesZero,
      syncQueueEmpty,
      boundaryEstablished,
      serverResetSuccess,
    },
    details: {
      dispensesCount,
      suppliesCount,
      lateRegCount,
      nonZeroStocks,
      pendingQueueCount: queueCount,
      resetId: db.resetBoundary?.resetId || '',
      resetAt: db.resetBoundary?.resetAt || '',
      serverMessage: serverResponse?.message,
    },
  };
}

/**
 * Radical Factory Reset Engine:
 * 1. Acquires Global Lock to strictly prevent concurrent Auto-Sync race conditions.
 * 2. Takes safety pre-reset snapshot in IDB and localStorage emergency backup.
 * 3. Purges all sync queues, pending queue items, and pending flags in IDB and LocalStorage.
 * 4. Creates a ResetBoundary and a zeroed clean database.
 * 5. Calls server atomic reset endpoint POST /api/factory-reset to wipe centralized DB.
 * 6. Directly saves clean state to localStorage and IDB (without firing background auto sync).
 * 7. Performs mathematical and structural verification of the zeroed state.
 * 8. Releases lock and dispatches system-wide reset events.
 */
export async function performFactoryReset(
  options?: FactoryResetOptions
): Promise<FactoryResetResult> {
  console.log('[Factory Reset] Initializing radical factory reset workflow...');
  
  // 1. Acquire Global Reset Lock and cancel any pending debounced sync timers
  setFactoryResetInProgress(true);
  if (debounceSyncTimer) {
    clearTimeout(debounceSyncTimer);
    debounceSyncTimer = null;
  }

  const now = new Date().toISOString();
  let backupSnapshotId: string | undefined;

  try {
    const currentDb = getDatabase();

    // 2. Step 1: Pre-reset Safety Snapshot (IndexedDB & LocalStorage emergency fallback)
    try {
      backupSnapshotId = `snap-reset-${Date.now()}`;
      await saveDurableSnapshotToIDB(currentDb, 'before_factory_reset');
      if (typeof window !== 'undefined') {
        localStorage.setItem('saflaq_emergency_pre_reset_backup', JSON.stringify({
          timestamp: now,
          database: currentDb,
        }));
      }
      console.log('[Factory Reset] Pre-reset safety snapshot created:', backupSnapshotId);
    } catch (snapshotErr) {
      console.warn('[Factory Reset] Safety snapshot warning:', snapshotErr);
    }

    // 3. Step 2: Purge Sync Queue & Pending Flags across all storage layers
    await clearAllSyncQueueAndLocks();
    markHasPendingChanges(false);
    console.log('[Factory Reset] Sync queues and pending flags purged.');

    // 4. Step 3: Construct Clean Database & Reset Boundary
    const resetId = `rst-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const resetVersion = (currentDb.version || 1) + 1;
    const resetBy = options?.resetBy || currentDb.officeSettings?.currentEmployee || 'كاتب صحة سفلاق';
    
    const resetBoundary: ResetBoundary = {
      resetId,
      resetAt: now,
      resetBy,
      resetVersion,
      backupId: backupSnapshotId,
      reason: options?.reason || 'إعادة ضبط المصنع والتصفير الشامل المعتمد',
    };

    const cleanDb: AppDatabase = createEmptyDatabase();
    cleanDb.version = resetVersion;
    cleanDb.lastBackupDate = now;
    cleanDb.resetBoundary = resetBoundary;
    if (options?.preserveOfficeSettings !== false && currentDb.officeSettings) {
      cleanDb.officeSettings = {
        ...currentDb.officeSettings,
      };
    }

    // 5. Step 4: Atomic Server Wipe via dedicated POST /api/factory-reset
    let serverResponse: any = null;
    try {
      const isOnline = await checkRealInternetConnection();
      if (isOnline) {
        console.log('[Factory Reset] Sending factory-reset command to server...');
        const response = await fetch('/api/factory-reset', {
          method: 'POST',
          headers: getApiAuthHeaders({
            isDestructive: true,
            extraHeaders: { 'Cache-Control': 'no-cache' },
          }),
          body: JSON.stringify({
            resetBoundary,
            clientDatabase: cleanDb,
            deviceId: getOrCreateDeviceId(),
            reason: options?.reason,
            adminSecretKey: getAdminSecretKey(),
          }),
        });

        if (response.ok) {
          serverResponse = await response.json();
          console.log('[Factory Reset] Server response:', serverResponse);
        } else {
          console.warn('[Factory Reset] Server returned status:', response.status);
        }
      } else {
        console.log('[Factory Reset] Offline mode: Server wipe deferred until reconnection.');
      }
    } catch (serverErr) {
      console.warn('[Factory Reset] Network call to /api/factory-reset failed (offline safe):', serverErr);
    }

    // 6. Step 5: Save Clean Database Directly (Bypassing saveDatabase to eliminate Auto Sync side-effects)
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(cleanDb));
    }
    await saveDurableSnapshotToIDB(cleanDb, 'factory_reset');

    // Update AutoSync configuration state
    saveAutoSyncConfig({
      lastSyncToken: now,
      lastSyncTime: now,
      lastSyncStatus: 'success',
      lastSyncMessage: 'تم التصفير الشامل وإعادة ضبط المصنع وإنشاء حد الأمان بنجاح',
      pendingQueueCount: 0,
    });

    // 7. Step 6: Execute Comprehensive Verification Check
    const verification = await verifyFactoryReset(cleanDb, serverResponse);
    console.log('[Factory Reset] Verification report:', verification);

    // 8. Step 7: Dispatch Application Reset Events
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('saflaq:database-reset', { detail: { cleanDb, verification } }));
      window.dispatchEvent(new CustomEvent('saflaq:database-synced', { detail: { cleanDb } }));
    }

    return {
      success: verification.verified,
      database: cleanDb,
      verification,
      backupSnapshotId,
      message: verification.verified
        ? 'تم التصفير الشامل وإعادة ضبط المصنع بنجاح تام وتصفير كافة الحركات والأرصدة وقاعدة البيانات المركزية'
        : 'تم تنفيذ التصفير ولكن الفحص أظهر بعض الملاحظات، يرجى مراجعة تفاصيل التحقق',
    };
  } finally {
    // 9. Release Global Reset Lock
    setFactoryResetInProgress(false);
    console.log('[Factory Reset] Lock released. Factory reset complete.');
  }
}

export function resetToCleanDatabase(): AppDatabase {
  // Synchronous clean database with Reset Boundary
  const now = new Date().toISOString();
  const resetId = `rst-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  const clean = createEmptyDatabase();
  clean.resetBoundary = {
    resetId,
    resetAt: now,
    resetBy: 'كاتب صحة سفلاق',
    resetVersion: 2,
    reason: 'إعادة ضبط سريعة مع حد أمان',
  };

  if (typeof window !== 'undefined') {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(clean));
    // Asynchronously perform full reset flow (safety snapshot, server wipe, verify)
    performFactoryReset().catch((err) => {
      console.warn('Async performFactoryReset encountered an error:', err);
    });
  }

  return clean;
}

export function resetToDemoDatabase(): AppDatabase {
  saveDatabase(INITIAL_DATABASE);
  return INITIAL_DATABASE;
}

export { verifyDispenseCrudIntegrity } from './dispenseIntegrityVerification';

if (typeof window !== 'undefined') {
  import('./dispenseIntegrityVerification').then(({ verifyDispenseCrudIntegrity }) => {
    (window as any).verifyDispenseCrudIntegrity = verifyDispenseCrudIntegrity;
  }).catch(() => {});
}


