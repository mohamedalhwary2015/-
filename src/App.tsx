import React, { useState, useEffect } from 'react';
import { DatabaseSchema, DispenseRecord } from './types';
import { loadDatabase } from './storage/db';
import { runFullIntegrityCheck } from './services/stockService';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useAutoSync } from './hooks/useAutoSync';

import { Header } from './components/Header';
import { Sidebar, TabType } from './components/Sidebar';
import { Breadcrumb } from './components/Breadcrumb';
import { Dashboard } from './components/Dashboard';
import { StockManagement } from './components/StockManagement';
import { DispenseScreen } from './components/DispenseScreen';
import { LateRegistrationScreen } from './components/LateRegistrationScreen';
import { OpeningBalancesScreen } from './components/OpeningBalancesScreen';
import { MonthlyReportScreen } from './components/MonthlyReportScreen';
import { ItemDispenseReportsScreen } from './components/ItemDispenseReportsScreen';
import { BackupRestoreScreen } from './components/BackupRestoreScreen';
import { DiagnosticsScreen } from './components/DiagnosticsScreen';
import { StockLedgerScreen } from './components/StockLedgerScreen';
import { RevenueReportScreen } from './components/RevenueReportScreen';
import { ReportsCenterScreen } from './components/ReportsCenterScreen';
import { OfficeSettingsScreen } from './components/OfficeSettingsScreen';
import { PrintReceiptModal } from './components/PrintReceiptModal';
import { AutoSyncModal } from './components/AutoSyncModal';
import { PWAInstallButton } from './components/PWAInstallButton';

