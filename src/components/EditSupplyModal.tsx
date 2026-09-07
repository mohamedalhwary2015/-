import React, { useState } from 'react';
import { SupplyTransaction, StockCategory, StockItem } from '../types';
import { X, CheckCircle2, Edit3 } from 'lucide-react';

interface EditSupplyModalProps {
  transaction: SupplyTransaction | null;
  stocks: Record<StockCategory, StockItem>;
  onClose: () => void;
  onSave: (id: string, updates: Partial<SupplyTransaction>) => void;
}

export const EditSupplyModal: React.FC<EditSupplyModalProps> = ({
  transaction,
  stocks,
  onClose,
  onSave,
}) => {
  if (!transaction) return null;

  const [date, setDate] = useState(transaction.date || '');
  const [stockCategory, setStockCategory] = useState<StockCategory>(transaction.stockCategory || 'birth_certificates');
  const [quantity, setQuantity] = useState<number>(transaction.quantity || 1);
  const [documentNumber, setDocumentNumber] = useState(transaction.documentNumber || '');
  const [serialFrom, setSerialFrom] = useState(transaction.serialFrom || '');
  const [serialTo, setSerialTo] = useState(transaction.serialTo || '');
  const [supplierName, setSupplierName] = useState(transaction.supplierName || '');
  const [receivedBy, setReceivedBy] = useState(transaction.receivedBy || '');
  const [notes, setNotes] = useState(transaction.notes || '');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) {
      alert('يرجى إدخال كمية توريد صحيحة أكبر من الصفر.');
      return;
    }

    onSave(transaction.id, {
      date,
      stockCategory,
      quantity: Number(quantity),
      documentNumber: documentNumber.trim(),
      serialFrom: serialFrom.trim(),
      serialTo: serialTo.trim(),
      supplierName: supplierName.trim(),
      receivedBy: receivedBy.trim(),
      notes: notes.trim(),
    });
    onClose();
  };

  const stockList = Object.values(stocks) as StockItem[];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs no-print overflow-y-auto">
      <div className="w-full max-w-xl bg-white rounded-3xl p-6 shadow-2xl border border-slate-200 my-8 animate-in fade-in zoom-in-95">
        <div className="flex items-center justify-between pb-4 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-800 flex items-center justify-center">
              <Edit3 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-black text-base md:text-lg text-slate-900">
                تعديل إذن التوريد الوارد
              </h3>
              <p className="text-xs text-slate-500">
                تعديل بيانات الدفعة الواردة والكمية والمسلسل مع تسوية الأرصدة تلقائياً
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
          {/* Row 1: Stock Category & Quantity */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                الصنف المورّد *
              </label>
              <select
                value={stockCategory}
                onChange={(e) => setStockCategory(e.target.value as StockCategory)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              >
                {stockList.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.name}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                الكمية المورّدة (الواردة) *
              </label>
              <input
                type="number"
                min="1"
                required
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Row 2: Date & Document Number */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                تاريخ التوريد *
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
                رقم إذن / مستند التوريد *
              </label>
              <input
                type="text"
                required
                value={documentNumber}
                onChange={(e) => setDocumentNumber(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                placeholder="إذن إضافة رقم 45 لسنة 2026"
              />
            </div>
          </div>

          {/* Row 3: Serials (From - To) */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                المسلسل (من)
              </label>
              <input
                type="text"
                value={serialFrom}
                onChange={(e) => setSerialFrom(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                placeholder="0142001"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                المسلسل (إلى)
              </label>
              <input
                type="text"
                value={serialTo}
                onChange={(e) => setSerialTo(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                placeholder="0142100"
              />
            </div>
          </div>

          {/* Row 4: Supplier & Receiver */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block font-bold text-slate-700 mb-1">
                جهة التوريد *
              </label>
              <input
                type="text"
                required
                value={supplierName}
                onChange={(e) => setSupplierName(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
                placeholder="مخزن الإدارة الصحية بساقلتة"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1">
                المستلم بمكتب صحة سفلاق *
              </label>
              <input
                type="text"
                required
                value={receivedBy}
                onChange={(e) => setReceivedBy(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              />
            </div>
          </div>

          {/* Row 5: Notes */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              الملاحظات
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
              placeholder="أي تفاصيل تخص الدفعة أو دفاتر الحصر..."
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
              className="px-6 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold shadow-md transition flex items-center gap-1.5 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>حفظ تعديل الإذن وتحديث الرصيد</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
