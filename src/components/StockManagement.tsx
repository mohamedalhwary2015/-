import React, { useState } from 'react';
import {
  Boxes,
  Plus,
  Edit2,
  Trash2,
  Sliders,
  AlertTriangle,
  ShieldCheck,
  CheckCircle2,
  Search,
  FileText
} from 'lucide-react';
import {
  DatabaseSchema,
  StockCategory,
  STOCK_CATEGORIES,
  CATEGORY_LABELS,
  SupplyTransaction,
  AdjustmentReason,
  ADJUSTMENT_REASON_LABELS
} from '../types';
import { addSupply, updateSupply, deleteSupply, manualAdjustStock } from '../storage/db';
import { calculateTheoreticalStockForCategory } from '../services/stockService';

interface StockManagementProps {
  db: DatabaseSchema;
}

export const StockManagement: React.FC<StockManagementProps> = ({ db }) => {
  // Supply Form State
  const [showSupplyModal, setShowSupplyModal] = useState(false);
  const [editingSupply, setEditingSupply] = useState<SupplyTransaction | null>(null);

  const [documentNumber, setDocumentNumber] = useState('');
  const [supplyDate, setSupplyDate] = useState(new Date().toISOString().split('T')[0]);
  const [supplyCategory, setSupplyCategory] = useState<StockCategory>('birth_certificates');
  const [supplyQuantity, setSupplyQuantity] = useState<number>(50);
  const [supplierSource, setSupplierSource] = useState('مخزن الإدارة الصحية بساقلتة');
  const [receivedBy, setReceivedBy] = useState(db.officeSettings?.currentEmployee || 'غير محدد');
  const [supplyNotes, setSupplyNotes] = useState('');

  // Manual Adjustment Modal State (Rule 21)
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [adjustCategory, setAdjustCategory] = useState<StockCategory>('birth_certificates');
  const [newActualStock, setNewActualStock] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<AdjustmentReason>('inventory_count');
  const [adjustNotes, setAdjustNotes] = useState('');
  const [adjustPerformedBy, setAdjustPerformedBy] = useState(db.officeSettings?.currentEmployee || 'غير محدد');

  // Search filter
  const [searchQuery, setSearchQuery] = useState('');

  const openAddSupplyModal = () => {
    setEditingSupply(null);
    setDocumentNumber('');
    setSupplyDate(new Date().toISOString().split('T')[0]);
    setSupplyCategory('birth_certificates');
    setSupplyQuantity(50);
    setSupplierSource('مخزن الإدارة الصحية بساقلتة');
    setReceivedBy(db.officeSettings?.currentEmployee || 'غير محدد');
    setSupplyNotes('');
    setShowSupplyModal(true);
  };

  const openEditSupplyModal = (supply: SupplyTransaction) => {
    setEditingSupply(supply);
    setDocumentNumber(supply.documentNumber);
    setSupplyDate(supply.date);
    setSupplyCategory(supply.category);
    setSupplyQuantity(supply.quantity);
    setSupplierSource(supply.supplierSource);
    setReceivedBy(supply.receivedBy);
    setSupplyNotes(supply.notes || '');
    setShowSupplyModal(true);
  };

  const handleSaveSupply = (e: React.FormEvent) => {
    e.preventDefault();
    if (!documentNumber.trim() || supplyQuantity <= 0) {
      alert('يرجى كتابة رقم إذن التوريد وكمية صحيحة');
      return;
    }

    if (editingSupply) {
      updateSupply(editingSupply.id, {
        documentNumber: documentNumber.trim(),
        date: supplyDate,
        category: supplyCategory,
        quantity: Number(supplyQuantity),
        supplierSource: supplierSource.trim(),
        receivedBy: receivedBy.trim() || 'غير محدد',
        notes: supplyNotes.trim()
      });
    } else {
      addSupply({
        documentNumber: documentNumber.trim(),
        date: supplyDate,
        category: supplyCategory,
        quantity: Number(supplyQuantity),
        supplierSource: supplierSource.trim(),
        receivedBy: receivedBy.trim() || 'غير محدد',
        notes: supplyNotes.trim()
      });
    }

    setShowSupplyModal(false);
  };

  const handleDeleteSupply = (supply: SupplyTransaction) => {
    if (confirm(`هل أنت متأكد من حذف إذن التوريد رقم "${supply.documentNumber}" بكمية ${supply.quantity}؟\nسيتم استرجاع الرصيد الفعلي بدقة.`)) {
      deleteSupply(supply.id, db.officeSettings?.currentEmployee || 'غير محدد');
    }
  };

  const openAdjustModalForCategory = (cat: StockCategory) => {
    const current = db.stocks[cat]?.currentStock || 0;
    setAdjustCategory(cat);
    setNewActualStock(current);
    setAdjustReason('inventory_count');
    setAdjustNotes('');
    setAdjustPerformedBy(db.officeSettings?.currentEmployee || 'غير محدد');
    setShowAdjustModal(true);
  };

  const handleSaveAdjustment = (e: React.FormEvent) => {
    e.preventDefault();
    manualAdjustStock(
      adjustCategory,
      Number(newActualStock),
      adjustReason,
      adjustNotes.trim(),
      adjustPerformedBy.trim() || 'غير محدد'
    );
    setShowAdjustModal(false);
  };

  const filteredSupplies = (db.supplies || []).filter(s => {
    if (s.isDeleted) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      s.documentNumber.toLowerCase().includes(q) ||
      s.supplierSource.toLowerCase().includes(q) ||
      CATEGORY_LABELS[s.category].toLowerCase().includes(q) ||
      s.receivedBy.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6" id="stocks-view">
      {/* Overview Table of Stocks */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              جدول الأرصدة التشغيلية المعتمدة
            </h2>
            <p className="text-xs text-slate-500">
              الرصيد الفعلي الحالي محمي تشغيلياً، وتظهر الحسابات النظرية للتحقق الرقابي فقط
            </p>
          </div>
          <button
            id="btn-add-supply"
            onClick={openAddSupplyModal}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all self-start sm:self-auto"
          >
            <Plus className="w-4 h-4" />
            <span>تسجيل إذن توريد جديد</span>
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs sm:text-sm text-right border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50 text-slate-700">
                <th className="py-3 px-3">الصنف / المستند</th>
                <th className="py-3 px-3 text-center bg-teal-50/50 text-teal-900 font-bold border-x border-teal-100">
                  الرصيد الفعلي الحالي
                </th>
                <th className="py-3 px-3 text-center">أول المدة</th>
                <th className="py-3 px-3 text-center">إجمالي الوارد</th>
                <th className="py-3 px-3 text-center">إجمالي المنصرف</th>
                <th className="py-3 px-3 text-center">تالف/محضر</th>
                <th className="py-3 px-3 text-center text-slate-500">الحساب النظري</th>
                <th className="py-3 px-3 text-center">مطابقة الجرد</th>
                <th className="py-3 px-3 text-center">إجراءات</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {STOCK_CATEGORIES.map((cat) => {
                const stock = db.stocks[cat] || {
                  currentStock: 0,
                  openingStock: 0,
                  totalReceived: 0,
                  totalDispensed: 0,
                  damagedOrCancelled: 0
                };
                const audit = calculateTheoreticalStockForCategory(db, cat);

                return (
                  <tr key={cat} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-semibold text-slate-900">
                      {CATEGORY_LABELS[cat]}
                    </td>
                    <td className="py-3 px-3 text-center font-black text-lg text-teal-900 bg-teal-50/30 border-x border-teal-100">
                      {stock.currentStock}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-600 font-medium">
                      {stock.openingStock}
                    </td>
                    <td className="py-3 px-3 text-center text-emerald-700 font-semibold">
                      +{stock.totalReceived}
                    </td>
                    <td className="py-3 px-3 text-center text-rose-700 font-semibold">
                      -{stock.totalDispensed}
                    </td>
                    <td className="py-3 px-3 text-center text-amber-700 font-medium">
                      {stock.damagedOrCancelled || 0}
                    </td>
                    <td className="py-3 px-3 text-center text-slate-500">
                      {audit.theoreticalStock}
                    </td>
                    <td className="py-3 px-3 text-center">
                      {audit.isBalanced ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>متطابق</span>
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300">
                          <AlertTriangle className="w-3 h-3" />
                          <span>فارق {audit.difference > 0 ? `+${audit.difference}` : audit.difference}</span>
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 text-center">
                      <button
                        id={`btn-adjust-${cat}`}
                        onClick={() => openAdjustModalForCategory(cat)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg border border-slate-300 transition-colors"
                        title="تسوية جرد يدوي صريح معتمد"
                      >
                        <Sliders className="w-3 h-3" />
                        <span>تسوية جرد</span>
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Supplies Transactions Ledger */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              سجل أذون التوريد الواردة
            </h3>
            <p className="text-xs text-slate-500">
              قائمة التوريدات الرسمية المستلمة من مخازن الإدارة والمديرية
            </p>
          </div>

          <div className="relative w-full sm:w-64">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="بحث برقم الإذن أو الجهة..."
              className="w-full pr-9 pl-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>

        {filteredSupplies.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs sm:text-sm">
            لا توجد أذون توريد مسجلة حالياً.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 font-semibold bg-slate-50">
                  <th className="py-2.5 px-3">رقم الإذن</th>
                  <th className="py-2.5 px-3">التاريخ</th>
                  <th className="py-2.5 px-3">الصنف</th>
                  <th className="py-2.5 px-3">الكمية</th>
                  <th className="py-2.5 px-3">جهة التوريد</th>
                  <th className="py-2.5 px-3">المستلم</th>
                  <th className="py-2.5 px-3">ملاحظات</th>
                  <th className="py-2.5 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSupplies.map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900">{s.documentNumber}</td>
                    <td className="py-2.5 px-3 text-slate-600">{s.date}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-800">{CATEGORY_LABELS[s.category]}</td>
                    <td className="py-2.5 px-3 font-bold text-emerald-700">+{s.quantity}</td>
                    <td className="py-2.5 px-3 text-slate-600">{s.supplierSource}</td>
                    <td className="py-2.5 px-3 text-slate-600">{s.receivedBy}</td>
                    <td className="py-2.5 px-3 text-slate-400 text-xs">{s.notes || '-'}</td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEditSupplyModal(s)}
                          className="p-1 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors"
                          title="تعديل الإذن"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSupply(s)}
                          className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title="حذف الإذن"
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

      {/* Add / Edit Supply Modal */}
      {showSupplyModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingSupply ? 'تعديل إذن توريد' : 'تسجيل إذن توريد جديد'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              سيتم قيد الكمية الواردة مباشرة وإضافتها للرصيد الفعلي المحمي للصنف.
            </p>

            <form onSubmit={handleSaveSupply} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم إذن التوريد *</label>
                  <input
                    type="text"
                    required
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    placeholder="مثال: 1045"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ التوريد *</label>
                  <input
                    type="date"
                    required
                    value={supplyDate}
                    onChange={(e) => setSupplyDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الصنف المستلم *</label>
                  <select
                    value={supplyCategory}
                    onChange={(e) => setSupplyCategory(e.target.value as StockCategory)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    {STOCK_CATEGORIES.map((c) => (
                      <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الكمية الموردة *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={supplyQuantity}
                    onChange={(e) => setSupplyQuantity(Number(e.target.value))}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm font-bold focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">جهة التوريد</label>
                  <input
                    type="text"
                    value={supplierSource}
                    onChange={(e) => setSupplierSource(e.target.value)}
                    placeholder="مخزن الإدارة الصحية بساقلتة"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الموظف المستلم</label>
                  <input
                    type="text"
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                    placeholder="اسم المستلم أو غير محدد"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ملاحظات</label>
                <textarea
                  rows={2}
                  value={supplyNotes}
                  onChange={(e) => setSupplyNotes(e.target.value)}
                  placeholder="أي تفاصيل أو أرقام مسلسلة..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowSupplyModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  id="btn-submit-supply"
                  className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
                >
                  {editingSupply ? 'حفظ التعديلات' : 'تسجيل التوريد'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Manual Adjustment Modal (Rule 21) */}
      {showAdjustModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-xl border border-slate-200">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              تسوية جرد يدوي صريح
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              الصنف: <strong className="text-slate-800">{CATEGORY_LABELS[adjustCategory]}</strong>.
              الرصيد الفعلي الحالي المسجل: <strong className="text-teal-700">{db.stocks[adjustCategory]?.currentStock || 0}</strong>
            </p>

            <form onSubmit={handleSaveAdjustment} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الرصيد الفعلي الجديد بعد الجرد *</label>
                <input
                  type="number"
                  min="0"
                  required
                  value={newActualStock}
                  onChange={(e) => setNewActualStock(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-black text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
                <p className="text-[11px] text-slate-400 mt-1">
                  الفارق: {newActualStock - (db.stocks[adjustCategory]?.currentStock || 0) > 0 ? `+${newActualStock - (db.stocks[adjustCategory]?.currentStock || 0)}` : newActualStock - (db.stocks[adjustCategory]?.currentStock || 0)}
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">سبب التسوية الرسمي *</label>
                <select
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value as AdjustmentReason)}
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                >
                  {Object.entries(ADJUSTMENT_REASON_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500 mt-1">
                  ممنوع اعتبار الفرق السالب تالفاً تلقائياً بدون تحديد سبب صريح (Rule 21).
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">الموظف القائم بالتسوية</label>
                <input
                  type="text"
                  value={adjustPerformedBy}
                  onChange={(e) => setAdjustPerformedBy(e.target.value)}
                  placeholder="اسم الموظف أو غير محدد"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">بيان التسوية ورقم المحضر</label>
                <textarea
                  rows={2}
                  value={adjustNotes}
                  onChange={(e) => setAdjustNotes(e.target.value)}
                  placeholder="مثال: جرد دوري بمعرفة لجنة التفتيش المالي والإداري..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAdjustModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  id="btn-confirm-adjustment"
                  className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
                >
                  اعتماد التسوية وتحديث الرصيد
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
