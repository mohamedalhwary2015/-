import React from 'react';
import {
  Boxes,
  FileCheck2,
  FileSpreadsheet,
  AlertCircle,
  PlusCircle,
  Coins,
  ShieldCheck,
  Calendar,
  CreditCard,
  Layers,
  FileText,
  Building2,
  ArrowUpRight,
  Receipt,
  UserCheck
} from 'lucide-react';
import { DatabaseSchema, STOCK_CATEGORIES, CATEGORY_LABELS } from '../types';
import { calculateTheoreticalStockForCategory } from '../services/stockService';
import { TabType } from './Sidebar';

interface DashboardProps {
  db: DatabaseSchema;
  onNavigate: (tab: TabType) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ db, onNavigate }) => {
  const today = new Date().toISOString().split('T')[0];
  const currentMonthStr = today.substring(0, 7); // YYYY-MM

  const todayDispenses = (db.dispenses || []).filter(d => !d.isDeleted && d.date === today);
  const thisMonthDispenses = (db.dispenses || []).filter(d => !d.isDeleted && d.date.startsWith(currentMonthStr));

  const totalRevenue = (db.dispenses || [])
    .filter(d => !d.isDeleted)
    .reduce((sum, d) => sum + (Number(d.collectedAmount) || 0), 0);

  const thisMonthRevenue = thisMonthDispenses
    .reduce((sum, d) => sum + (Number(d.collectedAmount) || 0), 0);

  const pendingLateRegs = (db.lateRegistrations || []).filter(
    r => !r.isDeleted && (r.status === 'قيد الفحص' || r.status === 'محول للجنة')
  );

  const totalStockItems = STOCK_CATEGORIES.reduce(
    (sum, cat) => sum + (db.stocks[cat]?.currentStock || 0),
    0
  );

  return (
    <div className="space-y-6" id="dashboard-view">
      {/* Top Welcome / ERP Header Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-50 text-teal-700 border border-teal-200">
              الواجهة التشغيلية المركزية ERP
            </span>
            <span className="text-xs text-slate-400 font-mono">
              {today}
            </span>
          </div>
          <h2 className="text-xl font-bold text-slate-900">
            لوحة القيادة والمتابعة التشغيلية - مكتب صحة سفلاق
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 mt-0.5">
            متابعة شاملة وفورية لأرصدة العهدة، صرف البطاقات الصحية، الشهادات الرسمية، وساقط القيد
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            id="btn-quick-health-card"
            onClick={() => onNavigate('health_cards')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <CreditCard className="w-4 h-4" />
            <span>صرف بطاقة صحية</span>
          </button>
          <button
            id="btn-quick-doc"
            onClick={() => onNavigate('documents')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>صرف شهادة رسمية</span>
          </button>
          <button
            id="btn-quick-supply"
            onClick={() => onNavigate('supplies')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs font-semibold shadow-xs transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>إذن توريد جديد</span>
          </button>
          <button
            id="btn-quick-late-reg"
            onClick={() => onNavigate('late_registration')}
            className="flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-semibold transition-all border border-slate-200"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>طلب ساقط قيد</span>
          </button>
        </div>
      </div>

      {/* 4 Primary KPI Summary Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي رصيد العهدة الفعلي</span>
            <div className="w-8 h-8 rounded-xl bg-teal-50 text-teal-700 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {totalStockItems} <span className="text-xs font-normal text-slate-500">مستند/دفتر</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            موزعة على الأصناف الـ 6 المعتمدة
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">معاملات اليوم</span>
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {todayDispenses.length} <span className="text-xs font-normal text-slate-500">معاملة صرف</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            صرف للمواطنين بتاريخ اليوم
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إيرادات الشهر الحالي</span>
            <div className="w-8 h-8 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {thisMonthRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            الإجمالي التراكمي: {totalRevenue.toLocaleString()} ج.م
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">ساقط قيد قيد الفحص</span>
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {pendingLateRegs.length} <span className="text-xs font-normal text-slate-500">طلب مفتوح</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            طلبات قيد المراجعة أو معروضة للجنة
          </p>
        </div>
      </div>

      {/* ERP Core Modules Quick Access Bento Grid */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <h3 className="text-base font-bold text-slate-900 mb-4">
          أقسام منظومة ERP السريعة
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <button
            onClick={() => onNavigate('health_cards')}
            className="p-4 rounded-xl border border-slate-200 hover:border-teal-500 hover:bg-teal-50/20 text-right transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-teal-100/70 text-teal-800 flex items-center justify-center">
                <CreditCard className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-teal-700" />
            </div>
            <div className="font-bold text-sm text-slate-900 group-hover:text-teal-900">
              صرف البطاقات الصحية (ذكور / إناث)
            </div>
            <div className="text-xs text-slate-500 mt-1">
              تسجيل بطاقات المواليد، استخراج بدل فاقد، وقيد المبالغ المحصلة
            </div>
          </button>

          <button
            onClick={() => onNavigate('documents')}
            className="p-4 rounded-xl border border-slate-200 hover:border-blue-500 hover:bg-blue-50/20 text-right transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-blue-100/70 text-blue-800 flex items-center justify-center">
                <FileCheck2 className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-blue-700" />
            </div>
            <div className="font-bold text-sm text-slate-900 group-hover:text-blue-900">
              صرف الشهادات والوثائق الرسمية
            </div>
            <div className="text-xs text-slate-500 mt-1">
              شهادات الميلاد، شهادات الوفاة، وبلاغات قيد المواليد والوفيات
            </div>
          </button>

          <button
            onClick={() => onNavigate('stocks')}
            className="p-4 rounded-xl border border-slate-200 hover:border-emerald-500 hover:bg-emerald-50/20 text-right transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-100/70 text-emerald-800 flex items-center justify-center">
                <Boxes className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-emerald-700" />
            </div>
            <div className="font-bold text-sm text-slate-900 group-hover:text-emerald-900">
              إدارة الأرصدة والتوريدات
            </div>
            <div className="text-xs text-slate-500 mt-1">
              الرصيد الفعلي المحمي، أذون التوريد الواردة، والتسويات المعتمدة
            </div>
          </button>

          <button
            onClick={() => onNavigate('stock_ledger')}
            className="p-4 rounded-xl border border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/20 text-right transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-indigo-100/70 text-indigo-800 flex items-center justify-center">
                <Layers className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-700" />
            </div>
            <div className="font-bold text-sm text-slate-900 group-hover:text-indigo-900">
              سجل حركات المخزون الشامل
            </div>
            <div className="text-xs text-slate-500 mt-1">
              دفتر الأستاذ الرقابي الموحد لكافة حركات التوريد والصرف والتسوية
            </div>
          </button>

          <button
            onClick={() => onNavigate('reports_center')}
            className="p-4 rounded-xl border border-slate-200 hover:border-violet-500 hover:bg-violet-50/20 text-right transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-violet-100/70 text-violet-800 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-violet-700" />
            </div>
            <div className="font-bold text-sm text-slate-900 group-hover:text-violet-900">
              المركز الموحد للتقارير
            </div>
            <div className="text-xs text-slate-500 mt-1">
              التقارير الشهرية، كشوف الإيرادات والخزينة، وسجل المنصرف التفصيلي
            </div>
          </button>

          <button
            onClick={() => onNavigate('late_registration')}
            className="p-4 rounded-xl border border-slate-200 hover:border-amber-500 hover:bg-amber-50/20 text-right transition-all group"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="w-9 h-9 rounded-lg bg-amber-100/70 text-amber-800 flex items-center justify-center">
                <FileSpreadsheet className="w-4 h-4" />
              </div>
              <ArrowUpRight className="w-4 h-4 text-slate-400 group-hover:text-amber-700" />
            </div>
            <div className="font-bold text-sm text-slate-900 group-hover:text-amber-900">
              استمارات وقضايا ساقط القيد
            </div>
            <div className="text-xs text-slate-500 mt-1">
              إدخال ومتابعة استمارات ساقط قيد الميلاد والوفاة وقرارات اللجنة
            </div>
          </button>
        </div>
      </div>

      {/* 6 Official Categories Inventory Cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-base font-bold text-slate-900">
            الأرصدة الفعلية الحالية المحمية
          </h3>
          <button
            onClick={() => onNavigate('stocks')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800"
          >
            عرض سجل التوريدات والتسويات ←
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {STOCK_CATEGORIES.map((cat) => {
            const stock = db.stocks[cat] || { currentStock: 0, openingStock: 0, totalReceived: 0, totalDispensed: 0, damagedOrCancelled: 0 };
            const theoretical = calculateTheoreticalStockForCategory(db, cat);

            return (
              <div
                key={cat}
                id={`card-stock-${cat}`}
                className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <h4 className="text-sm font-bold text-slate-800">
                      {CATEGORY_LABELS[cat]}
                    </h4>
                    {theoretical.isBalanced ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <ShieldCheck className="w-3 h-3" />
                        <span>متطابق</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 border border-amber-300">
                        <AlertCircle className="w-3 h-3" />
                        <span>فارق {theoretical.difference > 0 ? `+${theoretical.difference}` : theoretical.difference}</span>
                      </span>
                    )}
                  </div>

                  {/* Sacred Protected Current Stock */}
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-3xl font-black text-slate-900">
                      {stock.currentStock}
                    </span>
                    <span className="text-xs text-slate-500 font-medium">مستند / دفتر</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 grid grid-cols-3 gap-2 text-center text-xs">
                  <div>
                    <span className="text-slate-400 block text-[10px]">افتتاحي</span>
                    <span className="font-semibold text-slate-700">{stock.openingStock}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">وارد</span>
                    <span className="font-semibold text-emerald-700">+{stock.totalReceived}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[10px]">منصرف</span>
                    <span className="font-semibold text-rose-700">-{stock.totalDispensed}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Activity Table */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-slate-900">
            آخر حركات الصرف والتوريد المسجلة
          </h3>
          <button
            onClick={() => onNavigate('stock_ledger')}
            className="text-xs font-semibold text-teal-700 hover:text-teal-800"
          >
            عرض سجل الحركات الكامل ←
          </button>
        </div>

        {(!db.dispenses || db.dispenses.length === 0) && (!db.supplies || db.supplies.length === 0) ? (
          <div className="text-center py-10 text-slate-400 text-sm">
            لا توجد حركات مسجلة حتى الآن. قاعدة البيانات نظيفة تماماً.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-semibold">
                  <th className="pb-3 pr-2">النوع</th>
                  <th className="pb-3">التاريخ</th>
                  <th className="pb-3">الصنف / المستند</th>
                  <th className="pb-3">البيان / المستفيد</th>
                  <th className="pb-3">الكمية</th>
                  <th className="pb-3">المسؤول</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(db.dispenses || []).slice(0, 5).map((d) => (
                  <tr key={d.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-2">
                      <span className="px-2 py-0.5 rounded-md bg-rose-50 text-rose-700 font-medium text-xs">
                        صرف
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600">{d.date}</td>
                    <td className="py-2.5 font-medium text-slate-800">{CATEGORY_LABELS[d.category]}</td>
                    <td className="py-2.5 text-slate-600">{d.citizenName} {d.childOrDeceasedName ? `(${d.childOrDeceasedName})` : ''}</td>
                    <td className="py-2.5 font-bold text-rose-600">-{d.quantity}</td>
                    <td className="py-2.5 text-slate-500">{d.dispensedBy}</td>
                  </tr>
                ))}
                {(db.supplies || []).slice(0, 3).map((s) => (
                  <tr key={s.id} className="hover:bg-slate-50">
                    <td className="py-2.5 pr-2">
                      <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 font-medium text-xs">
                        وارد
                      </span>
                    </td>
                    <td className="py-2.5 text-slate-600">{s.date}</td>
                    <td className="py-2.5 font-medium text-slate-800">{CATEGORY_LABELS[s.category]}</td>
                    <td className="py-2.5 text-slate-600">إذن رقم: {s.documentNumber} ({s.supplierSource})</td>
                    <td className="py-2.5 font-bold text-emerald-600">+{s.quantity}</td>
                    <td className="py-2.5 text-slate-500">{s.receivedBy}</td>
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
