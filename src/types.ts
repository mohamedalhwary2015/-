/**
 * Data structures for Saflaq Health Office (مكتب صحة سفلاق)
 */

export type StockCategory = 
  | 'birth_certificates'    // شهادات الميلاد
  | 'birth_notifications'   // بلاغات الميلاد
  | 'death_certificates'    // شهادات الوفاة
  | 'death_notifications'   // بلاغات الوفاة
  | 'health_cards_male'     // بطاقات صحية ذكور
  | 'health_cards_female'   // بطاقات صحية إناث
  | 'late_reg_under_year'   // استمارات ساقط قيد أقل من عام
  | 'late_reg_over_year';    // استمارات ساقط قيد أكبر من عام

export const STOCK_CATEGORIES_INFO: Record<StockCategory, { name: string; category: 'birth' | 'death' | 'health_card' | 'late_registration'; unit: string; minThreshold: number }> = {
  birth_certificates: { name: 'شهادات الميلاد الورقية الرسمية', category: 'birth', unit: 'شهادة / استمارة', minThreshold: 30 },
  birth_notifications: { name: 'بلاغات الميلاد (إخطار تبليغ)', category: 'birth', unit: 'أصل بلاغ', minThreshold: 30 },
  death_certificates: { name: 'شهادات الوفاة الورقية الرسمية', category: 'death', unit: 'شهادة / استمارة', minThreshold: 20 },
  death_notifications: { name: 'بلاغات الوفاة (إخطار تبليغ)', category: 'death', unit: 'أصل بلاغ', minThreshold: 20 },
  health_cards_male: { name: 'بطاقات صحية ذكور (تطعيمات ورعاية)', category: 'health_card', unit: 'بطاقة', minThreshold: 25 },
  health_cards_female: { name: 'بطاقات صحية إناث (تطعيمات ورعاية)', category: 'health_card', unit: 'بطاقة', minThreshold: 25 },
  late_reg_under_year: { name: 'استمارات ساقط قيد (أقل من عام)', category: 'late_registration', unit: 'استمارة / نموذج', minThreshold: 15 },
  late_reg_over_year: { name: 'استمارات ساقط قيد (أكبر من عام)', category: 'late_registration', unit: 'استمارة / نموذج', minThreshold: 15 },
};

export interface SerialRange {
  id?: string;
  bookNumber?: string;  // رقم الدفتر (مثلاً: دفتر 1)
  from: string;        // من مسلسل
  to: string;          // إلى مسلسل
  count?: number;      // عدد المستندات
  notes?: string;      // ملاحظات المسلسل
}

export interface StockItem {
  id: StockCategory;
  name: string;
  category: 'birth' | 'death' | 'health_card' | 'late_registration';
  openingStock?: number;        // الرصيد الافتتاحي في بداية الدورة
  openingSerialFrom?: string;   // من مسلسل افتتاحي
  openingSerialTo?: string;     // إلى مسلسل افتتاحي
  openingSerialRanges?: SerialRange[]; // دعم أكثر من تسلسل / دفاتر متعددة
  currentStock: number;
  totalReceived: number;
  totalDispensed: number;
  damagedOrCancelled: number;
  minThreshold: number; // حد التنبيه
  unit: string;
  lastUpdated: string;
}

export interface SupplyTransaction {
  id: string;
  stockCategory: StockCategory;
  date: string;
  quantity: number;
  documentNumber: string; // رقم إذن التوريد / المستند
  serialFrom?: string;    // من مسلسل
  serialTo?: string;      // إلى مسلسل
  supplierName: string;   // اسم جهة التوريد / الموظف المورد
  receivedBy: string;     // اسم المستلم
  notes?: string;
  createdAt: string;

  // حقول المعاملات والمزامنة التراكمية (Additive Sync Fields)
  transactionId?: string;           // معرف الحركة العالمي الفريد Global Unique Transaction ID
  deviceId?: string;                // معرف الجهاز المنفذ للحركة Device ID
  syncStatus?: 'synced' | 'pending'; // حالة المزامنة
  syncedAt?: string;                // توقيت الاعتماد المركزي
  isOfflineCreated?: boolean;       // تم إنشاؤها أوفلاين
  version?: number;                 // رقم إصدار السجل
}

