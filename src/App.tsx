import React, { useState, useEffect } from 'react';
import { DatabaseSchema, DispenseRecord } from './types';
import { loadDatabase } from './storage/db';
import { runFullIntegrityCheck } from './services/stockService';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { useAutoSync } from './hooks/useAutoSync';

import { Header } from './components/Header';
import { Sidebar, TabType } from './components/Sidebar';
import { Dashboard } from './components/Dashboard';
import { StockManagement } from './components/StockManagement';
import { DispenseScreen } from './components/DispenseScreen';
import { LateRegistrationScreen } from './components/LateRegistrationScreen';
import { OpeningBalancesScreen } from './components/OpeningBalancesScreen';
import { MonthlyReportScreen } from './components/MonthlyReportScreen';
import { ItemDispenseReportsScreen } from './components/ItemDispenseReportsScreen';
import { BackupRestoreScreen } from './components/BackupRestoreScreen';
import { DiagnosticsScreen } from './components/DiagnosticsScreen';
import { PrintReceiptModal } from './components/PrintReceiptModal';
import { AutoSyncModal } from './components/AutoSyncModal';
import { PWAInstallButton } from './components/PWAInstallButton';

export function App() {
  const [db, setDb] = useState<DatabaseSchema>(() => loadDatabase());
  const [activeTab, setActiveTab] = useState<TabType>('dashboard');
  const [selectedReceiptForPrint, setSelectedReceiptForPrint] = useState<DispenseRecord | null>(null);
  const [showSyncModal, setShowSyncModal] = useState<boolean>(false);

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
      {/* Top Header */}
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
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col lg:flex-row max-w-7xl w-full mx-auto">
        {/* Navigation Sidebar */}
        <Sidebar
          activeTab={activeTab}
          onTabChange={setActiveTab}
          integrityIssuesCount={integrityCheck.totalIssues}
        />

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {activeTab === 'dashboard' && (
            <Dashboard db={db} onNavigate={(tab) => setActiveTab(tab)} />
          )}

          {activeTab === 'stocks' && (
            <StockManagement db={db} />
          )}

          {activeTab === 'dispense' && (
            <DispenseScreen
              db={db}
              onPrintReceipt={(rec) => setSelectedReceiptForPrint(rec)}
            />
          )}

          {activeTab === 'late_registration' && (
            <LateRegistrationScreen db={db} />
          )}

          {activeTab === 'opening_balances' && (
            <OpeningBalancesScreen db={db} />
          )}

          {activeTab === 'monthly_reports' && (
            <MonthlyReportScreen db={db} />
          )}

          {activeTab === 'item_dispense_reports' && (
            <ItemDispenseReportsScreen db={db} />
          )}

          {activeTab === 'backup_restore' && (
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
