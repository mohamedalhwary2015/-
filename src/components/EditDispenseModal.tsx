import React, { useState, useEffect } from 'react';
import { DispenseRecord, StockCategory, StockItem } from '../types';
import { X, CheckCircle2, Plus, Trash2, Edit3, DollarSign, User } from 'lucide-react';

interface EditDispenseModalProps {
  record: DispenseRecord | null;
  stocks: Record<StockCategory, StockItem>;
  onClose: () => void;
  onSave: (id: string, updates: Partial<DispenseRecord>) => void;
}

export const EditDispenseModal: React.FC<EditDispenseModalProps> = ({
  record,
  stocks,
  onClose,
  onSave,
}) => {
  if (!record) return null;

  const [beneficiaryName, setBeneficiaryName] = useState(record.beneficiaryName || '');
  const [date, setDate] = useState(record.date || '');
  const [time, setTime] = useState(record.time || '');
  const [gender, setGender] = useState<'male' | 'female'>(record.gender === 'female' ? 'female' : 'male');
  const [dispenseType, setDispenseType] = useState(record.dispenseType || 'birth_male');
  const [dispenseEventType, setDispenseEventType] = useState(record.dispenseEventType || '');
  const [certificateNumber, setCertificateNumber] = useState(record.certificateNumber || '');
  const [healthCardReceiptNumber, setHealthCardReceiptNumber] = useState(record.healthCardReceiptNumber || '');
  const [paymentAmount, setPaymentAmount] = useState<string>(
    record.paymentAmount !== undefined && record.paymentAmount !== null ? String(record.paymentAmount) : ''
  );
  const [fatherName, setFatherName] = useState(record.fatherName || '');
  const [motherName, setMotherName] = useState(record.motherName || '');
  const [reporterName, setReporterName] = useState(record.reporterName || '');
  const [reporterRelation, setReporterRelation] = useState(record.reporterRelation || '');
  const [dispensedBy, setDispensedBy] = useState(record.dispensedBy || '');
  const [notes, setNotes] = useState(record.notes || '');

  // Deducted items list
  const [itemsDeducted, setItemsDeducted] = useState<Array<{ stockCategory: StockCategory; quantity: number }>>(
    record.itemsDeducted && record.itemsDeducted.length > 0
      ? [...record.itemsDeducted]
      : []
  );

  const [newItemCategory, setNewItemCategory] = useState<StockCategory>('birth_certificates');
  const [newItemQuantity, setNewItemQuantity] = useState<number>(1);

  const [isSubmitting, setIsSubmitting] = useState(false);

  // Sync state whenever record prop updates
  useEffect(() => {
    if (!record) return;
    setIsSubmitting(false);
    setBeneficiaryName(record.beneficiaryName || '');
    setDate(record.date || '');
    setTime(record.time || '');
    setGender(record.gender === 'female' ? 'female' : 'male');
    setDispenseType(record.dispenseType || 'birth_male');
    setDispenseEventType(record.dispenseEventType || '');
    setCertificateNumber(record.certificateNumber || '');
    setHealthCardReceiptNumber(record.healthCardReceiptNumber || '');
    setPaymentAmount(
      record.paymentAmount !== undefined && record.paymentAmount !== null ? String(record.paymentAmount) : ''
    );
    setFatherName(record.fatherName || '');
    setMotherName(record.motherName || '');
    setReporterName(record.reporterName || '');
    setReporterRelation(record.reporterRelation || '');
    setDispensedBy(record.dispensedBy || '');
    setNotes(record.notes || '');
    setItemsDeducted(
      record.itemsDeducted && record.itemsDeducted.length > 0 ? [...record.itemsDeducted] : []
    );
  }, [record]);

  const handleAddItem = () => {
    const existingIndex = itemsDeducted.findIndex((i) => i.stockCategory === newItemCategory);
    if (existingIndex > -1) {
      const updated = [...itemsDeducted];
      updated[existingIndex].quantity += newItemQuantity;
      setItemsDeducted(updated);
    } else {
      setItemsDeducted([...itemsDeducted, { stockCategory: newItemCategory, quantity: newItemQuantity }]);
    }
  };

  const handleRemoveItem = (index: number) => {
    setItemsDeducted(itemsDeducted.filter((_, idx) => idx !== index));
  };

  const handleUpdateItemQuantity = (index: number, qty: number) => {
    const updated = [...itemsDeducted];
    updated[index].quantity = Math.max(1, qty);
    setItemsDeducted(updated);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!beneficiaryName.trim()) {
      alert('يرجى إدخال اسم المستفيد أو المنصرف له.');
      return;
    }
    if (itemsDeducted.length === 0) {
      alert('يجب أن تحتوي حركة الصرف على صنف واحد على الأقل.');
      return;
    }

    if (isSubmitting) return;
    setIsSubmitting(true);

    const numericPayment =
      paymentAmount.trim() !== '' && !isNaN(Number(paymentAmount))
        ? Number(paymentAmount)
        : undefined;

    try {
      onSave(record.id, {
        beneficiaryName: beneficiaryName.trim(),
        date,
        time,
        gender,
        dispenseType,
        dispenseEventType: dispenseEventType.trim() || undefined,
        certificateNumber: certificateNumber.trim() || undefined,
        healthCardReceiptNumber: healthCardReceiptNumber.trim() || undefined,
        paymentAmount: numericPayment,
        fatherName: fatherName.trim() || undefined,
        motherName: motherName.trim() || undefined,
        reporterName: reporterName.trim() || undefined,
        reporterRelation: reporterRelation.trim() || undefined,
        dispensedBy: dispensedBy.trim(),
        notes: notes.trim() || undefined,
        itemsDeducted,
      });
      onClose();
    } catch (err: any) {
      alert(`حدث خطأ أثناء حفظ التعديل: ${err.message || err}`);
      setIsSubmitting(false);
    }
  };

  const stockList = Object.values(stocks) as StockItem[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs no-print overflow-y-auto">
      <div className="w-full max-w-2xl bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 my-8 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base md:text-lg text-slate-900">
                تعديل حركة الصرف
              </h3>
              <p className="text-xs text-slate-500">
                تحديث بيانات المستفيد والمستندات المسحوبة مع إعادة تسوية الأرصدة تلقائياً
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 pt-4 text-xs md:text-sm">
          {/* Row 1: Beneficiary Name & Dispense Type */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                اسم المستفيد / المنصرف له *
              </label>
              <input
                type="text"
                required
                value={beneficiaryName}
                onChange={(e) => setBeneficiaryName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                نوع واقعة الصرف *
              </label>
              <select
                value={dispenseType}
                onChange={(e) => setDispenseType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              >
                <option value="birth_male">قيد ولادة - مولود ذكر</option>
                <option value="birth_female">قيد ولادة - مولود أنثى</option>
                <option value="health_card_male">بطاقة صحية ذكور</option>
                <option value="health_card_female">بطاقة صحية إناث</option>
                <option value="death">قيد وفاة - تصريح دفن</option>
                <option value="birth_certificate">شهادة ميلاد</option>
                <option value="birth_notification">بلاغ ميلاد</option>
                <option value="death_certificate">شهادة وفاة</option>
                <option value="death_notification">بلاغ وفاة</option>
                <option value="late_reg_under_year">ساقط قيد أقل من عام</option>
                <option value="late_reg_over_year">ساقط قيد أكبر من عام</option>
                <option value="multiple">صرف مجمع / متعدد</option>
                <option value="custom">صرف مستندات مخصص</option>
              </select>
            </div>
          </div>

          {/* Event description / receipt details */}
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
            <label className="block font-bold text-slate-700 mb-1 text-xs">
              وصف واقعة الصرف التفصيلي (مثال: قيد ولادة أول مرة / بدل فاقد / بدل تالف...)
            </label>
            <input
              type="text"
              value={dispenseEventType}
              onChange={(e) => setDispenseEventType(e.target.value)}
              placeholder="مثال: قيد ولادة - إصدار أول مرة أو بطاقة صحية بدل فاقد"
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white font-bold"
            />
          </div>

          {/* Row 2: Date & Time */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                تاريخ الصرف *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                وقت الصرف
              </label>
              <input
                type="time"
                value={time}
                onChange={(e) => setTime(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Row 3: Gender & Payment Amount */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                النوع / الجنس للحالة *
              </label>
              <div className="grid grid-cols-2 gap-2">
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
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                المبلغ الذي تم توريده (ج.م)
              </label>
              <div className="relative">
                <DollarSign className="w-4 h-4 text-emerald-600 absolute right-3 top-3" />
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-emerald-800 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                  placeholder="مثال: 50"
                />
              </div>
            </div>
          </div>

          {/* Row 4: Certificate Number & Health Card Receipt */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                رقم الشهادة الورقية (إن وجد)
              </label>
              <input
                type="text"
                value={certificateNumber}
                onChange={(e) => setCertificateNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                placeholder="0142089"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                رقم إيصال التوريد / البطاقة الصحية
              </label>
              <input
                type="text"
                value={healthCardReceiptNumber}
                onChange={(e) => setHealthCardReceiptNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                placeholder="084912 أو قسيمة 33 ع.ح"
              />
            </div>
          </div>

          {/* Row 5: Father Name & Mother Name */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                اسم الأب (إن وجد)
              </label>
              <input
                type="text"
                value={fatherName}
                onChange={(e) => setFatherName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                placeholder="اسم والد الحالة..."
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                اسم الأم (إن وجد)
              </label>
              <input
                type="text"
                value={motherName}
                onChange={(e) => setMotherName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                placeholder="اسم والدة الحالة..."
              />
            </div>
          </div>

          {/* Row 4: Reporter Name & Relation */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                اسم المبلّغ / المستلم
              </label>
              <input
                type="text"
                value={reporterName}
                onChange={(e) => setReporterName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                صلة القرابة
              </label>
              <input
                type="text"
                value={reporterRelation}
                onChange={(e) => setReporterRelation(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                placeholder="الأب / العم / الأخ..."
              />
            </div>
          </div>

          {/* Row 5: Dispensed By */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              الموظف القائم بالصرف (كاتب الصحة)
            </label>
            <input
              type="text"
              value={dispensedBy}
              onChange={(e) => setDispensedBy(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
            />
          </div>

          {/* Row 6: Deducted Items List */}
          <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-bold text-slate-900 text-xs">
                الأصناف والكميات المخصومة من رصيد المخزن *
              </span>
              <span className="text-[11px] text-slate-500">
                أي تعديل هنا سيُعدل رصيد المخزن تلقائياً
              </span>
            </div>

            <div className="space-y-2">
              {itemsDeducted.map((item, idx) => (
                <div
                  key={idx}
                  className="flex items-center justify-between bg-white px-3 py-2 rounded-xl border border-slate-200"
                >
                  <span className="font-bold text-slate-800 text-xs">
                    {stocks[item.stockCategory]?.name || item.stockCategory}
                  </span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-slate-500 font-medium">الكمية:</span>
                    <input
                      type="number"
                      min="1"
                      value={item.quantity}
                      onChange={(e) => handleUpdateItemQuantity(idx, parseInt(e.target.value) || 1)}
                      className="w-16 px-2 py-1 rounded-lg border border-slate-300 text-center font-bold font-mono text-xs"
                    />
                    <button
                      type="button"
                      onClick={() => handleRemoveItem(idx)}
                      className="p-1 rounded-lg text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                      title="إزالة الصنف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            {/* Add item row */}
            <div className="flex items-center gap-2 pt-2">
              <select
                value={newItemCategory}
                onChange={(e) => setNewItemCategory(e.target.value as StockCategory)}
                className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-xs font-bold text-slate-800"
              >
                {stockList.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name} (الرصيد المتاح: {st.currentStock})
                  </option>
                ))}
              </select>

              <input
                type="number"
                min="1"
                value={newItemQuantity}
                onChange={(e) => setNewItemQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 px-2 py-1.5 rounded-xl border border-slate-300 text-center font-bold font-mono text-xs"
              />

              <button
                type="button"
                onClick={handleAddItem}
                className="px-3 py-1.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs font-bold transition flex items-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>إضافة صنف</span>
              </button>
            </div>
          </div>

          {/* Row 7: Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              الملاحظات
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              placeholder="أي ملاحظات تخص الصرف أو التطعيمات أو أرقام المستندات..."
            />
          </div>

          {/* Modal Actions */}
          <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 font-bold hover:bg-slate-100 transition cursor-pointer"
            >
              إلغاء
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-6 py-2 rounded-xl text-white font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer ${
                isSubmitting ? 'bg-emerald-400 cursor-not-allowed opacity-80' : 'bg-emerald-700 hover:bg-emerald-800'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'جارٍ حفظ التعديلات...' : 'حفظ التعديلات وتحديث الرصيد'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
