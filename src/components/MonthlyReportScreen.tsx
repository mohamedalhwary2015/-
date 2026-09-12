import React, { useState } from 'react';
import {
  CalendarCheck,
  Printer,
  FileText,
  Building,
  Coins,
  ShieldCheck
} from 'lucide-react';
import { DatabaseSchema } from '../types';
import { generateOfficialMonthlyReport, getArabicMonthName } from '../services/reportService';

interface MonthlyReportScreenProps {
  db: DatabaseSchema;
}

export const MonthlyReportScreen: React.FC<MonthlyReportScreenProps> = ({ db }) => {
  const currentDate = new Date();
  const [selectedYear, setSelectedYear] = useState<number>(currentDate.getFullYear());
  const [selectedMonth, setSelectedMonth] = useState<number>(currentDate.getMonth() + 1);

  const report = generateOfficialMonthlyReport(db, selectedYear, selectedMonth);

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6" id="monthly-report-view">
      {/* Top Filter & Print Bar (Hidden during print) */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4 no-print">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            التقرير الإحصائي الشهري الرسمي لمكتب الصحة
          </h2>
          <p className="text-xs text-slate-500">
            الاستمارة الإحصائية الدورية لحركة الأرصدة والمواليد والوفيات والبطاقات الصحية
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <select
            value={selectedMonth}
            onChange={(e) => setSelectedMonth(Number(e.target.value))}
            className="px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-semibold text-slate-800"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
              <option key={m} value={m}>{getArabicMonthName(m)}</option>
            ))}
          </select>

          <select
            value={selectedYear}
            onChange={(e) => setSelectedYear(Number(e.target.value))}
            className="px-3 py-2 text-xs sm:text-sm border border-slate-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-teal-500 font-semibold text-slate-800"
          >
            {[2024, 2025, 2026, 2027].map((y) => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>

          <button
            id="btn-print-monthly-report"
            onClick={handlePrint}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all"
          >
            <Printer className="w-4 h-4" />
            <span>طباعة التقرير الرسمي</span>
          </button>
        </div>
      </div>

      {/* Official Health Office Monthly Printable Sheet */}
      <div className="bg-white rounded-2xl p-8 border border-slate-200 shadow-xs print:p-0 print:border-none print:shadow-none">
        {/* Official Letterhead Header */}
        <div className="border-b-2 border-slate-900 pb-4 mb-6">
          <div className="flex items-start justify-between">
            <div className="text-right text-xs font-bold text-slate-800 space-y-1">
              <div>جمهورية مصر العربية</div>
              <div>وزارة الصحة والسكان</div>
              <div>مديرية الشؤون الصحية بسوهاج</div>
              <div>الإدارة الصحية بساقلتة</div>
              <div className="text-sm font-black text-teal-800">مكتب صحة سفلاق</div>
            </div>

            <div className="text-center">
              <div className="w-12 h-12 rounded-full border-2 border-slate-800 flex items-center justify-center mx-auto mb-1 text-slate-800 font-bold text-xs">
                م.ص
              </div>
              <h1 className="text-base sm:text-xl font-black text-slate-900 mt-1">
                التقرير الشهري لحركة الأرصدة والوقائع الحيوية
              </h1>
              <p className="text-xs font-bold text-slate-600 mt-0.5">
                عن شهر: {report.monthNameAr} لسنة {report.year} م
              </p>
            </div>

            <div className="text-left text-xs text-slate-600 space-y-1">
              <div>تاريخ التقرير: {report.reportDate}</div>
              <div>الكود الإداري: 260305</div>
              <div>الجهة: وحدة صحة سفلاق</div>
            </div>
          </div>
        </div>

        {/* Section 1: Official Category Inventory Movement */}
        <div className="mb-6">
          <h3 className="text-xs sm:text-sm font-black text-slate-900 bg-slate-100 p-2 rounded-lg mb-2 border border-slate-200">
            أولاً: بيان حركة أرصدة الدفاتر والشهادات الرسمية
          </h3>
          <table className="w-full text-xs text-right border-collapse border border-slate-300">
            <thead>
              <tr className="bg-slate-50 text-slate-800 font-bold border-b border-slate-300">
                <th className="p-2 border-l border-slate-300">م</th>
                <th className="p-2 border-l border-slate-300">اسم الصنف / المستند</th>
                <th className="p-2 border-l border-slate-300 text-center">رصيد أول الشهر</th>
                <th className="p-2 border-l border-slate-300 text-center text-emerald-800">الوارد</th>
                <th className="p-2 border-l border-slate-300 text-center text-rose-800">المنصرف</th>
                <th className="p-2 border-l border-slate-300 text-center">تالف/محضر</th>
                <th className="p-2 text-center bg-teal-50 text-teal-900 font-black">الرصيد الفعلي الحالي</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {report.categorySummaries.map((cat, idx) => (
                <tr key={cat.category} className="hover:bg-slate-50">
                  <td className="p-2 border-l border-slate-300 text-center text-slate-500 font-bold">{idx + 1}</td>
                  <td className="p-2 border-l border-slate-300 font-semibold text-slate-900">{cat.categoryLabel}</td>
                  <td className="p-2 border-l border-slate-300 text-center font-medium">{cat.openingStock}</td>
                  <td className="p-2 border-l border-slate-300 text-center font-bold text-emerald-700">{cat.receivedThisMonth > 0 ? `+${cat.receivedThisMonth}` : 0}</td>
                  <td className="p-2 border-l border-slate-300 text-center font-bold text-rose-700">{cat.dispensedThisMonth > 0 ? `-${cat.dispensedThisMonth}` : 0}</td>
                  <td className="p-2 border-l border-slate-300 text-center text-slate-500">{cat.damagedThisMonth}</td>
                  <td className="p-2 text-center font-black text-slate-900 bg-teal-50/50">{cat.closingStock}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Section 2: Vital Statistics Summary (STRICT SEPARATION - Rules 25, 26, 27, 28) */}
        <div className="mb-6">
          <h3 className="text-xs sm:text-sm font-black text-slate-900 bg-slate-100 p-2 rounded-lg mb-2 border border-slate-200">
            ثانياً: الإحصائية الحيوية الرسمية المنصرفة خلال الشهر
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Births & Deaths */}
            <table className="w-full text-xs text-right border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-50 text-slate-800 font-bold border-b border-slate-300">
                  <th className="p-2 border-l border-slate-300">البيان</th>
                  <th className="p-2 border-l border-slate-300 text-center">ذكور</th>
                  <th className="p-2 border-l border-slate-300 text-center">إناث</th>
                  <th className="p-2 text-center font-black">الجملة</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2 border-l border-slate-300 font-semibold">شهادات الميلاد المميكنة</td>
                  <td className="p-2 border-l border-slate-300 text-center">{report.vitalStats.birthCertificatesMale}</td>
                  <td className="p-2 border-l border-slate-300 text-center">{report.vitalStats.birthCertificatesFemale}</td>
                  <td className="p-2 text-center font-bold text-teal-800">{report.vitalStats.birthCertificatesTotal}</td>
                </tr>
                <tr>
                  <td className="p-2 border-l border-slate-300 font-semibold">دفاتر بلاغات الميلاد الورقية</td>
                  <td colSpan={2} className="p-2 border-l border-slate-300 text-center text-slate-400">-</td>
                  <td className="p-2 text-center font-bold text-slate-800">{report.vitalStats.birthNotificationsTotal}</td>
                </tr>
                <tr>
                  <td className="p-2 border-l border-slate-300 font-semibold">شهادات الوفاة</td>
                  <td className="p-2 border-l border-slate-300 text-center">{report.vitalStats.deathCertificatesMale}</td>
                  <td className="p-2 border-l border-slate-300 text-center">{report.vitalStats.deathCertificatesFemale}</td>
                  <td className="p-2 text-center font-bold text-slate-800">{report.vitalStats.deathCertificatesTotal}</td>
                </tr>
                <tr>
                  <td className="p-2 border-l border-slate-300 font-semibold">دفاتر بلاغات الوفاة الورقية</td>
                  <td colSpan={2} className="p-2 border-l border-slate-300 text-center text-slate-400">-</td>
                  <td className="p-2 text-center font-bold text-slate-800">{report.vitalStats.deathNotificationsTotal}</td>
                </tr>
              </tbody>
            </table>

            {/* Health Cards & Revenue (STRICTLY NOT COUNTED AS BIRTHS - Rule 25 & 28) */}
            <table className="w-full text-xs text-right border-collapse border border-slate-300">
              <thead>
                <tr className="bg-slate-50 text-slate-800 font-bold border-b border-slate-300">
                  <th className="p-2 border-l border-slate-300">البطاقات الصحية والإيرادات</th>
                  <th className="p-2 border-l border-slate-300 text-center">العدد</th>
                  <th className="p-2 text-center font-black">المبلغ المحصل (ج.م)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                <tr>
                  <td className="p-2 border-l border-slate-300 font-semibold">بطاقات صحية (ذكور)</td>
                  <td className="p-2 border-l border-slate-300 text-center font-bold">{report.vitalStats.healthCardsMaleTotal}</td>
                  <td className="p-2 text-center text-amber-800 font-bold">
                    {(report.vitalStats.healthCardsMaleTotal * (db.officeSettings?.healthCardMaleFee || 50)).toLocaleString()} ج.م
                  </td>
                </tr>
                <tr>
                  <td className="p-2 border-l border-slate-300 font-semibold">بطاقات صحية (إناث)</td>
                  <td className="p-2 border-l border-slate-300 text-center font-bold">{report.vitalStats.healthCardsFemaleTotal}</td>
                  <td className="p-2 text-center text-amber-800 font-bold">
                    {(report.vitalStats.healthCardsFemaleTotal * (db.officeSettings?.healthCardFemaleFee || 50)).toLocaleString()} ج.م
                  </td>
                </tr>
                <tr className="bg-slate-50">
                  <td className="p-2 border-l border-slate-300 font-bold text-slate-900">إجمالي البطاقات الصحية المنصرفة</td>
                  <td className="p-2 border-l border-slate-300 text-center font-black text-teal-800">{report.vitalStats.healthCardsTotal}</td>
                  <td className="p-2 text-center font-black text-amber-800">{report.vitalStats.healthCardRevenue.toLocaleString()} ج.م</td>
                </tr>
                <tr>
                  <td className="p-2 border-l border-slate-300 font-semibold">استمارات ساقط قيد مسجلة</td>
                  <td className="p-2 border-l border-slate-300 text-center font-bold">{report.vitalStats.lateRegistrationsTotal}</td>
                  <td className="p-2 text-center text-slate-400">بدون رسوم بالوحدة</td>
                </tr>
                <tr className="bg-teal-50/60 font-black">
                  <td className="p-2 border-l border-slate-300 text-teal-950">إجمالي حصيلة التوريد للخزينة</td>
                  <td className="p-2 border-l border-slate-300 text-center">{report.vitalStats.healthCardsTotal} إيصال</td>
                  <td className="p-2 text-center text-teal-900 text-sm">{report.vitalStats.totalCollectedRevenue.toLocaleString()} ج.م</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* Official Signatures Footer */}
        <div className="mt-12 pt-6 border-t border-slate-300 grid grid-cols-3 gap-6 text-center text-xs font-bold text-slate-900">
          <div>
            <p className="mb-8">كاتب الصحة المختص</p>
            <p className="border-t border-dotted border-slate-400 pt-1 text-slate-600 font-medium">
              {db.officeSettings?.currentEmployee || 'غير محدد'}
            </p>
          </div>
          <div>
            <p className="mb-8">مراقب الصحة / مفتش الصحة</p>
            <p className="border-t border-dotted border-slate-400 pt-1 text-slate-600 font-medium">
              الاسم: ............................
            </p>
          </div>
          <div>
            <p className="mb-8">مدير مكتب الصحة / الإدارة الصحية</p>
            <p className="border-t border-dotted border-slate-400 pt-1 text-slate-600 font-medium">
              خاتم الشعار الرسمي
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
