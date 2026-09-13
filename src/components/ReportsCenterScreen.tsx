import React from 'react';
import {
  CalendarCheck,
  FileText,
  Coins,
  Layers,
  ShieldCheck,
  ArrowUpRight,
  TrendingUp,
  FileSpreadsheet,
  Printer
} from 'lucide-react';
import { DatabaseSchema } from '../types';
import { TabType } from './Sidebar';

interface ReportsCenterScreenProps {
  db: DatabaseSchema;
  onNavigate?: (tab: TabType) => void;
  onSelectReport?: (tab: TabType) => void;
}

export const ReportsCenterScreen: React.FC<ReportsCenterScreenProps> = ({
  db,
  onNavigate,
  onSelectReport
}) => {
  const handleSelect = (tab: TabType) => {
    if (onNavigate) onNavigate(tab);
    if (onSelectReport) onSelectReport(tab);
  };
  const currentMonthDispenses = (db.dispenses || []).filter((d) => !d.isDeleted);
  const totalRevenue = currentMonthDispenses.reduce(
    (sum, d) => sum + (Number(d.collectedAmount) || 0),
    0
  );

  const reports = [
    {
      id: 'monthly_reports',
      title: 'التقرير الإحصائي الشهري الرسمي',
      desc: 'استمارة وزارة الصحة المعتمدة لحركة المواليد والوفيات والبطاقات والأرصدة الدورية',
      icon: CalendarCheck,
      color: 'bg-teal-50 text-teal-700 border-teal-200',
      badge: 'الاستمارة الحكومية'
    },
    {
      id: 'revenue_reports',
      title: 'تقرير الإيرادات والمبالغ المحصلة',
      desc: 'بيان بقسائم السداد وإيصالات 33 ع.ح المحصلة للبطاقات الصحية والمستندات',
      icon: Coins,
      color: 'bg-amber-50 text-amber-700 border-amber-200',
      badge: `${totalRevenue.toLocaleString()} ج.م`
    },
    {
      id: 'item_dispense_reports',
      title: 'سجل المنصرف التفصيلي للمستندات',
      desc: 'بيان تفصيلي بأسماء المواطنين والأرقام القومية والمستندات المصروفة وتواريخها',
      icon: FileText,
      color: 'bg-blue-50 text-blue-700 border-blue-200',
      badge: `${currentMonthDispenses.length} معاملة`
    },
    {
      id: 'stock_ledger',
      title: 'سجل حركات المخزون والعهد الدفترية',
      desc: 'كشف تاريخي لجميع أذون التوريد والصرف والتسويات بحسب الأصناف الستة',
      icon: Layers,
      color: 'bg-purple-50 text-purple-700 border-purple-200',
      badge: 'سجل رقابي'
    },
    {
      id: 'diagnostics',
      title: 'تقرير تدقيق ونزاهة الأرصدة',
      desc: 'فحص مطابقة الرصيد الفعلي المحمي مع الحسابات الدفترية واكتشاف التناقضات',
      icon: ShieldCheck,
      color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      badge: 'تدقيق الأرصدة'
    }
  ];

  return (
    <div className="space-y-6" id="reports-center-view">
      {/* Top Banner */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            المركز الموحد للتقارير والإحصائيات (ERP Reports Hub)
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            منظومة الاستخراج والطباعة المركزية لكافة النماذج والتقارير الإحصائية والمالية بمكتب صحة سفلاق
          </p>
        </div>
      </div>

      {/* Reports Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {reports.map((rep) => {
          const Icon = rep.icon;
          return (
            <div
              key={rep.id}
              className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className={`w-12 h-12 rounded-xl border flex items-center justify-center ${rep.color}`}>
                    <Icon className="w-6 h-6" />
                  </div>
                  <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full">
                    {rep.badge}
                  </span>
                </div>

                <h3 className="text-base font-bold text-slate-900 mb-1">
                  {rep.title}
                </h3>
                <p className="text-xs text-slate-500 leading-relaxed">
                  {rep.desc}
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                <button
                  id={`btn-open-report-${rep.id}`}
                  onClick={() => handleSelect(rep.id as TabType)}
                  className="flex items-center gap-1 text-xs font-bold text-teal-700 hover:text-teal-900 transition-colors"
                >
                  <span>فتح التقرير والطباعة</span>
                  <ArrowUpRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};