export type DispenseType = 
  | 'birth_certificate'   // صرف شهادة ميلاد منفردة
  | 'birth_notification'  // صرف بلاغ ميلاد منفرد
  | 'health_card_male'    // صرف بطاقة صحية ذكور
  | 'health_card_female'  // صرف بطاقة صحية إناث
  | 'death_certificate'   // صرف شهادة وفاة منفردة
  | 'death_notification'  // صرف بلاغ وفاة منفرد
  | 'late_reg_under_year' // صرف استمارة ساقط قيد أقل من عام
  | 'late_reg_over_year'  // صرف استمارة ساقط قيد أكبر من عام
  | 'multiple'            // صرف مجمع / متعدد باختيار الموظف
  | 'birth_male'          // صرف قديم (توافق)
  | 'birth_female'        // صرف قديم (توافق)
  | 'death'               // صرف قديم (توافق)
  | 'custom';             // صرف مخصص

export interface DispenseRecord {
  id: string;
  dispenseType: DispenseType;
  date: string; // YYYY-MM-DD
  time: string; // HH:mm
  
  // بيانات الصرف المطلوبة بدقة من المستخدم
  beneficiaryName: string;          // اسم المنصرف له / المستلم
  certificateNumber?: string;       // خانة كتابة رقم الشهادة (إن وجد)
  notes?: string;                   // خانة للملاحظات
  
  // تفاصيل البنود المصروفة فعلياً (لكل بند رصيد مستقل)
  itemsDeducted: {
    stockCategory: StockCategory;
    quantity: number;
  }[];
  
  dispensedBy: string;              // اسم الموظف القائم بالصرف
  createdAt: string;

  // حقول تكميلية واختيارية للتوافق الكامل مع السجلات السابقة
  healthCardReceiptNumber?: string; // رقم إيصال توريد البطاقات الصحية
  dispenseEventType?: string;       // نوع واقعة الصرف (قيد ولادة - أول مرة / بدل فاقد / بدل تالف / قيد وفاة...)
  paymentAmount?: number;           // الرسوم المحصلة بالجنيه
  notificationNumber?: string;      // رقم البلاغ أو الإخطار
  gender?: 'male' | 'female';
  eventDate?: string;
  fatherName?: string;
  fatherNationalId?: string;
  motherName?: string;
  motherNationalId?: string;
  address?: string;
  reporterName?: string;
  reporterRelation?: string;
  reporterPhone?: string;
  beneficiaryNationalId?: string;
  enteredIntoGovSystem?: boolean; // هل تم الإدخال على منظومة الميكنة 10.1.80.50
  govSystemEntryDate?: string;    // تاريخ الإدخال على المنظومة
  govSystemRefNumber?: string;    // رقم القيد أو الإثبات بالمنظومة

  // حقول المعاملات والمزامنة التراكمية (Additive Sync Fields)
  transactionId?: string;           // معرف الحركة العالمي الفريد Global Unique Transaction ID
  deviceId?: string;                // معرف الجهاز المنفذ للحركة Device ID
  syncStatus?: 'synced' | 'pending'; // حالة المزامنة
  syncedAt?: string;                // توقيت الاعتماد المركزي
  isOfflineCreated?: boolean;       // تم إنشاؤها أوفلاين
  version?: number;                 // رقم إصدار السجل
  updatedAt?: string;               // توقيت آخر تعديل للسجل
}

export type LateRegType = 'birth' | 'death'; // ساقط قيد ميلاد / ساقط قيد وفاة

export type LateRegStatus = 
  | 'under_review'   // قيد المراجعة والفحص بمكتب الصحة
  | 'medical_comm'   // محال للجنة الطبية المختصة
  | 'civil_registry' // أرسل للسجل المدني بساقلتة
  | 'approved'       // تم الاعتماد واستخراج القيد
  | 'rejected';      // مرفوض لعدم استيفاء المستندات

