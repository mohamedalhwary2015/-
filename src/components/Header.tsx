import React from 'react';
import { PWAInstallButton } from './PWAInstallButton';
import { useOnlineStatus } from '../hooks/useOnlineStatus';
import { SyncStatus } from '../types';
import { 
  Building2, 
  LayoutDashboard, 
  PackagePlus, 
  FileCheck2, 
  FileQuestion, 
  FileSpreadsheet, 
  HardDrive,
  Wifi, 
  WifiOff, 
  Clock,
  BarChart3,
  CalendarCheck2,
  Boxes,
  Globe2,
  CloudCheck,
  CloudOff,
  RefreshCw,
  Menu,
  ChevronLeft,
  Wrench
} from 'lucide-react';

export type ActiveTab = 'dashboard' | 'stock' | 'opening_balances' | 'dispense' | 'late_reg' | 'item_reports' | 'monthly_report' | 'reports' | 'backup';

export const TAB_TITLES: Record<ActiveTab, { title: string; subtitle: string; icon: React.ElementType }> = {
  dashboard: {
    title: 'لوحة المؤشرات والأرصدة',
    subtitle: 'نظرة عامة على حركة المخزن وإحصاءات الصرف',
    icon: LayoutDashboard,
  },
  dispense: {
    title: 'صرف الأرصدة والمستندات',
    subtitle: 'تسجيل صرف شهادات الميلاد والوفاة والبطاقات الصحية للمواطنين',
    icon: FileCheck2,
  },
  stock: {
    title: 'تسجيل وتوريد الأرصدة',
    subtitle: 'إضافة شحنات وأذون إضافة جديدة للأصناف والمستندات',
    icon: PackagePlus,
  },
  opening_balances: {
    title: 'الأرصدة الافتتاحية للمكتب',
    subtitle: 'ضبط رصيد أول المدة الدفتري وتحديث السجلات الأساسية',
    icon: Boxes,
  },
  late_reg: {
    title: 'استمارات ساقط القيد والملاحظات',
    subtitle: 'إدارة استمارات 23 وساقط القيد والملاحظات الرقابية',
    icon: FileQuestion,
  },
  monthly_report: {
    title: 'التقرير والبيان الشهري المعتمد',
    subtitle: 'بيان حركة المخزن الشهري وتوريد الأرصدة والمصروفات',
    icon: CalendarCheck2,
  },
  item_reports: {
    title: 'تقارير صرف الأصناف بالفترة',
    subtitle: 'تقرير تفصيلي لحركة الصرف لكل صنف بالتاريخ والأرقام المسلسلة',
    icon: BarChart3,
  },
  reports: {
    title: 'التقارير المخصصة والإحصائيات',
    subtitle: 'استخراج شيتات إكسيل وإحصاءات متقدمة لأعمال المكتب',
    icon: FileSpreadsheet,
  },
  backup: {
    title: 'النسخ الاحتياطي والأمان',
    subtitle: 'حفظ واسترجاع قاعدة البيانات والتخزين التلقائي عند الاتصال',
    icon: HardDrive,
  },
};

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  totalDispensedToday: number;
  lowStockCount: number;
  onOpenGovModal?: () => void;
  onOpenSyncModal?: () => void;
  onOpenRepairModal?: () => void;
  isOnlineProp?: boolean;
  syncStatus?: SyncStatus;
  isSyncing?: boolean;
  pendingQueueCount?: number;
  onToggleMobileSidebar?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  totalDispensedToday,
  lowStockCount,
  onOpenGovModal,
  onOpenSyncModal,
  onOpenRepairModal,
  isOnlineProp,
  syncStatus = 'synced',
  isSyncing = false,
  pendingQueueCount = 0,
  onToggleMobileSidebar,
}) => {
  const detectedOnline = useOnlineStatus();
  const isOnline = isOnlineProp !== undefined ? isOnlineProp : detectedOnline;
  const todayDate = new Intl.DateTimeFormat('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date());

  const currentTabInfo = TAB_TITLES[activeTab] || TAB_TITLES.dashboard;
  const CurrentIcon = currentTabInfo.icon;

  return (
    <header className="no-print bg-white border-b border-slate-200 shadow-xs sticky top-0 z-30">
      {/* Top Bar: Official Hierarchy & Status */}
      <div className="bg-emerald-900 text-white px-3 md:px-6 py-1.5 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 font-medium text-[11px] md:text-xs">
            <span className="font-bold">جمهورية مصر العربية</span>
            <span className="opacity-60">|</span>
            <span>وزارة الصحة والسكان</span>
            <span className="opacity-60 hidden sm:inline">|</span>
            <span className="hidden sm:inline">مديرية الشؤون الصحية بسوهاج</span>
            <span className="opacity-60 hidden md:inline">|</span>
            <span className="hidden md:inline">الإدارة الصحية بساقلتة</span>
          </div>

          <div className="flex items-center gap-3 text-[11px]">
            <div className="flex items-center gap-1.5 opacity-90 hidden sm:flex">
              <Clock className="w-3.5 h-3.5" />
              <span>{todayDate}</span>
            </div>

            {/* Live Online & Auto-Sync Header Quick Pill */}
            {onOpenSyncModal ? (
              <button
                onClick={onOpenSyncModal}
                className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold cursor-pointer transition shadow-xs ${
                  isSyncing
                    ? 'bg-blue-600 text-white animate-pulse'
                    : !isOnline
                    ? 'bg-amber-600 text-white'
                    : pendingQueueCount > 0
                    ? 'bg-amber-500 text-slate-950 font-black'
                    : 'bg-emerald-800 text-emerald-200 hover:bg-emerald-700'
                }`}
                title="انقر لفتح مركز التحديث والمزامنة وإدارة الطابور"
              >
                {isSyncing ? (
                  <RefreshCw className="w-3 h-3 animate-spin" />
                ) : !isOnline ? (
                  <WifiOff className="w-3 h-3" />
                ) : (
                  <Wifi className="w-3 h-3 text-emerald-400" />
                )}
                <span>
                  {isSyncing
                    ? 'مزامنة جارية...'
                    : !isOnline
                    ? `أوفلاين (محلي${pendingQueueCount > 0 ? ` • ${pendingQueueCount} معلق` : ''})`
                    : pendingQueueCount > 0
                    ? `أونلاين (معلق: ${pendingQueueCount})`
                    : 'أونلاين (متزامن)'}
                </span>
              </button>
            ) : (
              <div className="flex items-center gap-1.5">
                {isOnline ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-800 text-emerald-200 text-[11px]">
                    <Wifi className="w-3 h-3 text-emerald-400" />
                    <span>أونلاين</span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-600 text-white text-[11px] font-bold">
                    <WifiOff className="w-3 h-3 animate-pulse" />
                    <span>أوفلاين (حفظ محلي آمن)</span>
                  </span>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main ERP TopBar: Breadcrumbs & Quick Action Bar */}
      <div className="px-3 md:px-6 py-2.5 flex items-center justify-between gap-3">
        {/* Right side in RTL: Hamburger Menu (mobile) & Current Active Screen Title */}
        <div className="flex items-center gap-3">
          {onToggleMobileSidebar && (
            <button
              onClick={onToggleMobileSidebar}
              className="md:hidden p-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 cursor-pointer transition border border-slate-200"
              aria-label="فتح القائمة الرئيسية"
              title="فتح قائمة المهام والأرصدة"
            >
              <Menu className="w-5 h-5" />
            </button>
          )}

          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 md:w-10 md:h-10 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center justify-center shrink-0 shadow-2xs">
              <CurrentIcon className="w-5 h-5 md:w-5.5 md:h-5.5 text-emerald-700" />
            </div>

            <div>
              {/* ERP Breadcrumb */}
              <div className="flex items-center gap-1.5 text-[11px] text-slate-500 font-medium">
                <span className="hover:text-emerald-700 cursor-pointer" onClick={() => setActiveTab('dashboard')}>
                  مكتب صحة سفلاق
                </span>
                <ChevronLeft className="w-3 h-3 text-slate-400" />
                <span className="text-emerald-700 font-bold">نظام ERP</span>
              </div>

              {/* Active Tab Name */}
              <h1 className="text-base md:text-lg font-black text-slate-900 tracking-tight leading-tight">
                {currentTabInfo.title}
              </h1>
            </div>
          </div>
        </div>

        {/* Left side in RTL: Quick Action Buttons */}
        <div className="flex items-center gap-2">
          {/* Quick Auto-Sync Center Button */}
          {onOpenSyncModal && (
            <button
              id="header-open-sync-modal-btn"
              onClick={onOpenSyncModal}
              className={`hidden sm:inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs transition active:scale-95 cursor-pointer border ${
                isSyncing
                  ? 'bg-blue-50 border-blue-300 text-blue-800'
                  : !isOnline
                  ? 'bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100'
                  : 'bg-emerald-50 border-emerald-300 text-emerald-900 hover:bg-emerald-100'
              }`}
              title="مركز التحديث والتخزين التلقائي عند الاتصال بالإنترنت"
            >
              {isSyncing ? (
                <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
              ) : !isOnline ? (
                <CloudOff className="w-3.5 h-3.5 text-amber-600" />
              ) : (
                <CloudCheck className="w-3.5 h-3.5 text-emerald-600" />
              )}
              <span>
                {isSyncing
                  ? 'مزامنة جارية...'
                  : !isOnline
                  ? 'أوفلاين'
                  : 'تخزين تلقائي نشط'}
              </span>
            </button>
          )}

          {/* Production Data Repair Button (Offline ↔ Online) */}
          {onOpenRepairModal && (
            <button
              id="header-open-repair-modal-btn"
              onClick={onOpenRepairModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-black shadow-2xs transition active:scale-95 cursor-pointer border bg-amber-50 hover:bg-amber-100 border-amber-300 text-amber-900"
              title="مركز استعادة وتصحيح بيانات الإنتاج ومطابقة نسخة Offline"
            >
              <Wrench className="w-3.5 h-3.5 text-amber-700" />
              <span className="hidden lg:inline">تصحيح الإنتاج (Offline)</span>
            </button>
          )}

          {/* Mechanization System Direct Button */}
          {onOpenGovModal && (
            <button
              id="header-open-gov-modal-btn"
              onClick={onOpenGovModal}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-black shadow-2xs transition active:scale-95 cursor-pointer border border-blue-600"
              title="الانتقال السريع لمنظومة الميكنة الرسمية (10.1.80.50) وتجهيز شيتات المطابقة"
            >
              <Globe2 className="w-3.5 h-3.5 text-blue-200" />
              <span className="hidden md:inline">منظومة الميكنة (10.1.80.50)</span>
              <span className="md:hidden">10.1.80.50</span>
            </button>
          )}

          {/* Low Stock Warning Badge */}
          {lowStockCount > 0 && (
            <button
              onClick={() => setActiveTab('stock')}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-amber-50 text-amber-800 border border-amber-300 text-xs font-bold hover:bg-amber-100 transition cursor-pointer shadow-2xs"
              title="توجد أصناف وصلت لحد إعادة الطلب، انقر للعرض والتوريد"
            >
              <span className="w-2 h-2 rounded-full bg-amber-500 animate-ping" />
              <span>{lowStockCount} منخفض</span>
            </button>
          )}

          <PWAInstallButton />
        </div>
      </div>
    </header>
  );
};
