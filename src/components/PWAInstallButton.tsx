import React, { useState } from 'react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { Monitor, Download, CheckCircle2, Laptop, Info, X } from 'lucide-react';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // If already installed and running standalone
  if (isInstalled) {
    return (
      <div 
        id="pwa-installed-badge"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold shadow-xs"
      >
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
        <span>مثبت كتطبيق مكتبي (أوفلاين)</span>
      </div>
    );
  }

  return (
    <>
      <div className="flex items-center gap-2">
        {isInstallable ? (
          <button
            id="pwa-install-app-btn"
            onClick={install}
            className="flex items-center gap-2 rounded-lg bg-emerald-700 hover:bg-emerald-800 text-white px-3.5 py-2 text-xs md:text-sm font-semibold shadow-sm transition-all active:scale-95 cursor-pointer"
            title="تثبيت التطبيق على الكمبيوتر للعمل بدون إنترنت مثل برامج EXE"
          >
            <Laptop className="w-4 h-4" />
            <span>تثبيت البرنامج على الكمبيوتر</span>
          </button>
        ) : (
          <button
            id="pwa-install-guide-btn"
            onClick={() => setShowGuide(true)}
            className="flex items-center gap-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 px-3 py-1.5 text-xs font-semibold border border-slate-300 transition-all cursor-pointer"
            title="طريقة تثبيت البرنامج على الكمبيوتر والعمل أوفلاين"
          >
            <Download className="w-3.5 h-3.5 text-emerald-700" />
            <span>تثبيت كبرنامج مكتبي</span>
          </button>
        )}
      </div>

      {showGuide && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs no-print">
          <div className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl border border-slate-200 text-right animate-in fade-in zoom-in duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <button
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
              >
                <X className="w-5 h-5" />
              </button>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-slate-800">
                  تثبيت برنامج مكتب صحة سفلاق على الكمبيوتر
                </h3>
                <Monitor className="w-5 h-5 text-emerald-700" />
              </div>
            </div>

            <div className="mt-4 space-y-3 text-sm text-slate-600 leading-relaxed">
              <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900 text-xs flex gap-2">
                <Info className="w-5 h-5 text-emerald-700 shrink-0" />
                <p>
                  البرنامج مصمم ليعمل <strong>100% بدون اتصال بالإنترنت</strong> ويحفظ كافة الأرصدة والسجلات محلياً على جهاز الكمبيوتر في مكتب صحة سفلاق.
                </p>
              </div>

              <div className="space-y-2 text-xs md:text-sm">
                <p className="font-bold text-slate-800">طريقة تثبيته كبرنامج مستقل على شاشة الكمبيوتر (Windows):</p>
                <ol className="list-decimal list-inside space-y-1.5 text-slate-700 pr-1">
                  <li>
                    من متصفح <strong>Google Chrome</strong> أو <strong>Microsoft Edge</strong> على كمبيوتر المكتب:
                  </li>
                  <li>
                    انقر على أيقونة التثبيت <span className="inline-block px-1.5 py-0.5 bg-slate-100 rounded border border-slate-300 font-mono text-xs">⊕</span> في شريط العنوان أعلى المتصفح.
                  </li>
                  <li>
                    أو اضغط على زر القائمة (الثلاث نقاط ⋮) ثم اختر <strong>تثبيت التطبيق (Install App)</strong>.
                  </li>
                  <li>
                    سيتم إنشاء اختصار مباشر على سطح المكتب وفتح البرنامج في نافذة مستقلة كبرامج EXE تماماً دون الحاجة لفتح المتصفح أو الاتصال بالإنترنت!
                  </li>
                </ol>
              </div>

              {isIOS && (
                <div className="p-3 bg-blue-50 rounded-xl border border-blue-200 text-blue-900 text-xs">
                  <strong>للأجهزة اللوحية (iPad / iPhone):</strong> اضغط على زر المشاركة (Share) في Safari ثم اختر <strong>إضافة إلى الصفحة الرئيسية (Add to Home Screen)</strong>.
                </div>
              )}
            </div>

            <div className="mt-6 pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setShowGuide(false)}
                className="w-full sm:w-auto px-5 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-bold transition shadow-xs cursor-pointer"
              >
                فهمت، حسناً
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