export interface LateRegTrackingStep {
  id?: string;
  status: LateRegStatus;
  date: string;                     // تاريخ الإجراء (YYYY-MM-DD)
  time?: string;                     // وقت الإجراء (HH:mm)
  actionTitle: string;              // عنوان المرحلة أو الإجراء
  officialDocNumber?: string;       // رقم الصادر / رقم الخطاب / رقم القيد
  committeeDecision?: string;       // قرار اللجنة الطبية (السن المقدر، إلخ)
  notes?: string;                   // ملاحظات الإجراء
  performedBy: string;              // اسم الموظف المنفذ
}

export interface LateRegistrationRecord {
  id: string;
  formNumber: string;            // رقم استمارة ساقط القيد
  submissionDate: string;        // تاريخ تقديم الاستمارة
  type: LateRegType;             // نوع ساقط القيد (ميلاد / وفاة)
  ageCategory?: 'under_one_year' | 'over_one_year'; // فئة السن: أقل من عام (سنة) أو أكبر من عام
  
  // بيانات صاحب القيد
  personName: string;            // اسم صاحب القيد رباعي
  gender: 'male' | 'female';
  eventDate: string;             // تاريخ الواقعة الفعلي أو التقريبي
  eventPlace: string;            // محل الواقعة (القرية أو المستشفى)
  fatherName: string;            // اسم الأب
  motherName: string;            // اسم الأم
  
  // بيانات مقدم الطلب
  applicantName: string;         // اسم مقدم الطلب
  applicantRelation: string;     // صفته / صلته بصاحب القيد
  applicantNationalId: string;   // الرقم القومي لمقدم الطلب
  applicantPhone: string;        // رقم الهاتف
  applicantAddress: string;      // عنوان مقدم الطلب
  
  // أسباب التأخر في التبليغ
  delayReason: string;           // سبب التأخر عن الميعاد القانوني
  
  // تسجيل الملاحظات (مطلوب صراحة من المستخدم)
  notes: string;                 // خانة تفصيلية لتسجيل الملاحظات الإدارية والقانونية
  
  // متابعة وتتبع الإجراءات (خاصية متابعة حالة الاستمارة)
  status: LateRegStatus;
  medicalCommitteeDecision?: string; // قرار اللجنة الطبية
  medicalCommitteeDecisionDate?: string; // تاريخ قرار اللجنة
  medicalCommitteeDocNumber?: string; // رقم كتاب الإحالة للجنة
  civilRegistryDocNumber?: string;   // رقم صادر السجل المدني / كتاب القيد
  civilRegistrySendDate?: string;    // تاريخ الإرسال للسجل المدني
  finalRegistrationNumber?: string;  // رقم القيد النهائي المعتمد بسجل ساقط القيد
  finalCertificateNumber?: string;   // رقم شهادة الميلاد/الوفاة المستخرجة
  resolvedDate?: string;             // تاريخ إنهاء المعاملة والاعتماد
  rejectionReason?: string;          // سبب الرفض بالتفصيل
  rejectionDate?: string;            // تاريخ قرار الرفض
  trackingHistory?: LateRegTrackingStep[]; // سجل المتابعة والمسار الزمني
  staffName: string;                 // الموظف المختص
  createdAt: string;
  updatedAt: string;

  // حقول المعاملات والمزامنة التراكمية (Additive Sync Fields)
  transactionId?: string;           // معرف الحركة العالمي الفريد Global Unique Transaction ID
  deviceId?: string;                // معرف الجهاز المنفذ للحركة Device ID
  syncStatus?: 'synced' | 'pending'; // حالة المزامنة
  syncedAt?: string;                // توقيت الاعتماد المركزي
  isOfflineCreated?: boolean;       // تم إنشاؤها أوفلاين
  version?: number;                 // رقم إصدار السجل
}

export interface OpeningBalanceItem {
  stockCategory: StockCategory;
  openingQuantity: number;
  serialFrom?: string;
  serialTo?: string;
  serialRanges?: SerialRange[]; // دعم أكثر من تسلسل ودفاتر متعددة
  minThreshold?: number;
  notes?: string;
}

