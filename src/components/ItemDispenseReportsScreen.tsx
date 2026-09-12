import React, { useState } from 'react';
import {
  FileText,
  Search,
  Filter,
  Printer,
  Calendar,
  Coins,
  FileCheck2
} from 'lucide-react';
import {
  DatabaseSchema,
  StockCategory,
  STOCK_CATEGORIES,
  CATEGORY_LABELS,
  TRANSACTION_TYPE_LABELS
} from '../types';

interface ItemDispenseReportsScreenProps {
  db: DatabaseSchema;
}

export const ItemDispenseReportsScreen: React.FC<ItemDispenseReportsScreenProps> = ({ db }) => {
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedGender, setSelectedGender] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const filteredDispenses = (db.dispenses || []).filter((d) => {
    if (d.isDeleted) return false;
    if (selectedCategory !== 'all' && d.category !== selectedCategory) return false;
    if (selectedGender !== 'all' && d.gender !== selectedGender) return false;
    if (startDate && d.date < startDate) return false;
    if (endDate && d.date > endDate) return false;
    if (!searchQuery.trim()) return true;

    const q = searchQuery.toLowerCase();
    return (
      d.citizenName.toLowerCase().includes(q) ||
      (d.nationalId && d.nationalId.includes(q)) ||
      (d.childOrDeceasedName && d.childOrDeceasedName.toLowerCase().includes(q)) ||
      (d.receiptNumber && d.receiptNumber.toLowerCase().includes(q)) ||
      (d.serialNumber && d.serialNumber.toLowerCase().includes(q))
    );
  });

  const totalQuantity = filteredDispenses.reduce((sum, d) => sum + (Number(d.quantity) || 0), 0);
  const totalRevenue = filteredDispenses.reduce((sum, d) => sum + (Number(d.collectedAmount) || 0), 0);

  return (
    <div className="space-y-6" id="item-dispense-reports-view">
      {/* Top Filter Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs no-print">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              سجل المنصرف التفصيلي للمستندات
            </h2>
            <p className="text-xs text-slate-500">
              استخراج تقارير تفصيلية مفلترة حسب الصنف أو النوع أو الفترة الزمنية
            </p>
          </div>

          <button
            onClick={() => window.print()}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all self-start sm:self-auto"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة السجل الحالي</span>
          </button>
        </div>

        {/* Filter Controls */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">الصنف</label>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">كل الأصناف</option>
              {STOCK_CATEGORIES.map((c) => (
                <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">النوع (الجنس)</label>
            <select
              value={selectedGender}
              onChange={(e) => setSelectedGender(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">الكل</option>
              <option value="ذكر">ذكور فقط</option>
              <option value="أنثى">إناث فقط</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">من تاريخ</label>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">إلى تاريخ</label>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">بحث بالاسم / الرقم</label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="اسم، قومي، إيصال..."
                className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>
          </div>
        </div>

        {/* Summary Badges */}
        <div className="flex flex-wrap items-center gap-4 mt-4 pt-4 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">عدد الحالات:</span>
            <strong className="text-slate-900 font-bold">{filteredDispenses.length}</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">إجمالي المستندات:</span>
            <strong className="text-teal-700 font-bold">{totalQuantity} مستند</strong>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="text-slate-500">إجمالي المبالغ المحصلة:</span>
            <strong className="text-amber-700 font-bold">{totalRevenue.toLocaleString()} ج.م</strong>
          </div>
        </div>
      </div>

      {/* Printable Report Sheet */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs print:p-0 print:border-none print:shadow-none">
        <div className="hidden print:block border-b-2 border-slate-800 pb-3 mb-4 text-center">
          <h2 className="text-lg font-black text-slate-900">مكتب صحة سفلاق - بيان تفصيلي بالمنصرف</h2>
          <p className="text-xs text-slate-600 mt-1">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
        </div>

        {filteredDispenses.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs sm:text-sm">
            لا توجد حركات منصرفة مطابقة لمعايير التصفية.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-right border-collapse border border-slate-200">
              <thead>
                <tr className="bg-slate-50 text-slate-800 font-bold border-b border-slate-200">
                  <th className="p-2 border-l border-slate-200">م</th>
                  <th className="p-2 border-l border-slate-200">التاريخ</th>
                  <th className="p-2 border-l border-slate-200">اسم المواطن / ولي الأمر</th>
                  <th className="p-2 border-l border-slate-200">المولود / المتوفى</th>
                  <th className="p-2 border-l border-slate-200">النوع</th>
                  <th className="p-2 border-l border-slate-200">الصنف المصروف</th>
                  <th className="p-2 border-l border-slate-200 text-center">الكمية</th>
                  <th className="p-2 border-l border-slate-200 text-center">المبلغ المحصل</th>
                  <th className="p-2 border-l border-slate-200">رقم الإيصال / المسلسل</th>
                  <th className="p-2">المسؤول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredDispenses.map((d, idx) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="p-2 border-l border-slate-200 text-center text-slate-400">{idx + 1}</td>
                    <td className="p-2 border-l border-slate-200 text-slate-600">{d.date}</td>
                    <td className="p-2 border-l border-slate-200 font-semibold text-slate-900">
                      <div>{d.citizenName}</div>
                      {d.nationalId && <span className="text-[10px] text-slate-400 font-mono">{d.nationalId}</span>}
                    </td>
                    <td className="p-2 border-l border-slate-200 text-slate-700">{d.childOrDeceasedName || '-'}</td>
                    <td className="p-2 border-l border-slate-200">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] ${
                        d.gender === 'ذكر' ? 'bg-blue-50 text-blue-700' : d.gender === 'أنثى' ? 'bg-pink-50 text-pink-700' : 'text-slate-500'
                      }`}>
                        {d.gender || '-'}
                      </span>
                    </td>
                    <td className="p-2 border-l border-slate-200 font-medium text-slate-800">{CATEGORY_LABELS[d.category]}</td>
                    <td className="p-2 border-l border-slate-200 text-center font-bold text-rose-700">{d.quantity}</td>
                    <td className="p-2 border-l border-slate-200 text-center font-bold text-amber-700">{d.collectedAmount} ج.م</td>
                    <td className="p-2 border-l border-slate-200 text-[11px] font-mono text-slate-600">
                      {d.receiptNumber || d.serialNumber || '-'}
                    </td>
                    <td className="p-2 text-slate-500">{d.dispensedBy}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
