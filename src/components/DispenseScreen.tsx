import React, { useState } from 'react';
import { AppDatabase, DispenseRecord, DispenseType, StockCategory } from '../types';
import { addDispenseRecord, updateDispenseRecord, deleteDispenseRecord } from '../storage/db';
import { EditDispenseModal } from './EditDispenseModal';
import { getDispenseTypeDisplay } from '../services/reportService';
import { 
  FileCheck2, 
  Baby, 
  HeartCrack, 
  Printer, 
  Search, 
  CheckCircle2, 
  AlertTriangle, 
  User, 
  Hash, 
  Calendar,
  Layers,
  FileText,
  FileSpreadsheet,
  Plus,
  Minus,
  CheckSquare,
  Square,
  Sparkles,
  Pencil,
  Trash2,
  Receipt,
  Tag,
  DollarSign
} from 'lucide-react';

interface DispenseScreenProps {
  db: AppDatabase;
  onDatabaseUpdate: (newDb: AppDatabase) => void;
  onSelectPrintRecord: (record: DispenseRecord) => void;
}

// All independent stock items available for dispensing
interface DocumentOption {
  id: StockCategory;
  name: string;
  categoryName: string;
  badgeColor: string;
  borderColor: string;
  activeBg: string;
  icon: React.ElementType;
  unit: string;
  isCertificate?: boolean;
}

const DOCUMENT_OPTIONS: DocumentOption[] = [
  {
    id: 'birth_certificates',
    name: 'شهادة ميلاد ورقية',
    categoryName: 'مواليد',
    badgeColor: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    borderColor: 'border-emerald-500',
    activeBg: 'bg-emerald-50/80',
    icon: FileText,
    unit: 'شهادة',
    isCertificate: true,
  },
  {
    id: 'birth_notifications',
    name: 'بلاغ ميلاد (إخطار)',
    categoryName: 'مواليد',
    badgeColor: 'bg-teal-100 text-teal-800 border-teal-300',
    borderColor: 'border-teal-500',
    activeBg: 'bg-teal-50/80',
    icon: Baby,
    unit: 'أصل بلاغ',
  },
  {
    id: 'health_cards_male',
    name: 'بطاقة صحية ذكور',
    categoryName: 'بطاقات صحية',
    badgeColor: 'bg-blue-100 text-blue-800 border-blue-300',
    borderColor: 'border-blue-500',
    activeBg: 'bg-blue-50/80',
    icon: User,
    unit: 'بطاقة زرقاء',
  },
  {
    id: 'health_cards_female',
    name: 'بطاقة صحية إناث',
    categoryName: 'بطاقات صحية',
    badgeColor: 'bg-pink-100 text-pink-800 border-pink-300',
    borderColor: 'border-pink-500',
    activeBg: 'bg-pink-50/80',
    icon: User,
    unit: 'بطاقة وردية',
  },
  {
    id: 'death_certificates',
    name: 'شهادة وفاة ورقية',
    categoryName: 'وفيات',
    badgeColor: 'bg-slate-200 text-slate-800 border-slate-400',
    borderColor: 'border-slate-700',
    activeBg: 'bg-slate-100',
    icon: FileText,
    unit: 'شهادة',
    isCertificate: true,
  },
  {
    id: 'death_notifications',
    name: 'بلاغ وفاة (إخطار)',
    categoryName: 'وفيات',
    badgeColor: 'bg-zinc-200 text-zinc-800 border-zinc-400',
    borderColor: 'border-zinc-600',
    activeBg: 'bg-zinc-100',
    icon: HeartCrack,
    unit: 'أصل بلاغ',
  },
  {
    id: 'late_reg_under_year',
    name: 'استمارة ساقط قيد (أقل من عام)',
    categoryName: 'ساقط قيد حديث',
    badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
    borderColor: 'border-amber-600',
    activeBg: 'bg-amber-50/80',
    icon: FileSpreadsheet,
    unit: 'استمارة',
  },
  {
    id: 'late_reg_over_year',
    name: 'استمارة ساقط قيد (أكبر من عام)',
    categoryName: 'ساقط قيد معتمد',
    badgeColor: 'bg-orange-100 text-orange-900 border-orange-300',
    borderColor: 'border-orange-600',
    activeBg: 'bg-orange-50/80',
    icon: FileSpreadsheet,
    unit: 'استمارة',
  },
];