export interface OpeningBalanceRecord {
  asOfDate: string; // تاريخ الرصيد الافتتاحي (YYYY-MM-DD)
  minuteNumber: string; // رقم محضر الجرد الافتتاحي
  inventoryKeeper: string; // كاتب صحة سفلاق / أمين العهدة
  committeeLeader: string; // رئيس لجنة الجرد / المفتش الصحي
  committeeMember?: string; // مراقب أول الصحة
  officeManager?: string; // مدير مكتب الصحة
  items: Record<StockCategory, OpeningBalanceItem>;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ResetBoundary {
  resetId: string;
  resetAt: string; // ISO timestamp of reset boundary
  resetBy: string;
  resetVersion: number;
  backupId?: string;
  reason?: string;
}

export interface SyncTombstone {
  id?: string;
  recordId: string;
  transactionId?: string;
  operationType: 'DELETE_DISPENSE' | 'DELETE_SUPPLY' | 'DELETE_LATE_REG';
  deletedAt: string;
  deviceId?: string;
  deletedBy?: string;
  reason?: string;
  itemsRestored?: any;
  synced?: boolean;
  details?: any;
}

export interface AppDatabase {
  version: number;
  lastBackupDate: string;
  stocks: Record<StockCategory, StockItem>;
  supplyTransactions: SupplyTransaction[];
  dispenseRecords: DispenseRecord[];
  lateRegistrations: LateRegistrationRecord[];
  openingBalances?: OpeningBalanceRecord;
  resetBoundary?: ResetBoundary;
  syncTombstones?: SyncTombstone[];
  officeSettings: {
    officeName: string;
    center: string;
    directorate: string;
    governorate: string;
    currentEmployee: string;
  };
}

export type SyncStatus = 'synced' | 'syncing' | 'pending' | 'offline' | 'error';

export interface AutoSyncConfig {
  enabled: boolean;                      // تفعيل التخزين والتحديث التلقائي
  syncOnReconnect: boolean;              // مزامنة فورية عند عودة الاتصال بالإنترنت
  periodicSyncMinutes: number;           // دورية التخزين التلقائي بالدقائق عند توفر الإنترنت
  durableIndexedDB: boolean;             // الاحتفاظ بنسخة احتياطية مشفرة في IndexedDB عالي السعة
  cloudServerSync: boolean;              // إرسال نسخة احتياطية لخادم المركز السحابي عند الاتصال
  lastSyncTime: string | null;           // توقيت آخر تخزين ومزامنة ناجحة
  lastSyncStatus: 'success' | 'failed' | 'pending' | null;
  lastSyncMessage: string | null;
  totalRecordsLastSynced: number;
  deviceId?: string;                     // معرف الجهاز الحالي
  pendingQueueCount?: number;            // عدد الحركات بانتظار الإرسال
  lastSyncToken?: string | null;         // توكن آخر مزامنة تدريجية
}

export interface SyncQueueItem {
  syncId: string;                        // UUID فريد لعنصر الطابور
  transactionId: string;                 // Global Unique Transaction ID
  deviceId: string;                      // معرف الجهاز المنفذ للحركة
  userId: string;                        // الموظف المنفذ
  operationType:
    | 'DISPENSE'
    | 'SUPPLY'
    | 'LATE_REG_ADD'
    | 'LATE_REG_UPDATE'
    | 'UPDATE_DISPENSE'
    | 'DELETE_DISPENSE';
  tableName: 'dispenseRecords' | 'supplyTransactions' | 'lateRegistrations';
  recordId: string;                      // معرف السجل المستهدف
  payload: any;                          // بيانات الحركة كاملة
  createdAt: string;                     // تاريخ ووقت الإنشاء محلياً
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  retryCount: number;                    // عدد محاولات الإرسال
  lastError?: string;                    // نص آخر خطأ إن وجد
  syncedAt?: string;                     // توقيت الاعتماد المركزي
}

export interface SyncLogEntry {
  id: string;
  timestamp: string;
  trigger: 'reconnect' | 'manual' | 'periodic' | 'change';
  status: 'success' | 'failed';
  recordCount: number;
  details: string;
}
