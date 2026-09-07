import { 
  AppDatabase, 
  DispenseRecord, 
  LateRegistrationRecord, 
  LateRegStatus,
  LateRegTrackingStep,
  OpeningBalanceRecord, 
  OpeningBalanceItem, 
  SerialRange,
  StockCategory, 
  SupplyTransaction,
  STOCK_CATEGORIES_INFO
} from '../types';

export { STOCK_CATEGORIES_INFO };
import { 
  executeAutoSync, 
  markHasPendingChanges,
  enqueueSyncItem,
  generateGlobalTxId,
  getOrCreateDeviceId 
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
      totalReceived: 300,
      totalDispensed: 152,
      damagedOrCancelled: 3,
      minThreshold: 30,
      unit: 'شهادة / استمارة',
      lastUpdated: new Date().toISOString(),
    },
    birth_notifications: {
      id: 'birth_notifications',
      name: 'بلاغات الميلاد (إخطار تبليغ)',
      category: 'birth',
      currentStock: 160,
      totalReceived: 300,
      totalDispensed: 140,
      damagedOrCancelled: 0,
      minThreshold: 30,
      unit: 'أصل بلاغ',
      lastUpdated: new Date().toISOString(),
    },
    death_certificates: {
      id: 'death_certificates',
      name: 'شهادات الوفاة الورقية الرسمية',
      category: 'death',
      currentStock: 85,
      totalReceived: 150,
      totalDispensed: 64,
      damagedOrCancelled: 1,
      minThreshold: 20,
      unit: 'شهادة / استمارة',
      lastUpdated: new Date().toISOString(),
    },
    death_notifications: {
      id: 'death_notifications',
      name: 'بلاغات الوفاة (إخطار تبليغ)',
      category: 'death',
      currentStock: 90,
      totalReceived: 150,
      totalDispensed: 60,
      damagedOrCancelled: 0,
      minThreshold: 20,
      unit: 'أصل بلاغ',
      lastUpdated: new Date().toISOString(),
    },
    health_cards_male: {
      id: 'health_cards_male',
      name: 'بطاقات صحية ذكور (تطعيمات ورعاية)',
      category: 'health_card',
      currentStock: 112,
      totalReceived: 200,
      totalDispensed: 88,
      damagedOrCancelled: 0,
      minThreshold: 25,
      unit: 'بطاقة',
      lastUpdated: new Date().toISOString(),
    },
    health_cards_female: {
      id: 'health_cards_female',
      name: 'بطاقات صحية إناث (تطعيمات ورعاية)',
      category: 'health_card',
      currentStock: 98,
      totalReceived: 200,
      totalDispensed: 102,
      damagedOrCancelled: 0,
      minThreshold: 25,
      unit: 'بطاقة',
      lastUpdated: new Date().toISOString(),
    },
    late_reg_under_year: {
      id: 'late_reg_under_year',
      name: 'استمارات ساقط قيد (أقل من عام)',
      category: 'late_registration',
      currentStock: 75,
      totalReceived: 100,
      totalDispensed: 25,
      damagedOrCancelled: 0,
      minThreshold: 15,
      unit: 'استمارة / نموذج',
      lastUpdated: new Date().toISOString(),
    },
    late_reg_over_year: {
      id: 'late_reg_over_year',
      name: 'استمارات ساقط قيد (أكبر من عام)',
      category: 'late_registration',
      openingStock: 40,
      openingSerialFrom: '001401',
      openingSerialTo: '001440',
      currentStock: 60,
      totalReceived: 80,
      totalDispensed: 20,
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
      if (debounceSyncTimer) clearTimeout(debounceSyncTimer);
      debounceSyncTimer = setTimeout(() => {
        executeAutoSync(db, 'change').catch(() => {});
      }, 1200);
    }
  } catch (error) {
    console.error('Failed to save database to localStorage:', error);
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

  const supply: SupplyTransaction = {
    ...data,
    id: 'sup-' + Date.now(),
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
    stock.currentStock += data.quantity;
    stock.totalReceived += data.quantity;
    stock.lastUpdated = now;
  }

  // Enqueue for central idempotent synchronization
  enqueueSyncItem({
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
  updates: Partial<SupplyTransaction>
): AppDatabase {
  const db = getDatabase();
  const txIndex = db.supplyTransactions.findIndex((t) => t.id === id);
  if (txIndex === -1) return db;

  const oldTx = db.supplyTransactions[txIndex];
  const targetCategory = updates.stockCategory || oldTx.stockCategory;
  const targetQuantity = updates.quantity !== undefined ? Number(updates.quantity) : oldTx.quantity;

  // If category or quantity changed, update inventory stocks accordingly
  if (targetCategory !== oldTx.stockCategory || targetQuantity !== oldTx.quantity) {
    // Revert old transaction amounts
    const oldStock = db.stocks[oldTx.stockCategory];
    if (oldStock) {
      oldStock.currentStock = Math.max(0, oldStock.currentStock - oldTx.quantity);
      oldStock.totalReceived = Math.max(0, oldStock.totalReceived - oldTx.quantity);
      oldStock.lastUpdated = new Date().toISOString();
    }
    // Apply new transaction amounts
    const newStock = db.stocks[targetCategory];
    if (newStock) {
      newStock.currentStock += targetQuantity;
      newStock.totalReceived += targetQuantity;
      newStock.lastUpdated = new Date().toISOString();
    }
  }

  db.supplyTransactions[txIndex] = {
    ...oldTx,
    ...updates,
    quantity: targetQuantity,
  };

  saveDatabase(db);
  return db;
}

export function deleteSupplyTransaction(id: string): AppDatabase {
  const db = getDatabase();
  const txIndex = db.supplyTransactions.findIndex((t) => t.id === id);
  if (txIndex === -1) return db;

  const tx = db.supplyTransactions[txIndex];
  const stock = db.stocks[tx.stockCategory];
  if (stock) {
    stock.currentStock = Math.max(0, stock.currentStock - tx.quantity);
    stock.totalReceived = Math.max(0, stock.totalReceived - tx.quantity);
    stock.lastUpdated = new Date().toISOString();
  }

  db.supplyTransactions.splice(txIndex, 1);
  saveDatabase(db);
  return db;
}

export function addDispenseRecord(
  data: Omit<DispenseRecord, 'id' | 'createdAt'>
): { db: AppDatabase; record: DispenseRecord } {
  const db = getDatabase();
  const now = new Date().toISOString();
  const txId = (data as any).transactionId || generateGlobalTxId();
  const devId = (data as any).deviceId || getOrCreateDeviceId();
  const isOffline = typeof navigator !== 'undefined' ? !navigator.onLine : false;

  const record: DispenseRecord = {
    ...data,
    id: 'disp-' + Date.now(),
    createdAt: now,
    transactionId: txId,
    deviceId: devId,
    syncStatus: 'pending',
    isOfflineCreated: isOffline,
  };

  db.dispenseRecords.unshift(record);

  // Deduct stocks locally (Optimistic Local Execution)
  data.itemsDeducted.forEach((item) => {
    const stock = db.stocks[item.stockCategory];
    if (stock) {
      stock.currentStock = Math.max(0, stock.currentStock - item.quantity);
      stock.totalDispensed += item.quantity;
      stock.lastUpdated = now;
    }
  });

  // Enqueue for central idempotent synchronization
  enqueueSyncItem({
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
  updates: Partial<DispenseRecord>
): AppDatabase {
  const db = getDatabase();
  const recordIndex = db.dispenseRecords.findIndex((r) => r.id === id);
  if (recordIndex === -1) return db;

  const oldRecord = db.dispenseRecords[recordIndex];

  // If itemsDeducted is being updated, adjust stock differences
  if (
    updates.itemsDeducted &&
    JSON.stringify(updates.itemsDeducted) !== JSON.stringify(oldRecord.itemsDeducted)
  ) {
    // 1. Revert previous deductions back to stock
    if (oldRecord.itemsDeducted && Array.isArray(oldRecord.itemsDeducted)) {
      oldRecord.itemsDeducted.forEach((it) => {
        const stock = db.stocks[it.stockCategory];
        if (stock) {
          stock.currentStock += it.quantity;
          stock.totalDispensed = Math.max(0, stock.totalDispensed - it.quantity);
          stock.lastUpdated = new Date().toISOString();
        }
      });
    }
    // 2. Apply new deductions
    updates.itemsDeducted.forEach((it) => {
      const stock = db.stocks[it.stockCategory];
      if (stock) {
        stock.currentStock = Math.max(0, stock.currentStock - it.quantity);
        stock.totalDispensed += it.quantity;
        stock.lastUpdated = new Date().toISOString();
      }
    });
  }

  db.dispenseRecords[recordIndex] = {
    ...oldRecord,
    ...updates,
  };

  saveDatabase(db);
  return db;
}

export function deleteDispenseRecord(id: string): AppDatabase {
  const db = getDatabase();
  const recordIndex = db.dispenseRecords.findIndex((r) => r.id === id);
  if (recordIndex === -1) return db;

  const record = db.dispenseRecords[recordIndex];

  // Return deducted items to inventory stock
  if (record.itemsDeducted && Array.isArray(record.itemsDeducted)) {
    record.itemsDeducted.forEach((item) => {
      const stock = db.stocks[item.stockCategory];
      if (stock) {
        stock.currentStock += item.quantity;
        stock.totalDispensed = Math.max(0, stock.totalDispensed - item.quantity);
        stock.lastUpdated = new Date().toISOString();
      }
    });
  }

  db.dispenseRecords.splice(recordIndex, 1);
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

  // If requested and ageCategory is specified, deduct from appropriate stock
  if (deductStock && data.ageCategory) {
    const stockCat: StockCategory =
      data.ageCategory === 'under_one_year' ? 'late_reg_under_year' : 'late_reg_over_year';
    if (db.stocks[stockCat]) {
      db.stocks[stockCat].currentStock = Math.max(0, db.stocks[stockCat].currentStock - 1);
      db.stocks[stockCat].totalDispensed += 1;
      db.stocks[stockCat].lastUpdated = now;
    }
  }

  db.lateRegistrations.unshift(record);

  // Enqueue for central synchronization
  enqueueSyncItem({
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
    db.lateRegistrations[index] = {
      ...db.lateRegistrations[index],
      ...updates,
      updatedAt: new Date().toISOString(),
    };
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
  enqueueSyncItem({
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

export function deleteLateRegistration(id: string): AppDatabase {
  const db = getDatabase();
  db.lateRegistrations = db.lateRegistrations.filter((r) => r.id !== id);
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

export function resetToCleanDatabase(): AppDatabase {
  const clean = createEmptyDatabase();
  saveDatabase(clean);
  return clean;
}

export function resetToDemoDatabase(): AppDatabase {
  saveDatabase(INITIAL_DATABASE);
  return INITIAL_DATABASE;
}

