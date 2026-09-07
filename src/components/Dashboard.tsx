import React from 'react';
import { AppDatabase, DispenseRecord, StockCategory, StockItem } from '../types';
import { 
  Baby, 
  FileText, 
  HeartCrack, 
  ShieldAlert, 
  CheckCircle2, 
  ArrowUpRight, 
  PlusCircle, 
  Printer, 
  Calendar,
  AlertTriangle,
  UserCheck,
  FileSpreadsheet,
  HardDrive,
  BarChart3,
  CalendarCheck2,
  Boxes,
  Globe2
} from 'lucide-react';
import { ActiveTab } from './Header';

interface DashboardProps {
  db: AppDatabase;
  setActiveTab: (tab: ActiveTab) => void;
  onSelectPrintRecord: (record: DispenseRecord) => void;
  onOpenGovModal?: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({
  db,
  setActiveTab,
  onSelectPrintRecord,
  onOpenGovModal,
}) => {
  const stockList = Object.values(db.stocks) as StockItem[];
  
  // Calculations
  const todayStr = new Date().toISOString().split('T')[0];
  const todayDispenses = db.dispenseRecords.filter(r => r.date === todayStr);
  const pendingLateRegs = db.lateRegistrations.filter(r => r.status !== 'approved' && r.status !== 'rejected');
  
  const totalRemainingStock = stockList.reduce((acc, curr) => acc + curr.currentStock, 0);
  const totalDispensedAllTime = stockList.reduce((acc, curr) => acc + curr.totalDispensed, 0);

  const getStockMeta = (cat: StockCategory) => {
    switch (cat) {
      case 'birth_certificates':
        return {
          icon: FileText,
          bg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
          accent: 'bg-emerald-600',
          badgeText: 'مواليد',
        };
      case 'birth_notifications':
        return {
          icon: Baby,
          bg: 'bg-teal-50 text-teal-800 border-teal-200',
          accent: 'bg-teal-600',
          badgeText: 'إخطار ميلاد',
        };
      case 'death_certificates':
        return {
          icon: HeartCrack,
          bg: 'bg-slate-100 text-slate-800 border-slate-300',
          accent: 'bg-slate-700',
          badgeText: 'وفيات',
        };
      case 'death_notifications':
        return {
          icon: FileText,
          bg: 'bg-zinc-50 text-zinc-800 border-zinc-300',
          accent: 'bg-zinc-600',
          badgeText: 'إخطار وفاة',
        };
      case 'health_cards_male':
        return {
          icon: UserCheck,
          bg: 'bg-blue-50 text-blue-900 border-blue-200',
          accent: 'bg-blue-600',
          badgeText: 'ذكور (أزرق)',
        };
      case 'health_cards_female':
        return {
          icon: UserCheck,
          bg: 'bg-pink-50 text-pink-900 border-pink-200',
          accent: 'bg-pink-600',
          badgeText: 'إناث (وردي)',
        };
      case 'late_reg_under_year':
        return {
          icon: FileSpreadsheet,
          bg: 'bg-amber-50 text-amber-900 border-amber-200',
          accent: 'bg-amber-600',
          badgeText: 'ساقط قيد < عام',
        };
      case 'late_reg_over_year':
        return {
          icon: FileSpreadsheet,
          bg: 'bg-orange-50 text-orange-900 border-orange-200',
          accent: 'bg-orange-600',
          badgeText: 'ساقط قيد > عام',
        };
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner with Quick Actions */}
      <div className="bg-gradient-to-l from-emerald-800 via-emerald-700 to-teal-800 rounded-2xl p-5 md:p-6 text-white shadow-md">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 text-xs font-semibold backdrop-blur-xs">
              <span>مركز ساقلتة - محافظة سوهاج</span>
              <span>•</span>
              <span>نظام العمل غير المتصل (Offline Ready)</span>
            </div>
            <h2 className="text-xl md:text-2xl font-black">
              أهلاً بكم في منظومة مكتب صحة سفلاق
            </h2>
            <p className="text-xs md:text-sm text-emerald-100 max-w-2xl leading-relaxed">
              متابعة مباشرة لأرصدة شهادات وبلاغات الميلاد والوفاة والبطاقات الصحية، وصرف المستندات الرسمية فورياً، مع توثيق كامل لاستمارات ساقط القيد.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              id="dashboard-quick-dispense-btn"
              onClick={() => setActiveTab('dispense')}
              className="flex items-center gap-2 px-4 py-2.5 bg-white text-emerald-900 hover:bg-emerald-50 rounded-xl text-xs md:text-sm font-bold shadow-md transition active:scale-95 cursor-pointer"
            >
              <PlusCircle className="w-4 h-4 text-emerald-700" />
              <span>صرف مستند جديد</span>
            </button>

            <button
              id="dashboard-quick-stock-btn"
              onClick={() => setActiveTab('stock')}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-900/60 hover:bg-emerald-900/80 text-white rounded-xl text-xs md:text-sm font-semibold border border-white/20 transition cursor-pointer"
            >
              <ArrowUpRight className="w-4 h-4" />
              <span>تسجيل توريد رصيد</span>
            </button>

            <button
              id="dashboard-quick-opening-balances-btn"
              onClick={() => setActiveTab('opening_balances')}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs md:text-sm font-bold border border-white/20 transition cursor-pointer shadow-xs"
            >
              <Boxes className="w-4 h-4 text-emerald-200" />
              <span>الأرصدة الافتتاحية</span>
            </button>

            <button
              id="dashboard-quick-monthly-report-btn"
              onClick={() => setActiveTab('monthly_report')}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-800 hover:bg-emerald-700 text-white rounded-xl text-xs md:text-sm font-bold border border-white/20 transition cursor-pointer shadow-xs"
            >
              <CalendarCheck2 className="w-4 h-4 text-emerald-200" />
              <span>التقرير الشهري</span>
            </button>

            <button
              id="dashboard-quick-item-reports-btn"
              onClick={() => setActiveTab('item_reports')}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-900/60 hover:bg-emerald-900/80 text-white rounded-xl text-xs md:text-sm font-semibold border border-white/20 transition cursor-pointer"
            >
              <BarChart3 className="w-4 h-4" />
              <span>تقارير صرف الأصناف بالفترة</span>
            </button>

            <button
              id="dashboard-quick-reports-btn"
              onClick={() => setActiveTab('reports')}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-900/40 hover:bg-emerald-900/70 text-white rounded-xl text-xs md:text-sm font-semibold border border-white/20 transition cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4" />
              <span>التقارير المخصصة</span>
            </button>

            <button
              id="dashboard-quick-backup-btn"
              onClick={() => setActiveTab('backup')}
              className="flex items-center gap-2 px-3.5 py-2.5 bg-emerald-900/40 hover:bg-emerald-900/70 text-white rounded-xl text-xs md:text-sm font-semibold border border-white/20 transition cursor-pointer"
            >
              <HardDrive className="w-4 h-4" />
              <span>النسخ الاحتياطي</span>
            </button>

            {onOpenGovModal && (
              <button
                id="dashboard-quick-gov-btn"
                onClick={onOpenGovModal}
                className="flex items-center gap-2 px-3.5 py-2.5 bg-blue-600 hover:bg-blue-500 text-white rounded-xl text-xs md:text-sm font-black border border-blue-400 transition cursor-pointer shadow-sm"
              >
                <Globe2 className="w-4 h-4 text-blue-100 animate-pulse" />
                <span>منظومة الميكنة (10.1.80.50)</span>
              </button>
            )}
          </div>
        </div>

        {/* Quick Mini Metrics */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-6 pt-5 border-t border-white/15 text-center sm:text-right">
          <div>
            <span className="block text-[11px] text-emerald-200">الرصيد المتاح حالياً</span>
            <span className="text-xl md:text-2xl font-black text-white">{totalRemainingStock.toLocaleString('ar-EG')}</span>
            <span className="text-[10px] text-emerald-200"> مستند وبطاقة</span>
          </div>
          <div>
            <span className="block text-[11px] text-emerald-200">منصرف اليوم</span>
            <span className="text-xl md:text-2xl font-black text-white">{todayDispenses.length.toLocaleString('ar-EG')}</span>
            <span className="text-[10px] text-emerald-200"> عملية صرف</span>
          </div>
          <div>
            <span className="block text-[11px] text-emerald-200">ساقط القيد قيد المتابعة</span>
            <span className="text-xl md:text-2xl font-black text-white">{pendingLateRegs.length.toLocaleString('ar-EG')}</span>
            <span className="text-[10px] text-emerald-200"> استمارة معلقة</span>
          </div>
          <div>
            <span className="block text-[11px] text-emerald-200">إجمالي المنصرف التراكمي</span>
            <span className="text-xl md:text-2xl font-black text-white">{totalDispensedAllTime.toLocaleString('ar-EG')}</span>
            <span className="text-[10px] text-emerald-200"> مستند رسمي</span>
          </div>
        </div>
      </div>

      {/* Quick Mechanization System (10.1.80.50) Banner */}
      {onOpenGovModal && (
        <div className="bg-gradient-to-l from-blue-900 to-indigo-900 text-white rounded-2xl p-4 md:p-5 shadow-sm border border-blue-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-blue-800/80 border border-blue-600 flex items-center justify-center shrink-0">
              <Globe2 className="w-6 h-6 text-blue-200" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h4 className="font-bold text-base text-white">منظومة الميكنة الرسمية (10.1.80.50)</h4>
                <span className="px-2 py-0.5 rounded-md bg-blue-500/30 text-blue-200 font-mono text-xs font-bold border border-blue-400/30">
                  http://10.1.80.50
                </span>
              </div>
              <p className="text-xs text-blue-200/90 mt-0.5">
                تجهيز شيتات المطابقة بين الدفاتر الورقية والمنظومة الإلكترونية للمواليد والوفيات، مع زر الانتقال السريع للموقع الحكومي.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={onOpenGovModal}
              className="w-full sm:w-auto px-4 py-2 bg-white text-blue-900 hover:bg-blue-50 rounded-xl text-xs font-black shadow-md transition cursor-pointer flex items-center justify-center gap-2 active:scale-95"
            >
              <FileSpreadsheet className="w-4 h-4 text-blue-700" />
              <span>فتح شيتات المطابقة ومنظومة الميكنة</span>
            </button>
          </div>
        </div>
      )}

      {/* 6 Stock Items Cards */}
      <div>
        <div className="flex items-center justify-between mb-3.5">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">
              أرصدة العُهد والمستندات الرسمية بمكتب صحة سفلاق
            </h3>
            <span className="text-xs text-slate-500 font-medium">({stockList.length} بنود أساسية)</span>
          </div>
          <button
            onClick={() => setActiveTab('stock')}
            className="text-xs font-bold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 cursor-pointer"
          >
            <span>إدارة وتوريد الأرصدة</span>
            <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {stockList.map((item) => {
            const meta = getStockMeta(item.id);
            const Icon = meta.icon;
            const isLow = item.currentStock <= item.minThreshold;
            const maxCap = Math.max(item.totalReceived, item.currentStock + item.totalDispensed, 1);
            const percent = Math.min(100, Math.round((item.currentStock / maxCap) * 100));

            return (
              <div
                key={item.id}
                id={`stock-card-${item.id}`}
                className={`rounded-2xl p-4.5 bg-white border shadow-xs transition hover:shadow-md ${
                  isLow ? 'border-amber-300 ring-1 ring-amber-200' : 'border-slate-200'
                }`}
              >
                <div className="flex items-start justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2.5">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${meta.bg}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-900 leading-tight">
                        {item.name}
                      </h4>
                      <span className="text-[11px] text-slate-400 font-medium">
                        {item.unit}
                      </span>
                    </div>
                  </div>

                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-bold border ${meta.bg}`}>
                    {meta.badgeText}
                  </span>
                </div>

                {/* Stock Numbers */}
                <div className="flex items-baseline justify-between py-2 border-y border-slate-100 my-2.5">
                  <div>
                    <span className="text-xs text-slate-500 font-medium">الرصيد المتاح: </span>
                    <span className={`text-2xl font-black ${isLow ? 'text-amber-700' : 'text-emerald-700'}`}>
                      {item.currentStock}
                    </span>
                  </div>

                  <div className="text-left text-xs text-slate-500 space-y-0.5">
                    <div>افتتاحي: <span className="font-semibold text-slate-700">{item.openingStock ?? 0}</span></div>
                    <div>وارد: <span className="font-semibold text-slate-700">{item.totalReceived}</span> | منصرف: <span className="font-semibold text-slate-700">{item.totalDispensed}</span></div>
                  </div>
                </div>

                {/* Progress & Alert */}
                <div className="space-y-1.5 pt-1">
                  <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                    <span>نسبة المتبقي من الوارد</span>
                    <span>{percent}%</span>
                  </div>
                  <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        isLow ? 'bg-amber-500' : meta.accent
                      }`}
                      style={{ width: `${percent}%` }}
                    />
                  </div>

                  {isLow && (
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 px-2 py-1 rounded-md mt-2 border border-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                      <span>تنبيه: الرصيد قارب على النفاد (الحد الأدنى: {item.minThreshold})</span>
                    </div>
                  )}
                </div>

                {/* Card Action */}
                <div className="mt-3.5 pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                  <button
                    onClick={() => setActiveTab('dispense')}
                    className="text-emerald-700 hover:text-emerald-800 font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <span>صرف من هذا الرصيد</span>
                    <ArrowUpRight className="w-3.5 h-3.5" />
                  </button>

                  <button
                    onClick={() => setActiveTab('stock')}
                    className="text-slate-500 hover:text-slate-800 font-medium cursor-pointer"
                  >
                    توريد دفعة
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recent Dispensed Table */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-700" />
            <h3 className="font-bold text-base text-slate-900">
              آخر المعاملات المنصرفة من مكتب الصحة
            </h3>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setActiveTab('dispense')}
              className="text-xs font-bold text-emerald-700 hover:underline cursor-pointer"
            >
              عرض سجل الصرف بالكامل ({db.dispenseRecords.length})
            </button>
          </div>
        </div>

        {db.dispenseRecords.length === 0 ? (
          <div className="py-8 text-center text-slate-400 text-sm">
            لا توجد أية عمليات صرف مسجلة حتى الآن.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-right text-xs md:text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50/75">
                  <th className="py-2.5 px-3">التاريخ والوقت</th>
                  <th className="py-2.5 px-3">اسم المستفيد (الطفل / المتوفى)</th>
                  <th className="py-2.5 px-3">النوع</th>
                  <th className="py-2.5 px-3">رقم الشهادة</th>
                  <th className="py-2.5 px-3">رقم إيصال البطاقة</th>
                  <th className="py-2.5 px-3">اسم المبلّغ</th>
                  <th className="py-2.5 px-3 text-center">إيصال الصرف</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {db.dispenseRecords.slice(0, 5).map((record) => (
                  <tr key={record.id} className="hover:bg-slate-50/80 transition">
                    <td className="py-3 px-3 font-mono text-xs text-slate-600 whitespace-nowrap">
                      {record.date} {record.time}
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900 whitespace-nowrap">
                      {record.beneficiaryName}
                    </td>
                    <td className="py-3 px-3 whitespace-nowrap">
                      {record.dispenseEventType ? (
                        <span className="px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-800 font-semibold text-xs border border-emerald-200">
                          {record.dispenseEventType}
                        </span>
                      ) : record.dispenseType === 'birth_male' ? (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-semibold text-xs border border-blue-200">
                          مولود ذكر
                        </span>
                      ) : record.dispenseType === 'birth_female' ? (
                        <span className="px-2 py-0.5 rounded-md bg-pink-50 text-pink-800 font-semibold text-xs border border-pink-200">
                          مولود أنثى
                        </span>
                      ) : record.dispenseType === 'health_card_male' ? (
                        <span className="px-2 py-0.5 rounded-md bg-blue-50 text-blue-800 font-semibold text-xs border border-blue-200">
                          بطاقة صحية ذكور
                        </span>
                      ) : record.dispenseType === 'health_card_female' ? (
                        <span className="px-2 py-0.5 rounded-md bg-pink-50 text-pink-800 font-semibold text-xs border border-pink-200">
                          بطاقة صحية إناث
                        </span>
                      ) : record.dispenseType === 'death' ? (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-800 font-semibold text-xs border border-slate-300">
                          واقعة وفاة
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-800 font-semibold text-xs">
                          صرف مستندات
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-emerald-800 whitespace-nowrap">
                      {record.certificateNumber || '—'}
                    </td>
                    <td className="py-3 px-3 font-mono text-slate-700 whitespace-nowrap">
                      {record.healthCardReceiptNumber || '—'}
                    </td>
                    <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                      {record.reporterName} ({record.reporterRelation})
                    </td>
                    <td className="py-3 px-3 text-center whitespace-nowrap">
                      <button
                        onClick={() => onSelectPrintRecord(record)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-100 hover:bg-emerald-50 text-slate-700 hover:text-emerald-800 border border-slate-200 text-xs font-semibold transition cursor-pointer"
                        title="طباعة إيصال الصرف الرسمي"
                      >
                        <Printer className="w-3.5 h-3.5 text-emerald-700" />
                        <span>طباعة</span>
                      </button>
                    </td>
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
