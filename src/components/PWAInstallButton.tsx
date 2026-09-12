import React from 'react';
import { Download } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, triggerInstall } = usePWAInstall();

  if (!isInstallable) return null;

  return (
    <button
      id="btn-pwa-install"
      onClick={triggerInstall}
      className="fixed bottom-4 left-4 z-40 bg-teal-700 hover:bg-teal-800 text-white px-4 py-2.5 rounded-xl shadow-lg border border-teal-600 flex items-center gap-2 text-xs sm:text-sm font-bold transition-transform transform hover:-translate-y-0.5 no-print"
      title="تثبيت التطبيق على الجهاز للعمل بدون إنترنت"
    >
      <Download className="w-4 h-4" />
      <span>تثبيت كبرنامج مكتبي (أوفلاين)</span>
    </button>
  );
};