export const DispenseScreen: React.FC<DispenseScreenProps> = ({
  db,
  onDatabaseUpdate,
  onSelectPrintRecord,
}) => {
  // Selected items mapping: category -> quantity
  const [selectedItems, setSelectedItems] = useState<Record<StockCategory, number>>({
    birth_certificates: 1,
    birth_notifications: 0,
    health_cards_male: 0,
    health_cards_female: 0,
    death_certificates: 0,
    death_notifications: 0,
    late_reg_under_year: 0,
    late_reg_over_year: 0,
  });

  // Mode: Single item selection (fastest) vs Multiple items
  const [multiSelectMode, setMultiSelectMode] = useState(false);

  // Exact required fields requested by user:
  // 1. اسم المنصرف له
  const [beneficiaryName, setBeneficiaryName] = useState('');
  // 2. تاريخ الصرف
  const [dispenseDate, setDispenseDate] = useState(new Date().toISOString().split('T')[0]);
  // 3. رقم الشهادة (إن وجد)
  const [certificateNumber, setCertificateNumber] = useState('');
  // 4. رقم الإيصال (خاصة عند صرف بطاقة صحية)
  const [healthCardReceiptNumber, setHealthCardReceiptNumber] = useState('');
  // 4.1 المبلغ المحصل / المورّد (ج.م)
  const [paymentAmount, setPaymentAmount] = useState('');
  // 5. نوع واقعة الصرف
  const [dispenseEventType, setDispenseEventType] = useState('قيد ولادة - إصدار أول مرة');
  // 6. خانة للملاحظات
  const [notes, setNotes] = useState('');
  // 7. النوع / الجنس للمولود أو المتوفى لحساب التقرير الشهري
  const [gender, setGender] = useState<'male' | 'female'>('male');
  
  // Officer
  const [dispensedBy, setDispensedBy] = useState(db.officeSettings.currentEmployee || 'كاتب صحة سفلاق');
  
  const [searchTerm, setSearchTerm] = useState('');
  const [successBanner, setSuccessBanner] = useState<DispenseRecord | null>(null);
  const [editingRecord, setEditingRecord] = useState<DispenseRecord | null>(null);

  const handleDeleteRecord = (r: DispenseRecord) => {
    const isConfirmed = window.confirm(
      `تأكيد حذف حركة الصرف:\nهل أنت متأكد من حذف حركة الصرف الخاصة بالمواطن/المستلم: "${r.beneficiaryName}"؟\n\nتنبيه: سيتم إرجاع كافة الكميات المصروفة تلقائياً إلى رصيد المخزن بمكتب صحة سفلاق وتسجيل علامة الحذف (Tombstone) لضمان عدم عودة السجل بعد المزامنة.`
    );
    if (!isConfirmed) return;

    try {
      const updatedDb = deleteDispenseRecord(r.id, db.officeSettings.currentEmployee || 'كاتب صحة سفلاق');
      onDatabaseUpdate(updatedDb);
    } catch (err: any) {
      alert(`حدث خطأ أثناء حذف السجل: ${err.message || err}`);
    }
  };

  const handleSaveEditRecord = (id: string, updates: Partial<DispenseRecord>) => {
    try {
      const updatedDb = updateDispenseRecord(id, updates, db.officeSettings.currentEmployee || 'كاتب صحة سفلاق');
      onDatabaseUpdate(updatedDb);
      alert('تم حفظ التعديلات بنجاح وتحديث الرصيد وسجل الوثائق المنصرفة.');
    } catch (err: any) {
      alert(`حدث خطأ أثناء تعديل السجل: ${err.message || err}`);
    }
  };

  // Handle clicking a document card in single-select mode
  const handleSingleSelect = (cat: StockCategory) => {
    const updated: Record<StockCategory, number> = {
      birth_certificates: 0,
      birth_notifications: 0,
      health_cards_male: 0,
      health_cards_female: 0,
      death_certificates: 0,
      death_notifications: 0,
      late_reg_under_year: 0,
      late_reg_over_year: 0,
    };
    updated[cat] = 1;
    setSelectedItems(updated);
    if (cat === 'health_cards_male') {
      setGender('male');
      setDispenseEventType('قيد ولادة - إصدار أول مرة');
    } else if (cat === 'health_cards_female') {
      setGender('female');
      setDispenseEventType('قيد ولادة - إصدار أول مرة');
    } else if (cat === 'death_certificates' || cat === 'death_notifications') {
      setDispenseEventType('قيد وفاة وتصريح دفن');
    } else if (cat === 'late_reg_under_year' || cat === 'late_reg_over_year') {
      setDispenseEventType('ساقط قيد معتمد');
    } else if (cat === 'birth_certificates' || cat === 'birth_notifications') {
      setDispenseEventType('قيد ولادة - إصدار أول مرة');
    }
  };

  // Handle toggling in multi-select mode
  const handleMultiToggle = (cat: StockCategory) => {
    setSelectedItems(prev => {
      const willSelect = !(prev[cat] > 0);
      if (willSelect) {
        if (cat === 'health_cards_male') {
          setGender('male');
          setDispenseEventType('قيد ولادة - إصدار أول مرة');
        } else if (cat === 'health_cards_female') {
          setGender('female');
          setDispenseEventType('قيد ولادة - إصدار أول مرة');
        } else if (cat === 'death_certificates' || cat === 'death_notifications') {
          setDispenseEventType('قيد وفاة وتصريح دفن');
        }
      }
      return {
        ...prev,
        [cat]: willSelect ? 1 : 0,
      };
    });
  };

  // Adjust quantity for a category
  const handleQuantityChange = (cat: StockCategory, delta: number) => {
    setSelectedItems(prev => {
      const current = prev[cat] || 0;
      const next = Math.max(0, current + delta);
      return { ...prev, [cat]: next };
    });
  };

  // Calculate items to deduct
  const itemsToDeduct = (Object.entries(selectedItems) as [StockCategory, number][])
    .filter(([, qty]) => qty > 0)
    .map(([cat, qty]) => ({ stockCategory: cat, quantity: qty }));

  // Check if any selected item is out of stock
  const insufficientItems = itemsToDeduct.filter(
    item => (db.stocks[item.stockCategory]?.currentStock ?? 0) < item.quantity
  );

  // Check if any certificate is selected (to guide user on the optional certificate number field)
  const isCertificateSelected = itemsToDeduct.some(
    it => it.stockCategory === 'birth_certificates' || it.stockCategory === 'death_certificates'
  );

  // Check if any health card is selected
  const isHealthCardSelected = itemsToDeduct.some(
    it => it.stockCategory === 'health_cards_male' || it.stockCategory === 'health_cards_female'
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!beneficiaryName.trim()) {
      alert('يرجى كتابة اسم المنصرف له / المستلم');
      return;
    }

    if (itemsToDeduct.length === 0) {
      alert('يرجى اختيار مستند واحد على الأقل لصرفه وتحديد كميته');
      return;
    }

    if (insufficientItems.length > 0) {
      const names = insufficientItems
        .map(i => `${db.stocks[i.stockCategory]?.name || i.stockCategory} (المتاح: ${db.stocks[i.stockCategory]?.currentStock ?? 0})`)
        .join('، ');
      if (!confirm(`تنبيه: الرصيد في المخزن غير كافٍ لـ: ${names}.\nهل تريد الاستمرار وإتمام الصرف بالرغم من ذلك؟`)) {
        return;
      }
    }

    const now = new Date();
    const timeStr = now.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit', hour12: false });

    // Determine primary dispense type
    let primaryType: DispenseType = 'multiple';
    if (itemsToDeduct.length === 1) {
      const singleCat = itemsToDeduct[0].stockCategory;
      if (singleCat === 'birth_certificates') primaryType = 'birth_certificate';
      else if (singleCat === 'birth_notifications') primaryType = 'birth_notification';
      else if (singleCat === 'health_cards_male') primaryType = 'health_card_male';
      else if (singleCat === 'health_cards_female') primaryType = 'health_card_female';
      else if (singleCat === 'death_certificates') primaryType = 'death_certificate';
      else if (singleCat === 'death_notifications') primaryType = 'death_notification';
      else if (singleCat === 'late_reg_under_year') primaryType = 'late_reg_under_year';
      else if (singleCat === 'late_reg_over_year') primaryType = 'late_reg_over_year';
    }

    const numericPayment =
      paymentAmount.trim() !== '' && !isNaN(Number(paymentAmount))
        ? Number(paymentAmount)
        : undefined;

    const { db: updatedDb, record } = addDispenseRecord({
      dispenseType: primaryType,
      date: dispenseDate,
      time: timeStr,
      beneficiaryName: beneficiaryName.trim(),
      certificateNumber: certificateNumber.trim() || undefined,
      healthCardReceiptNumber: healthCardReceiptNumber.trim() || undefined,
      paymentAmount: numericPayment,
      dispenseEventType: dispenseEventType.trim() || undefined,
      notes: notes.trim() || undefined,
      itemsDeducted: itemsToDeduct,
      dispensedBy: dispensedBy.trim(),
      gender: gender,
    });

    onDatabaseUpdate(updatedDb);
    setSuccessBanner(record);

    // Reset input fields
    setBeneficiaryName('');
    setCertificateNumber('');
    setHealthCardReceiptNumber('');
    setPaymentAmount('');
    setNotes('');

    // Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Active non-tombstoned records
  const tombstoneIds = new Set<string>();
  (db.syncTombstones || []).forEach((t) => {
    if (t.recordId) tombstoneIds.add(t.recordId);
    if (t.transactionId) tombstoneIds.add(t.transactionId);
  });

  const activeRecords = (db.dispenseRecords || []).filter(
    (r) => !tombstoneIds.has(r.id) && !(r.transactionId && tombstoneIds.has(r.transactionId))
  );

  // Filtered records for display
  const filteredRecords = activeRecords.filter(r => {
    const s = searchTerm.toLowerCase().trim();
    if (!s) return true;
    return (
      r.beneficiaryName.toLowerCase().includes(s) ||
      (r.certificateNumber && r.certificateNumber.toLowerCase().includes(s)) ||
      (r.healthCardReceiptNumber && r.healthCardReceiptNumber.toLowerCase().includes(s)) ||
      (r.paymentAmount !== undefined && String(r.paymentAmount).includes(s)) ||
      (r.dispenseEventType && r.dispenseEventType.toLowerCase().includes(s)) ||
      (r.notes && r.notes.toLowerCase().includes(s)) ||
      r.date.includes(s)
    );
  });

  return (
    <div className="space-y-6">
      {/* Success Banner */}
      {successBanner && (
        <div className="p-4 rounded-2xl bg-emerald-700 text-white shadow-lg flex flex-col sm:flex-row items-center justify-between gap-3 animate-in fade-in">
          <div className="flex items-center gap-3 text-right">
            <CheckCircle2 className="w-7 h-7 text-emerald-300 shrink-0" />
            <div>
              <h4 className="font-bold text-base">
                تم صرف وتوثيق المستندات بنجاح للمنصرف له: {successBanner.beneficiaryName}
              </h4>
              <p className="text-xs text-emerald-100 mt-0.5">
                تاريخ الصرف: {successBanner.date} | {successBanner.certificateNumber ? `رقم الشهادة: ${successBanner.certificateNumber} | ` : ''}
                تم خصم الأرصدة المحددة تلقائياً من مخزن مكتب صحة سفلاق.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => onSelectPrintRecord(successBanner)}
              id="print-success-banner-btn"
              className="px-4 py-2 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl text-xs md:text-sm font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
            >
              <Printer className="w-4 h-4 text-emerald-700" />
              <span>طباعة إيصال الصرف</span>
            </button>
            <button
              onClick={() => setSuccessBanner(null)}
              className="px-3 py-2 bg-emerald-800 hover:bg-emerald-900 rounded-xl text-xs text-white transition cursor-pointer"
            >
              إغلاق
            </button>
          </div>
        </div>
      )}

      {/* Main Dispense Form */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-7 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 mb-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-800 flex items-center justify-center border border-emerald-200">
              <FileCheck2 className="w-6 h-6 text-emerald-700" />
            </div>
            <div>
              <h3 className="font-bold text-lg md:text-xl text-slate-900">
                شاشة صرف المستندات والأرصدة المستقلة
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                كل مستند له اختيار مستقل ورصيد منفصل بدون أي إجبار على حزم مسبقة
              </p>
            </div>
          </div>

          {/* Mode Switcher */}
          <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl self-start sm:self-auto text-xs font-bold">
            <button
              type="button"
              onClick={() => setMultiSelectMode(false)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                !multiSelectMode ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              صرف بند واحد (سريع)
            </button>
            <button
              type="button"
              onClick={() => setMultiSelectMode(true)}
              className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                multiSelectMode ? 'bg-white text-emerald-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              صرف مجمع (أكثر من بند)
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6 text-xs md:text-sm">
          {/* SECTION 1: INDEPENDENT DOCUMENT SELECTION */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="block font-bold text-slate-900 text-sm">
                1. اختر المستند / الصنف المراد صرفه (رصيد مستقل لكل بند):
              </label>
              <span className="text-xs text-slate-500">
                {multiSelectMode ? 'يمكنك اختيار أكثر من بند وتحديد الكمية' : 'اضغط على الصنف لاختياره مباشرة'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {DOCUMENT_OPTIONS.map((opt) => {
                const stockItem = db.stocks[opt.id];
                const currentStock = stockItem?.currentStock ?? 0;
                const isSelected = (selectedItems[opt.id] || 0) > 0;
                const qty = selectedItems[opt.id] || 0;
                const IconComponent = opt.icon;

                return (
                  <div
                    key={opt.id}
                    onClick={() => {
                      if (!multiSelectMode) {
                        handleSingleSelect(opt.id);
                      }
                    }}
                    className={`relative p-3.5 rounded-xl border-2 transition flex flex-col justify-between cursor-pointer select-none ${
                      isSelected
                        ? `${opt.borderColor} ${opt.activeBg} shadow-xs`
                        : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/60'
                    }`}
                  >
                    {/* Header of card */}
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex items-center gap-2">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${isSelected ? 'bg-white shadow-xs' : 'bg-slate-100'}`}>
                          <IconComponent className="w-4 h-4 text-slate-700" />
                        </div>
                        <div>
                          <span className="font-black text-slate-900 block text-xs md:text-sm">
                            {opt.name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-semibold">
                            {opt.categoryName}
                          </span>
                        </div>
                      </div>

                      {/* Selection Indicator */}
                      {multiSelectMode ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleMultiToggle(opt.id);
                          }}
                          className="text-slate-400 hover:text-emerald-700 transition"
                        >
                          {isSelected ? (
                            <CheckSquare className="w-5 h-5 text-emerald-700" />
                          ) : (
                            <Square className="w-5 h-5 text-slate-300" />
                          )}
                        </button>
                      ) : (
                        <input
                          type="radio"
                          name="singleDocumentSelect"
                          checked={isSelected}
                          onChange={() => handleSingleSelect(opt.id)}
                          className="accent-emerald-700 mt-1"
                        />
                      )}
                    </div>

                    {/* Stock balance badge */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 mt-1">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] text-slate-500">الرصيد المتاح:</span>
                        <span className={`font-mono font-bold text-xs px-2 py-0.5 rounded-md ${
                          currentStock === 0 
                            ? 'bg-red-100 text-red-800' 
                            : currentStock <= (stockItem?.minThreshold ?? 20)
                            ? 'bg-amber-100 text-amber-900'
                            : 'bg-emerald-100 text-emerald-900'
                        }`}>
                          {currentStock} {opt.unit}
                        </span>
                      </div>

                      {/* Quantity Controls (When selected) */}
                      {isSelected && (
                        <div 
                          className="flex items-center gap-1 bg-white border border-slate-300 rounded-lg p-0.5 shadow-xs"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(opt.id, -1)}
                            className="p-1 text-slate-600 hover:text-red-700 hover:bg-slate-100 rounded transition"
                            title="تقليل الكمية"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <span className="font-mono font-black px-1.5 text-xs text-slate-900 min-w-[20px] text-center">
                            {qty}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleQuantityChange(opt.id, 1)}
                            className="p-1 text-slate-600 hover:text-emerald-700 hover:bg-slate-100 rounded transition"
                            title="زيادة الكمية"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* SECTION 2: REQUIRED DISPENSE DATA (ONLY WHAT THE USER SPECIFIED) */}
          <div className="p-4 md:p-6 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
            <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <User className="w-4 h-4 text-emerald-700" />
              <span>2. بيانات الصرف والتسليم:</span>
            </h4>

            {isHealthCardSelected && (
              <div className="p-3 bg-blue-50/90 border border-blue-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-blue-950 font-bold">
                <div className="flex items-center gap-2">
                  <Receipt className="w-4 h-4 text-blue-700 shrink-0" />
                  <span>
                    تم اختيار صرف <strong>بطاقة صحية</strong>: يرجى كتابة <strong>رقم إيصال التوريد / السداد</strong> وتحديد <strong>نوع واقعة الصرف</strong> أدناه.
                  </span>
                </div>
                <span className="bg-blue-200 text-blue-900 px-2.5 py-0.5 rounded-lg text-[11px] font-mono whitespace-nowrap">
                  إيصال رسمي مطلوب
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* FIELD 1: اسم المنصرف له (المستلم) */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <label className="block font-bold text-slate-900 mb-1">
                  اسم المنصرف له / المستلم *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="text"
                    required
                    id="beneficiary-name-input"
                    placeholder="مثال: أحمد محمود علي عبد الرحيم (اسم المواطن / المستلم)"
                    value={beneficiaryName}
                    onChange={(e) => setBeneficiaryName(e.target.value)}
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900 font-bold"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  اسم الشخص الذي استلم الوثيقة بمكتب الصحة.
                </span>
              </div>

              {/* FIELD 2: تاريخ الصرف */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <label className="block font-bold text-slate-900 mb-1">
                  تاريخ الصرف *
                </label>
                <div className="relative">
                  <Calendar className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="date"
                    required
                    id="dispense-date-input"
                    value={dispenseDate}
                    onChange={(e) => setDispenseDate(e.target.value)}
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900 font-mono font-bold"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  التاريخ المقيد بدفتر مكتب صحة سفلاق.
                </span>
              </div>

              {/* FIELD 3: نوع واقعة الصرف */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-900">
                    نوع واقعة الصرف *
                  </label>
                  <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    تصنيف المعاملة
                  </span>
                </div>
                <div className="relative">
                  <Tag className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <select
                    id="dispense-event-type-select"
                    value={dispenseEventType}
                    onChange={(e) => setDispenseEventType(e.target.value)}
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900 font-bold bg-white"
                  >
                    <option value="قيد ولادة - إصدار أول مرة">قيد ولادة - إصدار أول مرة (تطعيمات ورعاية)</option>
                    <option value="بطاقة صحية - بدل فاقد">بطاقة صحية - بدل فاقد</option>
                    <option value="بطاقة صحية - بدل تالف">بطاقة صحية - بدل تالف</option>
                    <option value="نقل قيد / استخراج بطاقة صحية">نقل قيد / استخراج بطاقة صحية</option>
                    <option value="قيد وفاة وتصريح دفن">قيد وفاة وتصريح دفن</option>
                    <option value="ساقط قيد معتمد">ساقط قيد معتمد (نموذج 26 أ.ح)</option>
                    <option value="صرف مستندات مخصص">صرف مستندات مخصص</option>
                  </select>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  طبيعة المعاملة المقيدة بالسجلات الرسمية لمكتب صحة سفلاق.
                </span>
              </div>

              {/* FIELD 4: رقم الإيصال (خاصة عند صرف بطاقة صحية) */}
              <div className={`p-3.5 rounded-xl border shadow-xs transition ${
                isHealthCardSelected
                  ? 'bg-blue-50/60 border-blue-400 ring-2 ring-blue-100'
                  : 'bg-white border-slate-200'
              }`}>
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-900">
                    رقم الإيصال {isHealthCardSelected ? '(إيصال البطاقة الصحية) *' : '(إن وجد)'}
                  </label>
                  {isHealthCardSelected ? (
                    <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                      مطلوب لصرف البطاقة الصحية
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      قسيمة توريد / سداد
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Receipt className={`w-4 h-4 absolute right-3 top-3 ${isHealthCardSelected ? 'text-blue-600' : 'text-slate-400'}`} />
                  <input
                    type="text"
                    id="receipt-number-input"
                    placeholder={isHealthCardSelected ? "مثال: قسيمة 56832 أو إيصال 33 ع.ح" : "رقم إيصال السداد أو القسيمة إن وجد"}
                    value={healthCardReceiptNumber}
                    onChange={(e) => setHealthCardReceiptNumber(e.target.value)}
                    className={`w-full pr-9 pl-3 py-2 rounded-xl border text-slate-900 font-mono font-bold ${
                      isHealthCardSelected
                        ? 'border-blue-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 bg-white'
                        : 'border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600'
                    }`}
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {isHealthCardSelected
                    ? 'رقم إيصال توريد البطاقة الصحية أو قسيمة السداد المعتمدة بمكتب الصحة.'
                    : 'رقم إيصال سداد الرسوم أو القسيمة المعتمدة إن وجدت.'}
                </span>
              </div>

              {/* FIELD 4.1: المبلغ الذي تم توريده / تحصيله للخزينة */}
              <div
                className={`p-3.5 rounded-xl border shadow-xs transition ${
                  isHealthCardSelected
                    ? 'bg-blue-50/70 border-blue-400 ring-2 ring-blue-100'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-900">
                    المبلغ الذي تم توريده للخزينة (ج.م) {isHealthCardSelected ? '(إلزامي للبطاقة الصحية)' : '(إن وجد)'}
                  </label>
                  {isHealthCardSelected ? (
                    <span className="text-[11px] font-bold text-blue-800 bg-blue-100 px-2 py-0.5 rounded border border-blue-200">
                      توريد بطاقة صحية
                    </span>
                  ) : (
                    <span className="text-[11px] text-slate-400">
                      رسوم توريد رسمية
                    </span>
                  )}
                </div>
                <div className="relative">
                  <DollarSign
                    className={`w-4 h-4 absolute right-3 top-3 ${
                      isHealthCardSelected ? 'text-blue-600' : 'text-slate-400'
                    }`}
                  />
                  <input
                    type="number"
                    step="any"
                    min="0"
                    placeholder={
                      isHealthCardSelected
                        ? 'مثال: 50 (المبلغ المورّد بقسيمة سداد البطاقة الصحية)'
                        : 'المبلغ بالجنيه المصري إن وجد'
                    }
                    value={paymentAmount}
                    onChange={(e) => setPaymentAmount(e.target.value)}
                    className={`w-full pr-9 pl-3 py-2 rounded-xl border font-mono font-bold text-slate-900 ${
                      isHealthCardSelected
                        ? 'border-blue-300 focus:border-blue-600 focus:ring-1 focus:ring-blue-600 bg-white'
                        : 'border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600'
                    }`}
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  {isHealthCardSelected
                    ? 'المبلغ المالي المورّد لحساب البطاقة الصحية، ويدرج مباشرة بالإحصائيات والبيان المالي والشهري.'
                    : 'المبلغ المحصل أو المورّد بموجب إيصال السداد (يظهر بالإحصائيات والبيان الشهري).'}
                </span>
              </div>

              {/* FIELD: النوع / الجنس (ذكر أو أنثى) */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <label className="block font-bold text-slate-900 mb-1">
                  النوع (الجنس) للحالة المقيدة *
                </label>
                <div className="grid grid-cols-2 gap-2 mt-1">
                  <button
                    type="button"
                    onClick={() => setGender('male')}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                      gender === 'male'
                        ? 'bg-blue-600 text-white border-blue-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-blue-300" />
                    <span>ذكر</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setGender('female')}
                    className={`py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition cursor-pointer border ${
                      gender === 'female'
                        ? 'bg-pink-600 text-white border-pink-700 shadow-xs'
                        : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <span className="w-2 h-2 rounded-full bg-pink-300" />
                    <span>أنثى</span>
                  </button>
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  لحصر وإحصاء المواليد والوفيات والبطاقات بدقة بالتقرير الشهري.
                </span>
              </div>

              {/* FIELD 5: رقم الشهادة (إن وجد) */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <div className="flex items-center justify-between mb-1">
                  <label className="block font-bold text-slate-900">
                    رقم الشهادة (إن وجد)
                  </label>
                  {isCertificateSelected && (
                    <span className="text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                      موصى بكتابته لشهادات الميلاد والوفاة
                    </span>
                  )}
                </div>
                <div className="relative">
                  <Hash className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
                  <input
                    type="text"
                    id="certificate-number-input"
                    placeholder="مثال: 0142089 (اختياري - يكتب إذا كان الصرف لشهادة مسلسلة)"
                    value={certificateNumber}
                    onChange={(e) => setCertificateNumber(e.target.value)}
                    className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900 font-mono"
                  />
                </div>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  يمكن تركه فارغاً إذا كان الصرف لبلاغات أو بطاقات أو استمارات.
                </span>
              </div>

              {/* FIELD 6: الموظف القائم بالصرف */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <label className="block font-bold text-slate-900 mb-1">
                  الموظف القائم بالصرف (كاتب الصحة)
                </label>
                <input
                  type="text"
                  value={dispensedBy}
                  onChange={(e) => setDispensedBy(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  اسم الموظف المسؤول عن قيد الصرف والتوقيع.
                </span>
              </div>

              {/* FIELD 7: خانة للملاحظات */}
              <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs">
                <label className="block font-bold text-slate-900 mb-1">
                  خانة للملاحظات
                </label>
                <input
                  type="text"
                  id="dispense-notes-input"
                  placeholder="أي ملاحظات خاصة بالصرف (جهة التحويل، القرابة...)"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900"
                />
                <span className="text-[11px] text-slate-500 mt-1 block">
                  ملاحظات إضافية لحركة الصرف إن وجدت.
                </span>
              </div>
            </div>
          </div>

          {/* SECTION 3: REAL-TIME SUMMARY OF ITEMS TO DEDUCT */}
          <div className="p-4 bg-emerald-50/60 rounded-2xl border border-emerald-200">
            <div className="flex items-center justify-between mb-2">
              <h5 className="font-bold text-emerald-950 flex items-center gap-2">
                <Layers className="w-4 h-4 text-emerald-700" />
                <span>ملخص البنود التي سيتم خصمها من الرصيد الآن:</span>
              </h5>
              <span className="text-xs font-bold text-emerald-900">
                إجمالي البنود: {itemsToDeduct.reduce((acc, curr) => acc + curr.quantity, 0)} مستند
              </span>
            </div>

            {itemsToDeduct.length === 0 ? (
              <p className="text-xs text-amber-800 font-bold bg-amber-50 p-2 rounded-lg border border-amber-200">
                ⚠️ لم يتم اختيار أي صنف للصرف حتى الآن! اضغط على الصنف المراد صرفه من القائمة أعلاه.
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-2.5">
                {itemsToDeduct.map((it) => {
                  const stock = db.stocks[it.stockCategory];
                  const current = stock?.currentStock ?? 0;
                  const willRemain = current - it.quantity;

                  return (
                    <div key={it.stockCategory} className="p-2.5 bg-white rounded-xl border border-emerald-200 flex justify-between items-center shadow-xs">
                      <div>
                        <span className="font-bold text-slate-900 block text-xs">{stock?.name}</span>
                        <span className="text-[10px] text-slate-500">الرصيد الحالي: {current}</span>
                      </div>
                      <div className="text-left font-mono">
                        <span className="text-red-600 font-black text-sm">-{it.quantity}</span>
                        <div className="text-[10px] text-emerald-800 font-bold">يتبقى: {willRemain}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* SUBMIT BUTTON */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="submit"
              id="submit-dispense-btn"
              disabled={itemsToDeduct.length === 0}
              className={`px-8 py-3 rounded-xl font-black text-sm shadow-md transition flex items-center gap-2 active:scale-95 ${
                itemsToDeduct.length > 0
                  ? 'bg-emerald-700 hover:bg-emerald-800 text-white cursor-pointer'
                  : 'bg-slate-300 text-slate-500 cursor-not-allowed'
              }`}
            >
              <CheckCircle2 className="w-5 h-5" />
              <span>تأكيد عملية الصرف وتحديث الرصيد فورياً</span>
            </button>
          </div>
        </form>
      </div>

      {/* DISPENSE HISTORY LEDGER (سجل المعاملات والمنصرف) */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-base text-slate-900">
              سجل الوثائق والمستندات المنصرفة بمكتب صحة سفلاق
            </h3>
            <p className="text-xs text-slate-500">
              إجمالي المعاملات المسجلة: {activeRecords.length} معاملة
            </p>
          </div>

          {/* Search bar */}
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
            <input
              type="text"
              placeholder="بحث باسم المنصرف له أو رقم الشهادة أو الملاحظات..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-xs focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900"
            />
          </div>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="py-12 text-center text-slate-400 text-sm">
            لا توجد سجلات صرف تطابق بحثك.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs md:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
                  <th className="py-3 px-3">التاريخ والوقت</th>
                  <th className="py-3 px-3">اسم المنصرف له / المستلم</th>
                  <th className="py-3 px-3">نوع واقعة الصرف</th>
                  <th className="py-3 px-3">المستندات والأصناف المصروفة</th>
                  <th className="py-3 px-3">رقم الشهادة</th>
                  <th className="py-3 px-3">رقم الإيصال</th>
                  <th className="py-3 px-3 font-mono">المبلغ المورّد</th>
                  <th className="py-3 px-3">الملاحظات</th>
                  <th className="py-3 px-3">الموظف القائم بالصرف</th>
                  <th className="py-3 px-3 text-center">الإجراءات والطباعة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50/70 transition">
                    <td className="py-3 px-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {r.date} <span className="text-[10px] text-slate-400">{r.time}</span>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                      {r.beneficiaryName}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {(() => {
                        const typeInfo = getDispenseTypeDisplay(r);
                        return (
                          <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-md text-xs font-bold border ${typeInfo.badgeClass}`}>
                            <span>{r.dispenseEventType || typeInfo.label}</span>
                          </span>
                        );
                      })()}
                    </td>
                    <td className="py-3 px-3">
                      <div className="flex flex-wrap gap-1">
                        {r.itemsDeducted && r.itemsDeducted.length > 0 ? (
                          r.itemsDeducted.map((it, idx) => (
                            <span 
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-[11px] font-semibold whitespace-nowrap"
                            >
                              {db.stocks[it.stockCategory]?.name || it.stockCategory}
                              <span className="font-mono font-bold text-emerald-950">({it.quantity})</span>
                            </span>
                          ))
                        ) : (
                          <span className="text-slate-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-emerald-900 whitespace-nowrap">
                      {r.certificateNumber || '—'}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-blue-900 whitespace-nowrap">
                      {r.healthCardReceiptNumber ? (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold">
                          {r.healthCardReceiptNumber}
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-emerald-800 whitespace-nowrap">
                      {r.paymentAmount !== undefined && r.paymentAmount !== null ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold font-mono">
                          {r.paymentAmount} ج.م
                        </span>
                      ) : (
                        <span className="text-slate-400 font-normal">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-slate-600 text-xs max-w-xs truncate" title={r.notes || ''}>
                      {r.notes || '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-600 text-xs whitespace-nowrap">
                      {r.dispensedBy}
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <div className="inline-flex items-center gap-1.5">
                        <button
                          onClick={() => onSelectPrintRecord(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold transition cursor-pointer"
                          title="طباعة إيصال الصرف الرسمي"
                        >
                          <Printer className="w-3.5 h-3.5" />
                          <span>طباعة</span>
                        </button>

                        <button
                          onClick={() => setEditingRecord(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition cursor-pointer"
                          title="تعديل حركة الصرف"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                          <span>تعديل</span>
                        </button>

                        <button
                          onClick={() => handleDeleteRecord(r)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold transition cursor-pointer"
                          title="حذف حركة الصرف وإرجاع الرصيد"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>حذف</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* EDIT DISPENSE MODAL */}
      <EditDispenseModal
        key={editingRecord?.id || 'none'}
        record={editingRecord}
        stocks={db.stocks}
        onClose={() => setEditingRecord(null)}
        onSave={handleSaveEditRecord}
      />
    </div>
  );
};
