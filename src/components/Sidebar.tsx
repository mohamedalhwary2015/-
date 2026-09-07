import React from 'react';
import { ActiveTab } from './Header';
import { SyncStatus } from '../types';
import {
  Building2,
  LayoutDashboard,
  PackagePlus,
  FileCheck2,
  FileQuestion,
  FileSpreadsheet,
  HardDrive,
  BarChart3,
  CalendarCheck2,
  Boxes,
  Globe2,
  CloudCheck,
  CloudOff,
  RefreshCw,
  Wifi,
  WifiOff,
  ChevronRight,
  ChevronLeft,
  X,
  Layers,
  ShieldCheck,
  Sparkles,
  AlertTriangle,
  Wrench
} from 'lucide-react';

interface SidebarProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  totalDispensedToday: number;
  lowStockCount: number;
  onOpenGovModal?: () => void;
  onOpenSyncModal?: () => void;
  onOpenRepairModal?: () => void;
  isOnline?: boolean;
  syncStatus?: SyncStatus;
  isSyncing?: boolean;
  pendingQueueCount?: number;
  isOpenMobile: boolean;
  onCloseMobile: () => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
}

interface NavItem {
  id: ActiveTab;
  label: string;
  shortLabel: string;
  icon: React.ElementType;
  badge?: number | string | null;
  badgeColor?: string;
  description?: string;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeTab,
  setActiveTab,
  totalDispensedToday,
  lowStockCount,
  onOpenGovModal,
  onOpenSyncModal,
  onOpenRepairModal,
  isOnline = true,
  syncStatus = 'synced',
  isSyncing = false,
  pendingQueueCount = 0,
  isOpenMobile,
  onCloseMobile,
  isCollapsed,
  onToggleCollapse,
}) => {
  const handleNavClick = (tabId: ActiveTab) => {
    setActiveTab(tabId);
    if (isOpenMobile) {
      onCloseMobile();
    }
  };

  const navOperations: NavItem[] = [
    {
      id: 'dashboard',
      label: 'لوحة المؤشرات والأرصدة',
      shortLabel: 'المؤشرات',
      icon: LayoutDashboard,
      description: 'نظرة عامة ورسوم بيانية',
    },
    {
      id: 'dispense',
      label: 'صرف الأرصدة والمستندات',
      shortLabel: 'صرف المستندات',
      icon: FileCheck2,
      badge: totalDispensedToday > 0 ? `${totalDispensedToday} اليوم` : null,
      badgeColor: 'bg-emerald-500 text-white',
      description: 'تسجيل صرف شهادات وبطاقات',
    },
    {
      id: 'stock',
      label: 'تسجيل وتوريد الأرصدة',
      shortLabel: 'التوريدات والمخزون',
      icon: PackagePlus,
      badge: lowStockCount > 0 ? `${lowStockCount} منخفض` : null,
      badgeColor: 'bg-amber-500 text-slate-950 font-black animate-pulse',
      description: 'إضافة شحنات وأذون الإضافة',
    },
    {
      id: 'opening_balances',
      label: 'الأرصدة الافتتاحية للمكتب',
      shortLabel: 'الأرصدة الافتتاحية',
      icon: Boxes,
      description: 'ضبط رصيد أول المدة الدفتري',
    },
    {
      id: 'late_reg',
      label: 'استمارات ساقط القيد والملاحظات',
      shortLabel: 'ساقط القيد',
      icon: FileQuestion,
      description: 'استمارات 23 وساقط القيد',
    },
  ];

  const navReports: NavItem[] = [
    {
      id: 'monthly_report',
      label: 'التقرير والبيان الشهري',
      shortLabel: 'البيان الشهري',
      icon: CalendarCheck2,
      description: 'بيان حركة المخزن المعتمد',
    },
    {
      id: 'item_reports',
      label: 'تقارير صرف الأصناف بالفترة',
      shortLabel: 'صرف الأصناف',
      icon: BarChart3,
      description: 'تتبع حركة كل صنف تفصيلياً',
    },
    {
      id: 'reports',
      label: 'التقارير المخصصة والإحصائيات',
      shortLabel: 'إحصائيات متقدمة',
      icon: FileSpreadsheet,
      description: 'تصدير شيتات وإحصائيات متنوعة',
    },
  ];

  const navSystem: NavItem[] = [
    {
      id: 'backup',
      label: 'النسخ الاحتياطي والأمان',
      shortLabel: 'النسخ والأمان',
      icon: HardDrive,
      description: 'حفظ واسترجاع قاعدة البيانات',
    },
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          onClick={onCloseMobile}
          className="fixed inset-0 z-40 bg-slate-950/60 backdrop-blur-xs md:hidden no-print transition-opacity"
          aria-hidden="true"
        />
      )}

      {/* Main ERP Sidebar Container - Fixed on the Right side */}
      <aside
        id="erp-main-sidebar"
        className={`no-print bg-gradient-to-b from-slate-950 via-slate-900 to-slate-950 text-slate-100 flex flex-col border-l border-slate-800 shadow-2xl transition-all duration-300 z-50
          /* Mobile Drawer styles */
          fixed top-0 right-0 bottom-0 h-full
          ${isOpenMobile ? 'translate-x-0' : 'translate-x-full md:translate-x-0'}
          /* Desktop Sticky / Responsive width */
          md:sticky md:top-0 md:h-screen md:shrink-0
          ${isCollapsed ? 'md:w-20' : 'w-72 md:w-68 lg:w-72'}
        `}
      >
        {/* Top Office & ERP Branding Header */}
        <div className="p-4 border-b border-slate-800/80 shrink-0 bg-slate-950/40 relative">
          {/* Mobile Close Button */}
          <button
            onClick={onCloseMobile}
            className="md:hidden absolute top-3.5 left-3.5 p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition cursor-pointer"
            aria-label="إغلاق القائمة"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-emerald-500 to-teal-700 text-white flex items-center justify-center shadow-lg shadow-emerald-900/40 border border-emerald-400/30 shrink-0">
              <Building2 className="w-6 h-6" />
            </div>

            {!isCollapsed && (
              <div className="overflow-hidden">
                <div className="flex items-center gap-1.5">
                  <h2 className="text-base font-black text-white tracking-tight truncate">
                    مكتب صحة سفلاق
                  </h2>
                  <span className="px-1.5 py-0.2 rounded text-[9px] font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    ERP
                  </span>
                </div>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  إدارة ساقلتة الصحية • سوهاج
                </p>
              </div>
            )}
          </div>

          {!isCollapsed && (
            <div className="mt-3 pt-2.5 border-t border-slate-800/60 flex items-center justify-between text-[11px] text-slate-400">
              <span className="flex items-center gap-1 font-semibold text-emerald-400">
                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                منظومة متكاملة
              </span>
              <span className="font-mono text-[10px] text-slate-500 font-bold bg-slate-800/60 px-2 py-0.5 rounded-md">
                v1.0.1 معتمد
              </span>
            </div>
          )}
        </div>

        {/* Scrollable Navigation Menu List */}
        <div className="flex-1 overflow-y-auto px-2.5 py-3 space-y-4 text-xs font-semibold select-none">
          {/* SECTION 1: Operations & Inventory */}
          <div className="space-y-1">
            {!isCollapsed && (
              <div className="px-3 py-1 text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>العمليات والأرصدة</span>
                <Layers className="w-3 h-3 text-slate-500" />
              </div>
            )}

            {navOperations.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`erp-nav-${item.id}`}
                  onClick={() => handleNavClick(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full group flex items-center rounded-xl transition-all cursor-pointer relative ${
                    isCollapsed
                      ? 'justify-center p-3'
                      : 'gap-3 px-3.5 py-2.5 text-right'
                  } ${
                    isActive
                      ? 'bg-gradient-to-l from-emerald-600 to-teal-700 text-white font-black shadow-md shadow-emerald-950/60 border border-emerald-400/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  <div
                    className={`shrink-0 flex items-center justify-center rounded-lg ${
                      isCollapsed ? 'w-8 h-8' : 'w-7 h-7'
                    } ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-400 group-hover:text-emerald-400 transition-colors'
                    }`}
                  >
                    <Icon className={isCollapsed ? 'w-5 h-5' : 'w-4 h-4'} />
                  </div>

                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate text-xs font-bold leading-tight">
                          {item.label}
                        </span>
                        {item.badge && (
                          <span
                            className={`px-1.5 py-0.5 rounded-full text-[10px] font-mono font-black shrink-0 ${
                              item.badgeColor || 'bg-slate-700 text-slate-200'
                            }`}
                          >
                            {item.badge}
                          </span>
                        )}
                      </div>
                      {item.description && (
                        <span
                          className={`block text-[10px] truncate leading-tight mt-0.5 ${
                            isActive ? 'text-emerald-100/90' : 'text-slate-500'
                          }`}
                        >
                          {item.description}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Active Indicator Line on Right side */}
                  {isActive && (
                    <span className="absolute -right-2.5 top-1.5 bottom-1.5 w-1 rounded-l-full bg-emerald-400 shadow-sm" />
                  )}
                </button>
              );
            })}
          </div>

          {/* SECTION 2: Reports & Statistics */}
          <div className="space-y-1 pt-2 border-t border-slate-800/60">
            {!isCollapsed && (
              <div className="px-3 py-1 text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>التقارير والإحصائيات</span>
                <BarChart3 className="w-3 h-3 text-slate-500" />
              </div>
            )}

            {navReports.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`erp-nav-${item.id}`}
                  onClick={() => handleNavClick(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full group flex items-center rounded-xl transition-all cursor-pointer relative ${
                    isCollapsed
                      ? 'justify-center p-3'
                      : 'gap-3 px-3.5 py-2.5 text-right'
                  } ${
                    isActive
                      ? 'bg-gradient-to-l from-emerald-600 to-teal-700 text-white font-black shadow-md shadow-emerald-950/60 border border-emerald-400/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  <div
                    className={`shrink-0 flex items-center justify-center rounded-lg ${
                      isCollapsed ? 'w-8 h-8' : 'w-7 h-7'
                    } ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-400 group-hover:text-emerald-400 transition-colors'
                    }`}
                  >
                    <Icon className={isCollapsed ? 'w-5 h-5' : 'w-4 h-4'} />
                  </div>

                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="truncate text-xs font-bold leading-tight">
                          {item.label}
                        </span>
                      </div>
                      {item.description && (
                        <span
                          className={`block text-[10px] truncate leading-tight mt-0.5 ${
                            isActive ? 'text-emerald-100/90' : 'text-slate-500'
                          }`}
                        >
                          {item.description}
                        </span>
                      )}
                    </div>
                  )}

                  {isActive && (
                    <span className="absolute -right-2.5 top-1.5 bottom-1.5 w-1 rounded-l-full bg-emerald-400 shadow-sm" />
                  )}
                </button>
              );
            })}
          </div>

          {/* SECTION 3: External Mechanization & Cloud Storage */}
          <div className="space-y-1 pt-2 border-t border-slate-800/60">
            {!isCollapsed && (
              <div className="px-3 py-1 text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>الربط والمزامنة السحابية</span>
                <Globe2 className="w-3 h-3 text-slate-500" />
              </div>
            )}

            {/* Gov Mechanization System Button */}
            {onOpenGovModal && (
              <button
                id="erp-nav-gov-system"
                onClick={() => {
                  onOpenGovModal();
                  if (isOpenMobile) onCloseMobile();
                }}
                title={isCollapsed ? 'منظومة الميكنة الرسمية (10.1.80.50)' : undefined}
                className={`w-full group flex items-center rounded-xl transition-all cursor-pointer border border-blue-500/20 bg-blue-950/40 hover:bg-blue-900/60 text-blue-200 hover:text-white ${
                  isCollapsed
                    ? 'justify-center p-3'
                    : 'gap-3 px-3.5 py-2.5 text-right'
                }`}
              >
                <div
                  className={`shrink-0 flex items-center justify-center rounded-lg ${
                    isCollapsed ? 'w-8 h-8' : 'w-7 h-7'
                  } text-blue-400 group-hover:text-blue-200`}
                >
                  <Globe2 className={isCollapsed ? 'w-5 h-5' : 'w-4 h-4'} />
                </div>

                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <span className="truncate text-xs font-bold block leading-tight text-blue-200 group-hover:text-white">
                      منظومة الميكنة (10.1.80.50)
                    </span>
                    <span className="text-[10px] text-blue-300/80 block leading-tight mt-0.5 truncate">
                      شيتات مطابقة المواليد والوفيات
                    </span>
                  </div>
                )}
              </button>
            )}

            {/* Auto-Sync Center Quick Button */}
            {onOpenSyncModal && (
              <button
                id="erp-nav-auto-sync"
                onClick={() => {
                  onOpenSyncModal();
                  if (isOpenMobile) onCloseMobile();
                }}
                title={isCollapsed ? 'مركز التحديث والتخزين التلقائي' : undefined}
                className={`w-full group flex items-center rounded-xl transition-all cursor-pointer border border-emerald-500/20 bg-emerald-950/30 hover:bg-emerald-900/50 text-emerald-200 hover:text-white ${
                  isCollapsed
                    ? 'justify-center p-3'
                    : 'gap-3 px-3.5 py-2.5 text-right'
                }`}
              >
                <div
                  className={`shrink-0 flex items-center justify-center rounded-lg ${
                    isCollapsed ? 'w-8 h-8' : 'w-7 h-7'
                  } ${
                    isSyncing
                      ? 'text-blue-400'
                      : !isOnline
                      ? 'text-amber-400'
                      : 'text-emerald-400 group-hover:text-emerald-200'
                  }`}
                >
                  {isSyncing ? (
                    <RefreshCw className="w-4 h-4 animate-spin" />
                  ) : !isOnline ? (
                    <CloudOff className="w-4 h-4" />
                  ) : (
                    <CloudCheck className="w-4 h-4" />
                  )}
                </div>

                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between">
                      <span className="truncate text-xs font-bold block leading-tight">
                        التخزين والمزامنة السحابية
                      </span>
                      <span
                        className={`w-2 h-2 rounded-full ${
                          isSyncing
                            ? 'bg-blue-400 animate-ping'
                            : isOnline
                            ? 'bg-emerald-400'
                            : 'bg-amber-400'
                        }`}
                      />
                    </div>
                    <span className="text-[10px] text-emerald-300/70 block leading-tight mt-0.5 truncate">
                      {isSyncing
                        ? 'جارٍ المزامنة والتخزين...'
                        : isOnline
                        ? 'تخزين فوري وتحديث تلقائي'
                        : 'أوفلاين (حفظ محلي دائم)'}
                    </span>
                  </div>
                )}
              </button>
            )}
          </div>

          {/* SECTION 4: System & Security */}
          <div className="space-y-1 pt-2 border-t border-slate-800/60">
            {!isCollapsed && (
              <div className="px-3 py-1 text-[11px] font-black text-slate-400 uppercase tracking-wider flex items-center justify-between">
                <span>إدارة النظام والأمان</span>
                <ShieldCheck className="w-3 h-3 text-slate-500" />
              </div>
            )}

            {navSystem.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  id={`erp-nav-${item.id}`}
                  onClick={() => handleNavClick(item.id)}
                  title={isCollapsed ? item.label : undefined}
                  className={`w-full group flex items-center rounded-xl transition-all cursor-pointer relative ${
                    isCollapsed
                      ? 'justify-center p-3'
                      : 'gap-3 px-3.5 py-2.5 text-right'
                  } ${
                    isActive
                      ? 'bg-gradient-to-l from-emerald-600 to-teal-700 text-white font-black shadow-md shadow-emerald-950/60 border border-emerald-400/30'
                      : 'text-slate-300 hover:text-white hover:bg-slate-800/70 border border-transparent'
                  }`}
                >
                  <div
                    className={`shrink-0 flex items-center justify-center rounded-lg ${
                      isCollapsed ? 'w-8 h-8' : 'w-7 h-7'
                    } ${
                      isActive
                        ? 'text-white'
                        : 'text-slate-400 group-hover:text-emerald-400 transition-colors'
                    }`}
                  >
                    <Icon className={isCollapsed ? 'w-5 h-5' : 'w-4 h-4'} />
                  </div>

                  {!isCollapsed && (
                    <div className="flex-1 min-w-0">
                      <span className="truncate text-xs font-bold block leading-tight">
                        {item.label}
                      </span>
                      {item.description && (
                        <span
                          className={`block text-[10px] truncate leading-tight mt-0.5 ${
                            isActive ? 'text-emerald-100/90' : 'text-slate-500'
                          }`}
                        >
                          {item.description}
                        </span>
                      )}
                    </div>
                  )}

                  {isActive && (
                    <span className="absolute -right-2.5 top-1.5 bottom-1.5 w-1 rounded-l-full bg-emerald-400 shadow-sm" />
                  )}
                </button>
              );
            })}

            {/* Repair Production Data Button */}
            {onOpenRepairModal && (
              <button
                id="sidebar-open-repair-modal-btn"
                onClick={onOpenRepairModal}
                className={`w-full group flex items-center rounded-xl transition-all cursor-pointer border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 text-amber-200 mt-2 ${
                  isCollapsed ? 'justify-center p-3' : 'gap-3 px-3.5 py-2.5 text-right'
                }`}
                title="مركز استعادة وتصحيح بيانات الإنتاج ومطابقة Offline"
              >
                <div className={`shrink-0 flex items-center justify-center rounded-lg ${isCollapsed ? 'w-8 h-8' : 'w-7 h-7'} text-amber-400`}>
                  <Wrench className={isCollapsed ? 'w-5 h-5' : 'w-4 h-4'} />
                </div>
                {!isCollapsed && (
                  <div className="flex-1 min-w-0">
                    <span className="text-xs font-black text-amber-300 block truncate">
                      تصحيح بيانات الإنتاج
                    </span>
                    <span className="text-[10px] text-amber-400/80 block truncate">
                      مطابقة نسخة Offline المرجعية
                    </span>
                  </div>
                )}
              </button>
            )}
          </div>
        </div>

        {/* Sidebar Footer: Connectivity & Collapse Toggle */}
        <div className="p-3 border-t border-slate-800/80 shrink-0 bg-slate-950/60 space-y-2">
          {/* Quick Connection Bar */}
          <div
            className={`flex items-center rounded-xl p-2 text-[11px] ${
              isCollapsed ? 'justify-center' : 'justify-between'
            } ${
              isOnline
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/30'
                : 'bg-amber-950/40 text-amber-300 border border-amber-800/30'
            }`}
          >
            <div className="flex items-center gap-2">
              {isOnline ? (
                <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              ) : (
                <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0 animate-pulse" />
              )}
              {!isCollapsed && (
                <span className="font-bold">
                  {isOnline
                    ? pendingQueueCount > 0
                      ? `أونلاين (معلق: ${pendingQueueCount})`
                      : 'متصل بالشبكة (Online)'
                    : `أوفلاين (محلي${pendingQueueCount > 0 ? ` • ${pendingQueueCount}` : ''})`}
                </span>
              )}
            </div>

            {!isCollapsed && onOpenSyncModal && (
              <button
                onClick={onOpenSyncModal}
                className="text-[10px] font-bold underline hover:text-white cursor-pointer"
              >
                {pendingQueueCount > 0 ? 'مزامنة الطابور' : 'تخزين تلقائي'}
              </button>
            )}
          </div>

          {/* Desktop Collapse / Expand Button */}
          <button
            onClick={onToggleCollapse}
            className="hidden md:flex w-full items-center justify-center gap-2 py-2 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800/80 transition cursor-pointer text-xs font-semibold"
            title={isCollapsed ? 'توسيع القائمة الجانبية' : 'طي القائمة الجانبية (أيقونات فقط)'}
          >
            {isCollapsed ? (
              <>
                <ChevronLeft className="w-4 h-4" />
              </>
            ) : (
              <>
                <ChevronRight className="w-4 h-4" />
                <span>طي القائمة الجانبية</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