export function App() {
  const [db, setDb] = useState<DatabaseSchema>(() => loadDatabase());
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedReceiptForPrint, setSelectedReceiptForPrint] = useState<DispenseRecord | null>(null);
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  const isOnline = useOnlineStatus();
  const { isSyncing, syncStatus, pendingCount, lastSyncTime, lastError, triggerSync } = useAutoSync(db);

  // Reactive DB updates
  useEffect(() => {
    const handleDbChanged = (e: CustomEvent<DatabaseSchema>) => {
      setDb(e.detail);
    };

    window.addEventListener('saflaq_db_changed' as any, handleDbChanged);
    return () => {
      window.removeEventListener('saflaq_db_changed' as any, handleDbChanged);
    };
  }, []);

  const refreshDb = () => {
    setDb(loadDatabase());
  };

  const integrityCheck = runFullIntegrityCheck(db);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col font-['Cairo',sans-serif]">
      {/* Top ERP Header */}
      <Header
        db={db}
        isOnline={isOnline}
        isSyncing={isSyncing}
        pendingCount={pendingCount}
        lastSyncTime={lastSyncTime}
        lastError={lastError}
        onTriggerSync={() => setShowSyncModal(true)}
        onOpenDiagnostics={() => setActiveTab('diagnostics')}
        integrityIssuesCount={integrityCheck.totalIssues}
        onToggleMobileMenu={() => setIsMobileMenuOpen(prev => !prev)}
        onNavigate={(tab) => setActiveTab(tab)}
      />

      {/* Main ERP Layout: Persistent Sidebar + Working Area */}
      <div className="flex-1 flex w-full">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          integrityIssuesCount={integrityCheck.totalIssues}
          pendingSyncCount={pendingCount}
          isMobileOpen={isMobileMenuOpen}
          onCloseMobile={() => setIsMobileMenuOpen(false)}
        />

        {/* Dynamic Content Main Area */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 overflow-y-auto max-w-7xl mx-auto w-full">
          <Breadcrumb activeTab={activeTab} onNavigate={(tab) => setActiveTab(tab)} />

          {activeTab === 'dashboard' && (
            <Dashboard db={db} onNavigate={(tab) => setActiveTab(tab)} />
          )}

          {activeTab === 'stocks' && (
            <StockManagement db={db} initialTab="stocks" />
          )}

          {activeTab === 'supplies' && (
            <StockManagement db={db} initialTab="supplies" />
          )}

          {activeTab === 'manual_adjustments' && (
            <StockManagement db={db} initialTab="adjustments" />
          )}

          {activeTab === 'stock_ledger' && (
            <StockLedgerScreen db={db} />
          )}

          {activeTab === 'health_cards' && (
            <DispenseScreen
              db={db}
              filterMode="health_cards"
              onPrintReceipt={(rec) => setSelectedReceiptForPrint(rec)}
            />
          )}

          {activeTab === 'birth_certificates' && (
            <DispenseScreen
              db={db}
              filterMode="birth_certificates"
              onPrintReceipt={(rec) => setSelectedReceiptForPrint(rec)}
            />
          )}

          {activeTab === 'death_certificates' && (
            <DispenseScreen
              db={db}
              filterMode="death_certificates"
              onPrintReceipt={(rec) => setSelectedReceiptForPrint(rec)}
            />
          )}

          {activeTab === 'notifications' && (
            <DispenseScreen
              db={db}
              filterMode="notifications"
              onPrintReceipt={(rec) => setSelectedReceiptForPrint(rec)}
            />
          )}

          {activeTab === 'documents' && (
            <DispenseScreen
              db={db}
              filterMode="documents"
              onPrintReceipt={(rec) => setSelectedReceiptForPrint(rec)}
            />
          )}

          {(activeTab === 'dispense' || activeTab === 'dispense_all') && (
            <DispenseScreen
              db={db}
              filterMode="all"
              onPrintReceipt={(rec) => setSelectedReceiptForPrint(rec)}
            />
          )}

          {activeTab === 'late_registration' && (
            <LateRegistrationScreen db={db} />
          )}

          {activeTab === 'opening_balances' && (
            <OpeningBalancesScreen db={db} />
          )}

          {activeTab === 'reports_center' && (
            <ReportsCenterScreen
              db={db}
              onNavigate={(tab) => setActiveTab(tab)}
            />
          )}

          {activeTab === 'monthly_reports' && (
            <MonthlyReportScreen db={db} />
          )}

          {activeTab === 'revenue_reports' && (
            <RevenueReportScreen db={db} />
          )}

          {activeTab === 'item_dispense_reports' && (
            <ItemDispenseReportsScreen db={db} />
          )}

          {activeTab === 'item_movement_report' && (
            <StockLedgerScreen db={db} />
          )}

          {activeTab === 'stock_balances_report' && (
            <StockManagement db={db} initialTab="stocks" />
          )}

          {activeTab === 'inventory_audit_report' && (
            <DiagnosticsScreen db={db} onRefreshDb={refreshDb} />
          )}

          {(activeTab === 'backup_restore' || activeTab === 'sync_status') && (
            <BackupRestoreScreen
              db={db}
              onFactoryResetComplete={() => {
                refreshDb();
                setActiveTab('dashboard');
              }}
            />
          )}

          {activeTab === 'diagnostics' && (
            <DiagnosticsScreen db={db} onRefreshDb={refreshDb} />
          )}

          {activeTab === 'settings' && (
            <OfficeSettingsScreen db={db} onSettingsUpdated={refreshDb} />
          )}
        </main>
      </div>

      {/* Print Receipt Modal */}
      {selectedReceiptForPrint && (
        <PrintReceiptModal
          record={selectedReceiptForPrint}
          onClose={() => setSelectedReceiptForPrint(null)}
          officeName={db.officeSettings?.officeName}
          governorate={db.officeSettings?.governorate}
        />
      )}

      {/* Auto Sync Modal */}
      <AutoSyncModal
        isOpen={showSyncModal}
        onClose={() => setShowSyncModal(false)}
        syncInfo={{
          status: syncStatus,
          lastSyncTime,
          pendingCount,
          lastError
        }}
        isOnline={isOnline}
        onTriggerSync={() => triggerSync('manual')}
      />

      {/* Offline PWA Installer */}
      <PWAInstallButton />
    </div>
  );
}

export default App;
