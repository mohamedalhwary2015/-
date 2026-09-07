import React, { useState } from 'react';
import { AppDatabase, StockCategory, SupplyTransaction, StockItem } from '../types';
import { addSupplyTransaction, manualAdjustStock, updateSupplyTransaction, deleteSupplyTransaction } from '../storage/db';
import { EditSupplyModal } from './EditSupplyModal';
import { 
  PackagePlus, 
  History, 
  SlidersHorizontal, 
  CheckCircle, 
  AlertCircle, 
  FileSpreadsheet, 
  Calendar,
  Hash,
  User,
  FileText,
  Pencil,
  Trash2
} from 'lucide-react';

interface StockManagementProps {
  db: AppDatabase;
  onDatabaseUpdate: (newDb: AppDatabase) => void;
}

export const StockManagement: React.FC<StockManagementProps> = ({
  db,
  onDatabaseUpdate,
}) => {
  // Tabs: Add Supply vs Inventory Table vs History
  const [activeSubTab, setActiveSubTab] = useState<'add_supply' | 'inventory_list' | 'transactions'>('add_supply');

  // Form State for new supply
  const [supplyCategory, setSupplyCategory] = useState<StockCategory>('birth_certificates');
  const [quantity, setQuantity] = useState<number>(50);
  const [supplyDate, setSupplyDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [documentNumber, setDocumentNumber] = useState<string>('');
  const [serialFrom, setSerialFrom] = useState<string>('');
  const [serialTo, setSerialTo] = useState<string>('');
  const [supplierName, setSupplierName] = useState<string>('مخازن الإدارة الصحية بساقلتة');
  const [receivedBy, setReceivedBy] = useState<string>(db.officeSettings.currentEmployee || 'كاتب صحة سفلاق');
  const [notes, setNotes] = useState<string>('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Manual Adjust Modal State
  const [adjustCategory, setAdjustCategory] = useState<StockCategory | null>(null);
  const [adjustedQty, setAdjustedQty] = useState<number>(0);
  const [adjustReason, setAdjustReason] = useState<string>('جرد ربع سنوي معتمد');

  // Edit / Delete Supply Transaction State
  const [editingTransaction, setEditingTransaction] = useState<SupplyTransaction | null>(null);

  const handleDeleteTransaction = (tx: SupplyTransaction) => {
    const catName = db.stocks[tx.stockCategory]?.name || tx.stockCategory;
    const isConfirmed = window.confirm(
      `تأكيد حذف إذن التوريد:\nهل أنت متأكد من حذف إذن التوريد رقم "${tx.documentNumber}" الخاص بـ (${catName}) بكمية (+${tx.quantity})؟\n\nتنبيه: سيتم خصم هذه الكمية تلقائياً من رصيد المخزن الحالي وتعديل إجمالي الوارد بمكتب صحة سفلاق.`
    );
    if (!isConfirmed) return;

    const updatedDb = deleteSupplyTransaction(tx.id);
    onDatabaseUpdate(updatedDb);
  };

  const handleSaveEditTransaction = (id: string, updates: Partial<SupplyTransaction>) => {
    const updatedDb = updateSupplyTransaction(id, updates);
    onDatabaseUpdate(updatedDb);
  };

  const stockList = Object.values(db.stocks) as StockItem[];

  const handleSupplySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quantity <= 0) {
      alert('يرجى إدخال كمية توريد صحيحة أكبر من الصفر');
      return;
    }
    if (!documentNumber.trim()) {
      alert('يرجى إدخال رقم إذن التوريد أو المستند');
      return;
    }

    const { db: updatedDb } = addSupplyTransaction({
      stockCategory: supplyCategory,
      quantity: Number(quantity),
      date: supplyDate,
      documentNumber: documentNumber.trim(),
      serialFrom: serialFrom.trim() || undefined,
      serialTo: serialTo.trim() || undefined,
      supplierName: supplierName.trim(),
      receivedBy: receivedBy.trim(),
      notes: notes.trim() || undefined,
    });

    onDatabaseUpdate(updatedDb);

    setSuccessMessage(`تم توريد ${quantity} بنجاح إلى رصيد ${db.stocks[supplyCategory].name}!`);
    setDocumentNumber('');
    setSerialFrom('');
    setSerialTo('');
    setNotes('');

    setTimeout(() => {
      setSuccessMessage(null);
    }, 4000);
  };

  const handleAdjustSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!adjustCategory) return;
    const updatedDb = manualAdjustStock(adjustCategory, adjustedQty, adjustReason);
    onDatabaseUpdate(updatedDb);
    setAdjustCategory(null);
  };

  return (
    <div className="space-y-6">
      {/* Sub-tabs header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-2">
          <button
            id="stock-tab-add"
            onClick={() => setActiveSubTab('add_supply')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold transition cursor-pointer ${
              activeSubTab === 'add_supply'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <PackagePlus className="w-4 h-4" />
            <span>تسجيل وارد وتوريد جديد</span>
          </button>

          <button
            id="stock-tab-list"
            onClick={() => setActiveSubTab('inventory_list')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold transition cursor-pointer ${
              activeSubTab === 'inventory_list'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <SlidersHorizontal className="w-4 h-4" />
            <span>كشف وجرد الأرصدة الفعلية</span>
          </button>

          <button
            id="stock-tab-history"
            onClick={() => setActiveSubTab('transactions')}
            className={`flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs md:text-sm font-bold transition cursor-pointer ${
              activeSubTab === 'transactions'
                ? 'bg-emerald-700 text-white shadow-xs'
                : 'text-slate-600 hover:bg-slate-100'
            }`}
          >
            <History className="w-4 h-4" />
            <span>سجل أذون التوريد ({db.supplyTransactions.length})</span>
          </button>
        </div>
      </div>

      {/* SUCCESS BANNER */}
      {successMessage && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-900 flex items-center gap-3 text-sm font-bold animate-in fade-in">
          <CheckCircle className="w-5 h-5 text-emerald-700 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* SUBTAB 1: ADD SUPPLY */}
      {activeSubTab === 'add_supply' && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs">
            <div className="flex items-center gap-2 mb-4 pb-3 border-b border-slate-100">
              <PackagePlus className="w-5 h-5 text-emerald-700" />
              <div>
                <h3 className="font-bold text-base text-slate-900">
                  إذن توريد وإضافة رصيد جديد للعهدة
                </h3>
                <p className="text-xs text-slate-500 font-medium">
                  تسجيل الكميات المسلمة لمكتب صحة سفلاق من الإدارة الصحية بساقلتة أو المديرية
                </p>
              </div>
            </div>

            <form onSubmit={handleSupplySubmit} className="space-y-4 text-xs md:text-sm">
              {/* Category selection */}
              <div>
                <label className="block font-bold text-slate-700 mb-1.5">
                  نوع المستند / الصنف المراد توريده *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {stockList.map((item) => (
                    <label
                      key={item.id}
                      className={`flex items-center justify-between p-3 rounded-xl border cursor-pointer transition ${
                        supplyCategory === item.id
                          ? 'bg-emerald-50 border-emerald-600 text-emerald-900 font-bold ring-1 ring-emerald-600'
                          : 'bg-white border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="supplyCategory"
                          value={item.id}
                          checked={supplyCategory === item.id}
                          onChange={() => setSupplyCategory(item.id)}
                          className="accent-emerald-700"
                        />
                        <span>{item.name}</span>
                      </div>
                      <span className="text-xs text-slate-500 font-mono">
                        (الحالي: {item.currentStock})
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Quantity & Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    الكمية المستلمة * ({db.stocks[supplyCategory].unit})
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quantity}
                    onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 0))}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 font-bold text-base text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    تاريخ التوريد والاستلام *
                  </label>
                  <input
                    type="date"
                    required
                    value={supplyDate}
                    onChange={(e) => setSupplyDate(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900"
                  />
                </div>
              </div>

              {/* Document Number & Serials */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    رقم إذن التوريد / رقم المستند *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="مثال: إذن 52/2026 أو قسيمة 118"
                    value={documentNumber}
                    onChange={(e) => setDocumentNumber(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    من مسلسل رقم (اختياري)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 0142201"
                    value={serialFrom}
                    onChange={(e) => setSerialFrom(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    إلى مسلسل رقم (اختياري)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 0142300"
                    value={serialTo}
                    onChange={(e) => setSerialTo(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900 font-mono"
                  />
                </div>
              </div>

              {/* Supplier & Receiver */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    الجهة أو الموظف المورّد
                  </label>
                  <input
                    type="text"
                    value={supplierName}
                    onChange={(e) => setSupplierName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    اسم الموظف المستلم بمكتب صحة سفلاق
                  </label>
                  <input
                    type="text"
                    value={receivedBy}
                    onChange={(e) => setReceivedBy(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900"
                  />
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  ملاحظات على التوريد
                </label>
                <textarea
                  rows={2}
                  placeholder="أية ملاحظات إضافية بخصوص حالة الدفعة أو أرقام الصناديق..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 text-slate-900"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-3">
                <button
                  type="submit"
                  id="submit-supply-btn"
                  className="px-6 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl font-bold shadow-md transition active:scale-95 cursor-pointer flex items-center gap-2"
                >
                  <CheckCircle className="w-4 h-4" />
                  <span>تأكيد تسجيل التوريد وإضافة الرصيد</span>
                </button>
              </div>
            </form>
          </div>

          {/* Quick Summary Sidebar */}
          <div className="space-y-4">
            <div className="bg-slate-50 border border-slate-200 rounded-2xl p-5">
              <h4 className="font-bold text-slate-900 text-sm mb-3">
                الأرصدة الحالية قبل التوريد
              </h4>
              <div className="space-y-2.5 text-xs">
                {stockList.map((item) => (
                  <div key={item.id} className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-200">
                    <span className="font-medium text-slate-700">{item.name}</span>
                    <span className="font-black text-emerald-800 font-mono text-sm">
                      {item.currentStock}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div className="p-4 bg-amber-50 rounded-2xl border border-amber-200 text-xs text-amber-900 leading-relaxed">
              <div className="font-bold mb-1 flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 text-amber-700" />
                <span>تعليمات وزارة الصحة:</span>
              </div>
              <p>
                يجب مطابقة الأرقام المسلسلة المطبوعة على الدفاتر الورقية مع المسلسلات المدونة بإذن الاستلام والتأكد من سلامة الدفاتر والأختام قبل اعتماد الإضافة بالمنظومة.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* SUBTAB 2: INVENTORY LIST & MANUAL ADJUSTMENT */}
      {activeSubTab === 'inventory_list' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-base text-slate-900">
                كشف الجرد الفعلي ورصيد العهد بمكتب صحة سفلاق
              </h3>
              <p className="text-xs text-slate-500">
                مطابقة الرصيد الدفتري والمسجل بالنظام مع الجرد الفعلي للأرصدة بالخزينة
              </p>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs md:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
                  <th className="py-3 px-3">اسم المستند / العهدة</th>
                  <th className="py-3 px-3">الفئة</th>
                  <th className="py-3 px-3 text-center">الرصيد الافتتاحي</th>
                  <th className="py-3 px-3 text-center">إجمالي الوارد</th>
                  <th className="py-3 px-3 text-center">إجمالي المنصرف</th>
                  <th className="py-3 px-3 text-center">الهالك / التالف</th>
                  <th className="py-3 px-3 text-center">الرصيد الفعلي المتاح</th>
                  <th className="py-3 px-3 text-center">حالة العهدة</th>
                  <th className="py-3 px-3 text-center">إجراءات التسوية</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stockList.map((item) => {
                  const isLow = item.currentStock <= item.minThreshold;
                  return (
                    <tr key={item.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3.5 px-3 font-bold text-slate-900">
                        {item.name}
                        <div className="text-[11px] text-slate-400 font-normal">{item.unit}</div>
                      </td>
                      <td className="py-3.5 px-3 text-slate-600">
                        {item.category === 'birth' && 'سجلات المواليد'}
                        {item.category === 'death' && 'سجلات الوفيات'}
                        {item.category === 'health_card' && 'البطاقات الصحية'}
                        {item.category === 'late_registration' && 'ساقط القيد'}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-semibold text-slate-700 bg-emerald-50/40">
                        {item.openingStock ?? 0}
                        {item.openingSerialFrom && item.openingSerialTo && (
                          <div className="text-[10px] text-slate-400 font-mono">
                            {item.openingSerialFrom} - {item.openingSerialTo}
                          </div>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-semibold text-slate-700">
                        {item.totalReceived}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-semibold text-slate-700">
                        {item.totalDispensed}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-semibold text-rose-700">
                        {item.damagedOrCancelled}
                      </td>
                      <td className="py-3.5 px-3 text-center font-mono font-black text-base text-emerald-800">
                        {item.currentStock}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        {isLow ? (
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 text-xs font-bold">
                            رصيد منخفض
                          </span>
                        ) : (
                          <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold">
                            كافٍ ومستقر
                          </span>
                        )}
                      </td>
                      <td className="py-3.5 px-3 text-center">
                        <button
                          onClick={() => {
                            setAdjustCategory(item.id);
                            setAdjustedQty(item.currentStock);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs transition cursor-pointer"
                        >
                          تعديل / جرد
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUBTAB 3: SUPPLY TRANSACTIONS HISTORY */}
      {activeSubTab === 'transactions' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-3 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-base text-slate-900">
                سجل حركات وأذون التوريد الواردة
              </h3>
              <p className="text-xs text-slate-500">
                تاريخ وصول الدفعات وأرقام الأذون والمستندات والمسلسلات
              </p>
            </div>
          </div>

          {db.supplyTransactions.length === 0 ? (
            <div className="py-10 text-center text-slate-400 text-sm">
              لا توجد أذون توريد مسجلة حالياً.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-right text-xs md:text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50">
                    <th className="py-3 px-3">التاريخ</th>
                    <th className="py-3 px-3">الصنف المورّد</th>
                    <th className="py-3 px-3">الكمية</th>
                    <th className="py-3 px-3">رقم الإذن / المستند</th>
                    <th className="py-3 px-3">المسلسل (من - إلى)</th>
                    <th className="py-3 px-3">جهة التوريد</th>
                    <th className="py-3 px-3">المستلم بمكتب الصحة</th>
                    <th className="py-3 px-3">ملاحظات</th>
                    <th className="py-3 px-3 text-center">الإجراءات</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {db.supplyTransactions.map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/70 transition">
                      <td className="py-3 px-3 font-mono text-slate-600 whitespace-nowrap">
                        {tx.date}
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                        {db.stocks[tx.stockCategory]?.name || tx.stockCategory}
                      </td>
                      <td className="py-3 px-3 font-mono font-black text-emerald-800 whitespace-nowrap">
                        +{tx.quantity}
                      </td>
                      <td className="py-3 px-3 font-semibold text-slate-800 whitespace-nowrap">
                        {tx.documentNumber}
                      </td>
                      <td className="py-3 px-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                        {tx.serialFrom && tx.serialTo ? `${tx.serialFrom} ⬅ ${tx.serialTo}` : '—'}
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        {tx.supplierName}
                      </td>
                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        {tx.receivedBy}
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-xs max-w-xs truncate">
                        {tx.notes || '—'}
                      </td>
                      <td className="py-3 px-3 text-center whitespace-nowrap">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            onClick={() => setEditingTransaction(tx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-blue-50 hover:bg-blue-100 text-blue-800 border border-blue-200 text-xs font-bold transition cursor-pointer"
                            title="تعديل إذن التوريد"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                            <span>تعديل</span>
                          </button>
                          <button
                            onClick={() => handleDeleteTransaction(tx)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-200 text-xs font-bold transition cursor-pointer"
                            title="حذف إذن التوريد وخصم الكمية من الرصيد"
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
      )}

      {/* ADJUST QUANTITY MODAL */}
      {adjustCategory && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs no-print">
          <div className="w-full max-w-md bg-white rounded-2xl p-6 shadow-xl border border-slate-200">
            <h3 className="font-bold text-base text-slate-900 mb-2">
              تسوية وتعديل رصيد الجرد الفعلي
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              الصنف: <strong className="text-emerald-800">{db.stocks[adjustCategory].name}</strong>
            </p>

            <form onSubmit={handleAdjustSubmit} className="space-y-4 text-xs md:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  الرصيد الفعلي الحالي بالخزينة *
                </label>
                <input
                  type="number"
                  min="0"
                  required
                  value={adjustedQty}
                  onChange={(e) => setAdjustedQty(Math.max(0, parseInt(e.target.value) || 0))}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 font-bold text-base text-slate-900 font-mono"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  سبب التسوية / رقم محضر الجرد *
                </label>
                <input
                  type="text"
                  required
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-slate-900"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setAdjustCategory(null)}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-bold text-xs shadow-xs"
                >
                  حفظ التسوية
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT SUPPLY TRANSACTION MODAL */}
      <EditSupplyModal
        transaction={editingTransaction}
        stocks={db.stocks}
        onClose={() => setEditingTransaction(null)}
        onSave={handleSaveEditTransaction}
      />
    </div>
  );
};
