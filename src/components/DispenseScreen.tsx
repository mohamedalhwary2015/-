import React, { useState } from 'react';
import {
  FileCheck2,
  Plus,
  Search,
  Trash2,
  Edit2,
  Printer,
  AlertCircle,
  Coins,
  CreditCard,
  UserCheck
} from 'lucide-react';
import {
  DatabaseSchema,
  StockCategory,
  STOCK_CATEGORIES,
  CATEGORY_LABELS,
  TransactionType,
  TRANSACTION_TYPE_LABELS,
  DispenseRecord
} from '../types';
import { addDispense, updateDispense, deleteDispense } from '../storage/db';
import { validateDispenseAvailability } from '../services/stockService';

interface DispenseScreenProps {
  db: DatabaseSchema;
  onPrintReceipt?: (record: DispenseRecord) => void;
  filterMode?: 'all' | 'health_cards' | 'documents' | 'birth_certificates' | 'death_certificates' | 'notifications';
}

export const DispenseScreen: React.FC<DispenseScreenProps> = ({
  db,
  onPrintReceipt,
  filterMode = 'all'
}) => {
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<DispenseRecord | null>(null);
  const [subFilter, setSubFilter] = useState<'all' | 'male' | 'female'>('all');

  // Form Fields
  const [dispenseDate, setDispenseDate] = useState(new Date().toISOString().split('T')[0]);
  const [citizenName, setCitizenName] = useState('');
  const [nationalId, setNationalId] = useState('');
  const [childOrDeceasedName, setChildOrDeceasedName] = useState('');
  const [transactionType, setTransactionType] = useState<TransactionType>(
    filterMode === 'health_cards' ? 'health_card_male' : filterMode === 'death_certificates' ? 'death' : filterMode === 'notifications' ? 'birth_notification' : 'birth'
  );
  const [gender, setGender] = useState<'ذكر' | 'أنثى' | 'غير محدد'>(
    filterMode === 'health_cards' ? 'ذكر' : 'ذكر'
  );
  const [category, setCategory] = useState<StockCategory>(
    filterMode === 'health_cards' ? 'health_cards_male' : filterMode === 'death_certificates' ? 'death_certificates' : filterMode === 'notifications' ? 'birth_notifications' : 'birth_certificates'
  );
  const [quantity, setQuantity] = useState<number>(1);
  const [collectedAmount, setCollectedAmount] = useState<number | ''>(
    filterMode === 'health_cards'
      ? (db.officeSettings?.healthCardMaleFee ?? 50)
      : (filterMode === 'notifications' ? 0 : (db.officeSettings?.birthCertFee ?? 0))
  );
  const [receiptNumber, setReceiptNumber] = useState('');
  const [serialNumber, setSerialNumber] = useState('');
  const [dispensedBy, setDispensedBy] = useState(db.officeSettings?.currentEmployee || 'غير محدد');
  const [notes, setNotes] = useState('');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  const handleTransactionTypeChange = (t: TransactionType) => {
    setTransactionType(t);
    if (t === 'health_card_male') {
      setCategory('health_cards_male');
      setGender('ذكر');
      setCollectedAmount(db.officeSettings?.healthCardMaleFee ?? 50);
    } else if (t === 'health_card_female') {
      setCategory('health_cards_female');
      setGender('أنثى');
      setCollectedAmount(db.officeSettings?.healthCardFemaleFee ?? 50);
    } else if (t === 'birth') {
      setCategory('birth_certificates');
      setCollectedAmount(db.officeSettings?.birthCertFee ?? 0);
    } else if (t === 'death') {
      setCategory('death_certificates');
      setCollectedAmount(db.officeSettings?.deathCertFee ?? 0);
    } else if (t === 'birth_notification') {
      setCategory('birth_notifications');
      setCollectedAmount(0);
    } else if (t === 'death_notification') {
      setCategory('death_notifications');
      setCollectedAmount(0);
    }
  };

  const openAddModal = () => {
    setEditingRecord(null);
    setDispenseDate(new Date().toISOString().split('T')[0]);
    setCitizenName('');
    setNationalId('');
    setChildOrDeceasedName('');
    if (filterMode === 'health_cards') {
      setTransactionType('health_card_male');
      setCategory('health_cards_male');
      setGender('ذكر');
      setCollectedAmount(db.officeSettings?.healthCardMaleFee ?? 50);
    } else if (filterMode === 'birth_certificates') {
      setTransactionType('birth');
      setCategory('birth_certificates');
      setGender('ذكر');
      setCollectedAmount(db.officeSettings?.birthCertFee ?? 0);
    } else if (filterMode === 'death_certificates') {
      setTransactionType('death');
      setCategory('death_certificates');
      setGender('غير محدد');
      setCollectedAmount(db.officeSettings?.deathCertFee ?? 0);
    } else if (filterMode === 'notifications') {
      setTransactionType('birth_notification');
      setCategory('birth_notifications');
      setGender('غير محدد');
      setCollectedAmount(0);
    } else {
      setTransactionType('birth');
      setCategory('birth_certificates');
      setGender('ذكر');
      setCollectedAmount(db.officeSettings?.birthCertFee ?? 0);
    }
    setQuantity(1);
    setReceiptNumber('');
    setSerialNumber('');
    setDispensedBy(db.officeSettings?.currentEmployee || 'غير محدد');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (rec: DispenseRecord) => {
    setEditingRecord(rec);
    setDispenseDate(rec.date);
    setCitizenName(rec.citizenName);
    setNationalId(rec.nationalId || '');
    setChildOrDeceasedName(rec.childOrDeceasedName || '');
    setTransactionType(rec.transactionType);
    setCategory(rec.category);
    setGender(rec.gender || 'غير محدد');
    setQuantity(rec.quantity);
    setCollectedAmount(typeof rec.collectedAmount === 'number' ? rec.collectedAmount : '');
    setReceiptNumber(rec.receiptNumber || '');
    setSerialNumber(rec.serialNumber || '');
    setDispensedBy(rec.dispensedBy);
    setNotes(rec.notes || '');
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!citizenName.trim()) {
      alert('يرجى كتابة اسم المواطن / ولي الأمر');
      return;
    }

    // Availability validation check
    const check = validateDispenseAvailability(db, category, quantity);
    if (!check.available && !editingRecord) {
      if (!confirm(`تحذير: الرصيد الفعلي الحالي لهذا الصنف هو (${check.currentStock}) وهو أقل من الكمية المطلوبة (${quantity}).\nهل تريد المتابعة بالصرف بالرغم من ذلك؟`)) {
        return;
      }
    }

    if (editingRecord) {
      updateDispense(editingRecord.id, {
        date: dispenseDate,
        citizenName: citizenName.trim(),
        nationalId: nationalId.trim(),
        childOrDeceasedName: childOrDeceasedName.trim(),
        transactionType,
        gender,
        category,
        quantity: Number(quantity),
        collectedAmount: Number(collectedAmount),
        receiptNumber: receiptNumber.trim(),
        serialNumber: serialNumber.trim(),
        dispensedBy: dispensedBy.trim() || 'غير محدد',
        notes: notes.trim()
      });
    } else {
      addDispense({
        date: dispenseDate,
        citizenName: citizenName.trim(),
        nationalId: nationalId.trim(),
        childOrDeceasedName: childOrDeceasedName.trim(),
        transactionType,
        gender,
        category,
        quantity: Number(quantity),
        collectedAmount: Number(collectedAmount),
        receiptNumber: receiptNumber.trim(),
        serialNumber: serialNumber.trim(),
        dispensedBy: dispensedBy.trim() || 'غير محدد',
        notes: notes.trim()
      });
    }

    setShowModal(false);
  };

  const handleDelete = (rec: DispenseRecord) => {
    if (confirm(`هل أنت متأكد من حذف صرفية المواطن "${rec.citizenName}"؟\nسيتم استرجاع عدد (${rec.quantity}) إلى رصيد ${CATEGORY_LABELS[rec.category]}.`)) {
      deleteDispense(rec.id, db.officeSettings?.currentEmployee || 'غير محدد');
    }
  };

  const filteredDispenses = (db.dispenses || []).filter(d => {
    if (d.isDeleted) return false;

    // Filter mode checks
    if (filterMode === 'health_cards') {
      if (d.category !== 'health_cards_male' && d.category !== 'health_cards_female') return false;
      if (subFilter === 'male' && d.category !== 'health_cards_male') return false;
      if (subFilter === 'female' && d.category !== 'health_cards_female') return false;
    } else if (filterMode === 'birth_certificates') {
      if (d.category !== 'birth_certificates') return false;
    } else if (filterMode === 'death_certificates') {
      if (d.category !== 'death_certificates') return false;
    } else if (filterMode === 'notifications') {
      if (d.category !== 'birth_notifications' && d.category !== 'death_notifications') return false;
    } else if (filterMode === 'documents') {
      if (d.category === 'health_cards_male' || d.category === 'health_cards_female') return false;
    }

    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      d.citizenName.toLowerCase().includes(q) ||
      (d.nationalId && d.nationalId.includes(q)) ||
      (d.childOrDeceasedName && d.childOrDeceasedName.toLowerCase().includes(q)) ||
      (d.serialNumber && d.serialNumber.toLowerCase().includes(q)) ||
      (d.receiptNumber && d.receiptNumber.toLowerCase().includes(q)) ||
      (CATEGORY_LABELS[d.category] && CATEGORY_LABELS[d.category].toLowerCase().includes(q))
    );
  });

  const screenTitle = filterMode === 'health_cards'
    ? 'صرف وإصدار البطاقات الصحية (ذكور / إناث)'
    : filterMode === 'birth_certificates'
    ? 'صرف شهادات وقيد الميلاد للمواطنين'
    : filterMode === 'death_certificates'
    ? 'صرف شهادات وقيد الوفاة'
    : filterMode === 'notifications'
    ? 'صرف بلاغات وإخطارات الولادة والوفاة'
    : filterMode === 'documents'
    ? 'صرف الشهادات والمستندات الرسمية (مواليد / وفيات)'
    : 'سجل جميع المنصرف من المستندات والوثائق';

  const screenSubtitle = filterMode === 'health_cards'
    ? 'تسجيل صرف البطاقات الصحية للمواليد وبدل الفاقد مع تسجيل رسوم التحصيل المقررة وقسائم السداد'
    : filterMode === 'birth_certificates'
    ? 'تسجيل صرف وتوثيق شهادات الميلاد وقيد رسوم الاستخراج وأرقام القسائم والإيصالات'
    : filterMode === 'death_certificates'
    ? 'تسجيل صرف شهادات الوفاة وبيانات المتوفى وتوثيق الرسوم والمتحصلات الرسمية'
    : filterMode === 'notifications'
    ? 'توثيق صرف دفاتر بلاغات الولادة وإخطارات الوفاة للمستشفيات والوحدات الصحية'
    : filterMode === 'documents'
    ? 'تسجيل صرف شهادات الميلاد والوفاة وبلاغات القيد للمواطنين وأولياء الأمور'
    : 'عرض وبحث شامل لكافة حركات الصرف لجميع الأصناف والشهادات والمتحصلات المالية';

  const addButtonText = filterMode === 'health_cards'
    ? 'صرف بطاقة صحية جديدة'
    : filterMode === 'birth_certificates'
    ? 'صرف شهادة ميلاد'
    : filterMode === 'death_certificates'
    ? 'صرف شهادة وفاة'
    : filterMode === 'notifications'
    ? 'صرف دفتر إخطار / بلاغ'
    : filterMode === 'documents'
    ? 'صرف شهادة / مستند جديد'
    : 'صرف مستند جديد';

  return (
    <div className="space-y-6" id="dispense-view">
      {/* Top Action & Search Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            {screenTitle}
          </h2>
          <p className="text-xs text-slate-500">
            {screenSubtitle}
          </p>
        </div>

        <button
          id="btn-add-dispense"
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>{addButtonText}</span>
        </button>
      </div>

      {filterMode === 'health_cards' && (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setSubFilter('all')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              subFilter === 'all'
                ? 'bg-teal-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            كافة البطاقات الصحية
          </button>
          <button
            onClick={() => setSubFilter('male')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              subFilter === 'male'
                ? 'bg-blue-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            بطاقات ذكور فقط
          </button>
          <button
            onClick={() => setSubFilter('female')}
            className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              subFilter === 'female'
                ? 'bg-pink-600 text-white shadow-xs'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            بطاقات إناث فقط
          </button>
        </div>
      )}

      {/* List of Dispensed Documents */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="relative w-full sm:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث بالاسم، الرقم القومي، المسلسل..."
              className="w-full pr-9 pl-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <span className="text-xs font-semibold text-slate-500">
            إجمالي السجلات: {filteredDispenses.length}
          </span>
        </div>

        {filteredDispenses.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs sm:text-sm">
            لا توجد مستندات منصرفة مسجلة حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 font-semibold bg-slate-50">
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">اسم المواطن / ولي الأمر</th>
                  <th className="py-2.5 px-3">المولود / المتوفى</th>
                  <th className="py-2.5 px-3">المستند المصروف</th>
                  <th className="py-2.5 px-3">النوع</th>
                  <th className="py-2.5 px-3">الكمية</th>
                  <th className="py-2.5 px-3">المبلغ المحصل</th>
                  <th className="py-2.5 px-3">رقم الإيصال/المسلسل</th>
                  <th className="py-2.5 px-3">الموظف</th>
                  <th className="py-2.5 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDispenses.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 text-slate-600">{d.date}</td>
                    <td className="py-2.5 px-3 font-semibold text-slate-900">
                      <div>{d.citizenName}</div>
                      {d.nationalId && (
                        <span className="text-[11px] text-slate-400 font-mono block">
                          {d.nationalId}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      {d.childOrDeceasedName || '-'}
                    </td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">
                      {CATEGORY_LABELS[d.category]}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-semibold ${
                        d.gender === 'ذكر' ? 'bg-blue-50 text-blue-700' : d.gender === 'أنثى' ? 'bg-pink-50 text-pink-700' : 'bg-slate-100 text-slate-600'
                      }`}>
                        {d.gender || '-'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 font-bold text-rose-600">
                      {d.quantity}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-amber-700">
                      {d.collectedAmount} ج.م
                    </td>
                    <td className="py-2.5 px-3 text-xs text-slate-500 font-mono">
                      {d.receiptNumber || d.serialNumber ? (
                        <span>
                          {d.receiptNumber ? `إيصال: ${d.receiptNumber}` : ''}
                          {d.receiptNumber && d.serialNumber ? ' | ' : ''}
                          {d.serialNumber ? `مسلسل: ${d.serialNumber}` : ''}
                        </span>
                      ) : '-'}
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{d.dispensedBy}</td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        {onPrintReceipt && (
                          <button
                            onClick={() => onPrintReceipt(d)}
                            className="p-1 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors"
                            title="طباعة إيصال الصرف"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        )}
                        <button
                          onClick={() => openEditModal(d)}
                          className="p-1 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors"
                          title="تعديل السجل"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(d)}
                          className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title="حذف واسترجاع للرصيد"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingRecord ? 'تعديل صرف مستند' : 'تسجيل صرف مستند لمواطن'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              سيتم خصم الكمية المصروفة مباشرة وبشكل آمن من الرصيد الفعلي الحالي للصنف.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Type and Category */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">نوع المعاملة *</label>
                  <select
                    value={transactionType}
                    onChange={(e) => handleTransactionTypeChange(e.target.value as TransactionType)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    {Object.entries(TRANSACTION_TYPE_LABELS).map(([k, v]) => (
                      <option key={k} value={k}>{v}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الصنف المستهلك من الرصيد *</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as StockCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-semibold text-teal-800"
                  >
                    {STOCK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Citizen Details */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المواطن / ولي الأمر *</label>
                  <input
                    type="text"
                    required
                    value={citizenName}
                    onChange={(e) => setCitizenName(e.target.value)}
                    placeholder="الاسم ثلاثي أو رباعي"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم القومي لولي الأمر / المبلغ</label>
                  <input
                    type="text"
                    maxLength={14}
                    value={nationalId}
                    onChange={(e) => setNationalId(e.target.value)}
                    placeholder="14 رقماً"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Child / Deceased & Gender */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اسم المولود / المتوفى</label>
                  <input
                    type="text"
                    value={childOrDeceasedName}
                    onChange={(e) => setChildOrDeceasedName(e.target.value)}
                    placeholder="اسم المولود أو المتوفى إن وجد"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">النوع (الجنس) *</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="ذكر">ذكر</option>
                    <option value="أنثى">أنثى</option>
                    <option value="غير محدد">غير محدد</option>
                  </select>
                </div>
              </div>

              {/* Quantity & Collected Amount (Rule 28) */}
              <div className="grid grid-cols-3 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الكمية المصروفة *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm font-bold focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    المبلغ المحصل / المورد (ج.م) *
                  </label>
                  <input
                    type="number"
                    min="0"
                    placeholder="أدخل المبلغ المحصل..."
                    value={collectedAmount}
                    onChange={(e) => setCollectedAmount(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm font-black text-amber-700 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ المعاملة *</label>
                  <input
                    type="date"
                    required
                    value={dispenseDate}
                    onChange={(e) => setDispenseDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Receipt & Serial Number */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الإيصال (33 ع.ح / السداد)</label>
                  <input
                    type="text"
                    value={receiptNumber}
                    onChange={(e) => setReceiptNumber(e.target.value)}
                    placeholder="رقم القسيمة إن وجد"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم المسلسل للوثيقة / الشهادة</label>
                  <input
                    type="text"
                    value={serialNumber}
                    onChange={(e) => setSerialNumber(e.target.value)}
                    placeholder="رقم مسلسل الشهادة أو البطاقة"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              {/* Employee and notes */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الموظف القائم بالصرف</label>
                  <input
                    type="text"
                    value={dispensedBy}
                    onChange={(e) => setDispensedBy(e.target.value)}
                    placeholder="اسم الموظف أو غير محدد"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">ملاحظات إضافية</label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="أي ملاحظات..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  id="btn-submit-dispense"
                  className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
                >
                  {editingRecord ? 'حفظ التعديل' : 'تأكيد الصرف وخصم الرصيد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
