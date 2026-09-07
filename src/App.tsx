/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { AppDatabase, DispenseRecord, LateRegistrationRecord } from './types';
import { getDatabase, saveDatabase } from './storage/db';
import { Header, ActiveTab } from './components/Header';
import { Sidebar } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { StockManagement } from './components/StockManagement';
import { OpeningBalancesScreen } from './components/OpeningBalancesScreen';
import { DispenseScreen } from './components/DispenseScreen';
import { LateRegistrationScreen } from './components/LateRegistrationScreen';
import { CustomReportsScreen } from './components/CustomReportsScreen';
import { ItemDispenseReportsScreen } from './components/ItemDispenseReportsScreen';
import { MonthlyReportScreen } from './components/MonthlyReportScreen';
import { BackupRestoreScreen } from './components/BackupRestoreScreen';
import { PrintReceiptModal } from './components/PrintReceiptModal';
import { GovernmentSystemModal } from './components/GovernmentSystemModal';
import { AutoSyncModal } from './components/AutoSyncModal';
import { ProductionDataRepairModal } from './components/ProductionDataRepairModal';
import { useAutoSync } from './hooks/useAutoSync';
import { WifiOff, HeartPulse, CloudCheck, Sparkles, X } from 'lucide-react';

export default function App() {
  const [db, setDb] = useState<AppDatabase>(() => getDatabase());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [isGovModalOpen, setIsGovModalOpen] = useState(false);
  const [isSyncModalOpen, setIsSyncModalOpen] = useState(false);
  const [isRepairModalOpen, setIsRepairModalOpen] = useState(false);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Print modal state
  const [selectedDispensePrint, setSelectedDispensePrint] = useState<DispenseRecord | null>(null);
  const [selectedLateRegPrint, setSelectedLateRegPrint] = useState<LateRegistrationRecord | null>(null);

  // Automatic Sync & Cloud Storage hook
  const {
    isOnline,
    syncStatus,
    lastSyncTime,
    isSyncing,
    pendingQueueCount,
    reconnectNotification,
    dismissNotification,
    triggerManualSync,
  } = useAutoSync(db);

  // Listen for database updates from cloud sync or multi-device pulls
  useEffect(() => {
    const handleDatabaseSynced = (e: Event) => {
      const customEvent = e as CustomEvent<{ database: AppDatabase; source?: string }>;
      if (customEvent.detail && customEvent.detail.database) {
        setDb(customEvent.detail.database);
      }
    };
    window.addEventListener('saflaq:database-synced', handleDatabaseSynced);
    return () => {
      window.removeEventListener('saflaq:database-synced', handleDatabaseSynced);
    };
  }, []);

  const handleDatabaseUpdate = (newDb: AppDatabase) => {
    setDb({ ...newDb });
    saveDatabase(newDb);
  };

  // Metrics
  const todayStr = new Date().toISOString().split('T')[0];
  const totalDispensedToday = db.dispenseRecords.filter((r) => r.date === todayStr).length;
  const stockList = Object.values(db.stocks) as import('./types').StockItem[];
  const lowStockCount = stockList.filter(
    (s) => s.currentStock <= s.minThreshold
  ).length;

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-800 flex flex-col font-sans selection:bg-emerald-700 selection:text-white" dir="rtl">
      {/* Header */}
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        totalDispensedToday={totalDispensedToday}
        lowStockCount={lowStockCount}
        onOpenGovModal={() => setIsGovModalOpen(true)}
        onOpenSyncModal={() => setIsSyncModalOpen(true)}
        onOpenRepairModal={() => setIsRepairModalOpen(true)}
        isOnlineProp={isOnline}
        syncStatus={syncStatus}
        isSyncing={isSyncing}
        pendingQueueCount={pendingQueueCount}
        onToggleMobileSidebar={() => setIsMobileSidebarOpen((prev) => !prev)}
      />

      {/* Body ERP Layout: Right-side Sticky Sidebar + Main Workspace */}
      <div className="flex flex-1 w-full relative">
        {/* Right-side Fixed ERP Sidebar */}
        <Sidebar
          activeTab={activeTab}
          setActiveTab={setActiveTab}
          totalDispensedToday={totalDispensedToday}
          lowStockCount={lowStockCount}
          onOpenGovModal={() => setIsGovModalOpen(true)}
          onOpenSyncModal={() => setIsSyncModalOpen(true)}
          onOpenRepairModal={() => setIsRepairModalOpen(true)}
          isOnline={isOnline}
          syncStatus={syncStatus}
          isSyncing={isSyncing}
          pendingQueueCount={pendingQueueCount}
          isOpenMobile={isMobileSidebarOpen}
          onCloseMobile={() => setIsMobileSidebarOpen(false)}
          isCollapsed={isSidebarCollapsed}
          onToggleCollapse={() => setIsSidebarCollapsed((prev) => !prev)}
        />

        {/* Main Content Area */}
        <main className="flex-1 min-w-0 p-3 sm:p-5 md:p-6 lg:p-7 max-w-full overflow-x-hidden">
          {activeTab === 'dashboard' && (
            <Dashboard
              db={db}
              setActiveTab={setActiveTab}
              onSelectPrintRecord={(record) => setSelectedDispensePrint(record)}
              onOpenGovModal={() => setIsGovModalOpen(true)}
            />
          )}

          {activeTab === 'dispense' && (
            <DispenseScreen
              db={db}
              onDatabaseUpdate={handleDatabaseUpdate}
              onSelectPrintRecord={(record) => setSelectedDispensePrint(record)}
            />
          )}

          {activeTab === 'stock' && (
            <StockManagement
              db={db}
              onDatabaseUpdate={handleDatabaseUpdate}
            />
          )}

          {activeTab === 'opening_balances' && (
            <OpeningBalancesScreen
              db={db}
              onDatabaseUpdate={handleDatabaseUpdate}
              onNavigateToStock={() => setActiveTab('stock')}
            />
          )}

          {activeTab === 'late_reg' && (
            <LateRegistrationScreen
              db={db}
              onDatabaseUpdate={handleDatabaseUpdate}
              onPrintLateReg={(record) => setSelectedLateRegPrint(record)}
            />
          )}

          {activeTab === 'item_reports' && (
            <ItemDispenseReportsScreen
              db={db}
              onSelectPrintRecord={(record) => setSelectedDispensePrint(record)}
            />
          )}

          {activeTab === 'monthly_report' && (
            <MonthlyReportScreen
              db={db}
              onSelectPrintRecord={(record) => setSelectedDispensePrint(record)}
            />
          )}

          {activeTab === 'reports' && (
            <CustomReportsScreen
              db={db}
              onSelectPrintRecord={(record) => setSelectedDispensePrint(record)}
            />
          )}

          {activeTab === 'backup' && (
            <BackupRestoreScreen
              db={db}
              onDatabaseUpdate={handleDatabaseUpdate}
              onOpenSyncModal={() => setIsSyncModalOpen(true)}
              onOpenRepairModal={() => setIsRepairModalOpen(true)}
              isOnline={isOnline}
              syncStatus={syncStatus}
              isSyncing={isSyncing}
              onTriggerManualSync={triggerManualSync}
            />
          )}
        </main>
      </div>

      {/* Print Modal */}
      <PrintReceiptModal
        dispenseRecord={selectedDispensePrint}
        lateRegRecord={selectedLateRegPrint}
        onClose={() => {
          setSelectedDispensePrint(null);
          setSelectedLateRegPrint(null);
        }}
      />

      {/* Government Mechanization System (10.1.80.50) & Matching Sheets Modal */}
      <GovernmentSystemModal
        isOpen={isGovModalOpen}
        onClose={() => setIsGovModalOpen(false)}
        db={db}
        onDatabaseUpdate={handleDatabaseUpdate}
      />

      {/* Auto-Sync & Cloud Storage Center Modal */}
      <AutoSyncModal
        isOpen={isSyncModalOpen}
        onClose={() => setIsSyncModalOpen(false)}
        db={db}
        isOnline={isOnline}
        syncStatus={syncStatus}
        isSyncing={isSyncing}
        lastSyncTime={lastSyncTime}
        onTriggerManualSync={triggerManualSync}
        onOpenRepairModal={() => setIsRepairModalOpen(true)}
      />

      {/* Production Data Repair & Reconciliation Modal */}
      <ProductionDataRepairModal
        isOpen={isRepairModalOpen}
        onClose={() => setIsRepairModalOpen(false)}
        currentLocalDb={db}
        onDatabaseRepaired={(newDb) => {
          handleDatabaseUpdate(newDb);
        }}
        onRepairApplied={(newDb) => {
          handleDatabaseUpdate(newDb);
        }}
      />

      {/* Reconnect Notification Toast Banner */}
      {reconnectNotification && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-3 rounded-2xl bg-emerald-900 border border-emerald-500 text-white px-4 py-3 text-xs font-bold shadow-2xl no-print animate-in fade-in slide-in-from-bottom-3 max-w-md">
          <div className="w-8 h-8 rounded-xl bg-emerald-600 flex items-center justify-center shrink-0">
            <CloudCheck className="w-5 h-5 text-white" />
          </div>
          <div className="flex-1">
            <p className="leading-snug">{reconnectNotification.message}</p>
            <span className="text-[10px] text-emerald-300 font-mono">{reconnectNotification.timestamp}</span>
          </div>
          <button
            onClick={() => {
              dismissNotification();
              setIsSyncModalOpen(true);
            }}
            className="text-[11px] underline text-emerald-200 hover:text-white cursor-pointer shrink-0"
          >
            التفاصيل
          </button>
          <button
            onClick={dismissNotification}
            className="p-1 text-slate-300 hover:text-white cursor-pointer shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Offline Toast Banner when network is unavailable */}
      {!isOnline && !reconnectNotification && (
        <div className="fixed bottom-4 left-4 z-50 flex items-center gap-2.5 rounded-xl bg-slate-900/95 border border-amber-500/40 px-4 py-2.5 text-xs font-bold text-white shadow-xl no-print animate-in fade-in slide-in-from-bottom-2">
          <WifiOff className="w-4 h-4 text-amber-400 animate-pulse shrink-0" />
          <span>الوضع غير المتصل (أوفلاين) — التخزين المحلي الآمن نشط وسيتزامن تلقائياً عند عودة الإنترنت</span>
          <button
            onClick={() => setIsSyncModalOpen(true)}
            className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 text-[11px] text-amber-300 mr-2 cursor-pointer"
          >
            إعدادات
          </button>
        </div>
      )}

      {/* Official Footer */}
      <footer className="no-print mt-auto border-t border-slate-200 bg-white py-4 px-4 text-xs text-slate-500">
        <div className="max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <HeartPulse className="w-4 h-4 text-emerald-700" />
            <span className="font-bold text-slate-700">مكتب صحة سفلاق</span>
            <span>-</span>
            <span>الإدارة الصحية بساقلتة - مديرية الشؤون الصحية بمحافظة سوهاج</span>
          </div>

          <div className="text-slate-400">
            منظومة السجلات المكتوبة والأرصدة وساقط القيد • إصدار مكتبي مستقل أوفلاين
          </div>
        </div>
      </footer>
    </div>
  );
}
