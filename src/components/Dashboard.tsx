import React from 'react';
import {
  Boxes,
  FileCheck2,
  FileSpreadsheet,
  TrendingUp,
  AlertCircle,
  PlusCircle,
  Coins,
  ShieldCheck,
  Calendar
} from 'lucide-react';
import { DatabaseSchema, STOCK_CATEGORIES, CATEGORY_LABELS } from '../types';
import { calculateTheoreticalStockForCategory } from '../services/stockService';

interface DashboardProps {
  db: DatabaseSchema;
  onNavigate: (tab: any) => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ db, onNavigate }) => {
  const today = new Date().toISOString().split('T')[0];

  const todayDispenses = (db.dispenses || []).filter(d => !d.isDeleted && d.date === today);
  const totalRevenue = (db.dispenses || [])
    .filter(d => !d.isDeleted)
    .reduce((sum, d) => sum + (Number(d.collectedAmount) || 0), 0);

  const pendingLateRegs = (db.lateRegistrations || []).filter(
    r => !r.isDeleted && (r.status === 'قيد الفحص' || r.status === 'محول للجنة')
  );

  return (
    <div className="space-y-6" id="dashboard-view">
      {/* Top Welcome / Quick Action Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            لوحة متابعة أرصدة مكتب صحة سفلاق
          </h2>
          <p className="text-sm text-slate-500 mt-1">
            متابعة حركة شهادات الميلاد والوفاة والبطاقات الصحية واستمارات ساقط القيد
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <button
            id="btn-quick-dispense"
            onClick={() => onNavigate('dispense')}
            className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all"
          >
            <FileCheck2 className="w-4 h-4" />
            <span>صرف لمواطن</span>
          </button>
          <button
            id="btn-quick-supply"
            onClick={() => onNavigate('stocks')}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-800 hover:bg-slate-900 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all"
          >
            <PlusCircle className="w-4 h-4" />
            <span>تسجيل توريد</span>
          </button>
          <button
            id="btn-quick-late-reg"
            onClick={() => onNavigate('late_registration')}
            className="flex items-center gap-1.5 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs sm:text-sm font-semibold transition-all border border-slate-200"
          >
            <FileSpreadsheet className="w-4 h-4" />
            <span>ساقط قيد</span>
          </button>
        </div>
      </div>

      {/* 4 Key Metric Badges */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">منصرف اليوم</span>
            <div className="w-8 h-8 rounded-lg bg-teal-50 text-teal-700 flex items-center justify-center">
              <Calendar className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {todayDispenses.length} <span className="text-xs font-normal text-slate-500">معاملة</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            صرف للمواطنين بتاريخ اليوم
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">ساقط قيد قيد الفحص</span>
            <div className="w-8 h-8 rounded-lg bg-indigo-50 text-indigo-700 flex items-center justify-center">
              <FileSpreadsheet className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {pendingLateRegs.length} <span className="text-xs font-normal text-slate-500">طلب</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            طلبات قيد المراجعة أو معروضة للجنة
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي المبالغ المحصلة</span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-700 flex items-center justify-center">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {totalRevenue.toLocaleString()} <span className="text-xs font-normal text-slate-500">ج.م</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            رسوم بطاقات ووثائق مسجلة
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">إجمالي التوريدات الواردة</span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-700 flex items-center justify-center">
              <Boxes className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {(db.supplies || []).filter(s => !s.isDeleted).length} <span className="text-xs font-normal text-slate-500">إذن توريد</span>
          </div>
          <p className="text-[11px] text-slate-400 mt-1">
            من مخازن الإدارة والمديرية
          </p>
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
        <h3 className="text-base font-bold text-slate-900 mb-4">
          آخر حركات الصرف والتوريد المسجلة
        </h3>

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
