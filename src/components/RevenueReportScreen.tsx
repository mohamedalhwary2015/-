import React, { useState, useMemo } from 'react';
import {
  Coins,
  CreditCard,
  Printer,
  Calendar,
  Search,
  Filter,
  TrendingUp,
  FileCheck2,
  Wallet,
  Building
} from 'lucide-react';
import { DatabaseSchema, DispenseRecord } from '../types';

interface RevenueReportScreenProps {
  db: DatabaseSchema;
}

export const RevenueReportScreen: React.FC<RevenueReportScreenProps> = ({ db }) => {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<'all' | 'health_cards' | 'male' | 'female' | 'certificates'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const dispenses = useMemo(() => {
    return (db.dispenses || []).filter((d) => !d.isDeleted && Number(d.collectedAmount) > 0);
  }, [db.dispenses]);

  const filteredDispenses = useMemo(() => {
    return dispenses.filter((d) => {
      if (startDate && d.date < startDate) return false;
      if (endDate && d.date > endDate) return false;

      if (categoryFilter === 'health_cards') {
        if (d.category !== 'health_cards_male' && d.category !== 'health_cards_female') return false;
      } else if (categoryFilter === 'male') {
        if (d.category !== 'health_cards_male') return false;
      } else if (categoryFilter === 'female') {
        if (d.category !== 'health_cards_female') return false;
      } else if (categoryFilter === 'certificates') {
        if (d.category === 'health_cards_male' || d.category === 'health_cards_female') return false;
      }

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase();
      return (
        d.citizenName.toLowerCase().includes(q) ||
        (d.receiptNumber && d.receiptNumber.toLowerCase().includes(q)) ||
        (d.serialNumber && d.serialNumber.toLowerCase().includes(q)) ||
        (d.nationalId && d.nationalId.includes(q)) ||
        d.dispensedBy.toLowerCase().includes(q)
      );
    });
  }, [dispenses, startDate, endDate, categoryFilter, searchQuery]);

  // Calculations
  const totalRevenue = useMemo(() => {
    return filteredDispenses.reduce((sum, d) => sum + (Number(d.collectedAmount) || 0), 0);
  }, [filteredDispenses]);

  const maleCardRevenue = useMemo(() => {
    return filteredDispenses
      .filter((d) => d.category === 'health_cards_male')
      .reduce((sum, d) => sum + (Number(d.collectedAmount) || 0), 0);
  }, [filteredDispenses]);

  const femaleCardRevenue = useMemo(() => {
    return filteredDispenses
      .filter((d) => d.category === 'health_cards_female')
      .reduce((sum, d) => sum + (Number(d.collectedAmount) || 0), 0);
  }, [filteredDispenses]);

  const certsRevenue = useMemo(() => {
    return filteredDispenses
      .filter((d) => d.category !== 'health_cards_male' && d.category !== 'health_cards_female')
      .reduce((sum, d) => sum + (Number(d.collectedAmount) || 0), 0);
  }, [filteredDispenses]);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6" id="revenue-report-view">
      {/* Header Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center font-bold">
            <Coins className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              تقرير الإيرادات والمبالغ المحصلة (Revenue & Treasury)
            </h2>
            <p className="text-xs text-slate-500">
              بيان تفصيلي بالمبالغ وقسائم السداد وإيصالات 33 ع.ح المحصلة عن البطاقات الصحية والمستندات
            </p>
          </div>
        </div>

        <button
          id="btn-print-revenue"
          onClick={handlePrint}
          className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all self-start sm:self-auto"
        >
          <Printer className="w-4 h-4" />
          <span>طباعة كشف الإيرادات</span>
        </button>
      </div>

      {/* 4 Financial KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">إجمالي المبالغ المحصلة</span>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {totalRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">{filteredDispenses.length} إيصال تحصيل</p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">إيرادات بطاقات صحية (ذكور)</span>
          <div className="text-2xl font-black text-blue-700 mt-2">
            {maleCardRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {filteredDispenses.filter((d) => d.category === 'health_cards_male').length} بطاقة
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">إيرادات بطاقات صحية (إناث)</span>
          <div className="text-2xl font-black text-pink-700 mt-2">
            {femaleCardRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {filteredDispenses.filter((d) => d.category === 'health_cards_female').length} بطاقة
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <span className="text-xs font-semibold text-slate-500">إيرادات الشهادات والوثائق</span>
          <div className="text-2xl font-black text-emerald-700 mt-2">
            {certsRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            {filteredDispenses.filter((d) => d.category !== 'health_cards_male' && d.category !== 'health_cards_female').length} وثيقة
          </p>
        </div>
      </div>

      {/* Filter Toolbar */}
      <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs space-y-4 no-print">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
            <input
              type="text"
              placeholder="بحث بالمواطن، رقم الإيصال، الرقم القومي..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-9 pl-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div>
            <select
              value={categoryFilter}
              onChange={(e: any) => setCategoryFilter(e.target.value)}
              className="w-full px-3 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-medium text-slate-800"
            >
              <option value="all">كافة بنود التحصيل</option>
              <option value="health_cards">كافة البطاقات الصحية (ذكور + إناث)</option>
              <option value="male">بطاقات صحية (ذكور فقط)</option>
              <option value="female">بطاقات صحية (إناث فقط)</option>
              <option value="certificates">شهادات ومستندات أخرى</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 shrink-0">من:</span>
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-400 shrink-0">إلى:</span>
            <input
              type="date"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
              className="w-full px-2.5 py-2 text-xs sm:text-sm border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            />
          </div>
        </div>
      </div>

      {/* Receipts Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:border-none print:shadow-none">
        {/* Printable Letterhead */}
        <div className="p-6 border-b border-slate-200 hidden print:block text-center">
          <h2 className="text-base font-bold">جمهورية مصر العربية - وزارة الصحة والسكان</h2>
          <h3 className="text-sm font-semibold text-slate-700">مديرية الشؤون الصحية بسوهاج - إدارة ساقلتة الصحية</h3>
          <h1 className="text-lg font-black text-slate-900 mt-1">مكتب صحة سفلاق - كشف توريد وإيرادات الخزينة</h1>
          <p className="text-xs text-slate-500 mt-1">تاريخ الطباعة: {new Date().toLocaleDateString('ar-EG')}</p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-right border-collapse">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-xs font-bold border-b border-slate-200">
                <th className="py-3.5 px-4">التاريخ</th>
                <th className="py-3.5 px-4">رقم الإيصال (33 ع.ح)</th>
                <th className="py-3.5 px-4">المواطن المستفيد</th>
                <th className="py-3.5 px-4">البند والخدمة</th>
                <th className="py-3.5 px-4">المبلغ المحصل</th>
                <th className="py-3.5 px-4">المسلسل</th>
                <th className="py-3.5 px-4">الموظف المحصل</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-xs sm:text-sm">
              {filteredDispenses.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-400">
                    لا توجد إيصالات أو مبالغ محصلة مطابقة للفلاتر
                  </td>
                </tr>
              ) : (
                filteredDispenses.map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50/60 transition-colors">
                    <td className="py-3 px-4 font-mono font-semibold text-slate-800 whitespace-nowrap">
                      {d.date}
                    </td>
                    <td className="py-3 px-4 font-mono font-bold text-slate-900 whitespace-nowrap">
                      {d.receiptNumber || 'بدون إيصال'}
                    </td>
                    <td className="py-3 px-4 text-slate-800 font-semibold">
                      {d.citizenName}
                      {d.childOrDeceasedName && (
                        <span className="block text-[11px] font-normal text-slate-500">
                          المولود/المتوفى: {d.childOrDeceasedName}
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-bold ${
                        d.category === 'health_cards_male'
                          ? 'bg-blue-50 text-blue-800 border border-blue-200'
                          : d.category === 'health_cards_female'
                          ? 'bg-pink-50 text-pink-800 border border-pink-200'
                          : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                      }`}>
                        {d.category === 'health_cards_male'
                          ? 'بطاقة صحية (ذكور)'
                          : d.category === 'health_cards_female'
                          ? 'بطاقة صحية (إناث)'
                          : 'شهادة / مستند رسمي'}
                      </span>
                    </td>
                    <td className="py-3 px-4 font-mono font-black text-teal-700 whitespace-nowrap text-sm">
                      {Number(d.collectedAmount).toLocaleString()} ج.م
                    </td>
                    <td className="py-3 px-4 text-slate-500 font-mono text-xs whitespace-nowrap">
                      {d.serialNumber || '-'}
                    </td>
                    <td className="py-3 px-4 text-slate-600 whitespace-nowrap">
                      {d.dispensedBy}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
            {filteredDispenses.length > 0 && (
              <tfoot>
                <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                  <td colSpan={4} className="py-3.5 px-4 text-left">الإجمالي المحصل:</td>
                  <td className="py-3.5 px-4 font-mono font-black text-teal-800 text-base">
                    {totalRevenue.toLocaleString()} ج.م
                  </td>
                  <td colSpan={2}></td>
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      </div>
    </div>
  );
};
