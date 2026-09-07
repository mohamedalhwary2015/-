import React, { useState } from 'react';
import { LateRegistrationRecord, LateRegStatus, LateRegTrackingStep, AppDatabase } from '../types';
import { 
  X, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Send, 
  AlertCircle, 
  Printer, 
  UserCheck, 
  Building, 
  ShieldCheck, 
  Calendar, 
  FileQuestion,
  ChevronLeft,
  XCircle,
  PlusCircle,
  FileCheck2,
  Stethoscope,
  Building2,
  History
} from 'lucide-react';

interface LateRegTrackerModalProps {
  isOpen: boolean;
  record: LateRegistrationRecord | null;
  officeSettings: AppDatabase['officeSettings'];
  onClose: () => void;
  onUpdateStatus: (
    recordId: string, 
    newStatus: LateRegStatus, 
    details: {
      actionTitle: string;
      date: string;
      notes?: string;
      docNumber?: string;
      committeeDecision?: string;
      staffName: string;
      rejectionReason?: string;
      finalRegistrationNumber?: string;
      finalCertificateNumber?: string;
    }
  ) => void;
}

export const LateRegTrackerModal: React.FC<LateRegTrackerModalProps> = ({
  isOpen,
  record,
  officeSettings,
  onClose,
  onUpdateStatus,
}) => {
  if (!isOpen || !record) return null;

  const todayStr = new Date().toISOString().split('T')[0];

  // Stage change form state
  const [selectedStatus, setSelectedStatus] = useState<LateRegStatus>(record.status);
  const [actionDate, setActionDate] = useState<string>(todayStr);
  const [docNumber, setDocNumber] = useState<string>(
    record.civilRegistryDocNumber || record.medicalCommitteeDocNumber || ''
  );
  const [committeeDecision, setCommitteeDecision] = useState<string>(
    record.medicalCommitteeDecision || ''
  );
  const [finalRegNumber, setFinalRegNumber] = useState<string>(
    record.finalRegistrationNumber || ''
  );
  const [finalCertNumber, setFinalCertNumber] = useState<string>(
    record.finalCertificateNumber || ''
  );
  const [rejectionReason, setRejectionReason] = useState<string>(
    record.rejectionReason || ''
  );
  const [stepNotes, setStepNotes] = useState<string>('');
  const [staffName, setStaffName] = useState<string>(
    officeSettings.currentEmployee || record.staffName || 'كاتب صحة سفلاق'
  );

  const [activeSubTab, setActiveSubTab] = useState<'update' | 'history' | 'print'>('update');

  // Stages definition
  const STAGES: {
    status: LateRegStatus;
    number: number;
    title: string;
    shortTitle: string;
    description: string;
    icon: React.ElementType;
    badgeColor: string;
  }[] = [
    {
      status: 'under_review',
      number: 1,
      title: 'فحص الأوراق بمكتب الصحة',
      shortTitle: 'فحص الأوراق',
      description: 'استلام الملف ومطابقة الأوراق وشهود الواقعة وسجل القيد',
      icon: FileText,
      badgeColor: 'bg-amber-100 text-amber-900 border-amber-300',
    },
    {
      status: 'medical_comm',
      number: 2,
      title: 'محال للجنة الطبية (تقدير سن)',
      shortTitle: 'اللجنة الطبية',
      description: 'الكشف الطبي بالإدارة الصحية بساقلتة لتقدير السن والمطابقة',
      icon: Stethoscope,
      badgeColor: 'bg-blue-100 text-blue-900 border-blue-300',
    },
    {
      status: 'civil_registry',
      number: 3,
      title: 'الإرسال لقسم السجل المدني',
      shortTitle: 'السجل المدني',
      description: 'إرسال الملف للسجل المدني بساقلتة لاستيفاء التحريات الأمنية',
      icon: Building2,
      badgeColor: 'bg-purple-100 text-purple-900 border-purple-300',
    },
    {
      status: 'approved',
      number: 4,
      title: 'الاعتماد واستخراج القيد',
      shortTitle: 'معتمد ومسجل',
      description: 'ورود قرار الاعتماد وقيد الواقعة رسمياً واستخراج الشهادة',
      icon: CheckCircle2,
      badgeColor: 'bg-emerald-100 text-emerald-900 border-emerald-300',
    },
  ];

  const currentStageIndex = STAGES.findIndex((s) => s.status === record.status);

  // Compute action title based on selected target status
  const getActionTitle = (st: LateRegStatus): string => {
    switch (st) {
      case 'under_review':
        return 'إعادة الطلب للفحص والمراجعة بمكتب الصحة';
      case 'medical_comm':
        return 'إحالة الملف للجنة الطبية لتقدير السن بالإدارة الصحية';
      case 'civil_registry':
        return 'إرسال الملف إلى سجل مدني ساقلتة للاستيفاء';
      case 'approved':
        return 'اعتماد ساقط القيد رسمياً وإصدار شهادة الميلاد/الوفاة';
      case 'rejected':
        return 'رفض استمارة ساقط القيد لعدم استيفاء الشروط';
    }
  };

  const handleExecuteUpdate = (e: React.FormEvent) => {
    e.preventDefault();

    const title = getActionTitle(selectedStatus);

    onUpdateStatus(record.id, selectedStatus, {
      actionTitle: title,
      date: actionDate,
      notes: stepNotes.trim(),
      docNumber: docNumber.trim(),
      committeeDecision: committeeDecision.trim(),
      staffName: staffName.trim(),
      rejectionReason: rejectionReason.trim(),
      finalRegistrationNumber: finalRegNumber.trim(),
      finalCertificateNumber: finalCertNumber.trim(),
    });

    onClose();
  };

  const handlePrintSlip = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs no-print animate-in fade-in">
      <div 
        className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]"
        dir="rtl"
      >
        {/* Header */}
        <div className="bg-gradient-to-l from-slate-900 via-slate-800 to-emerald-900 text-white p-4 sm:p-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-600/80 border border-emerald-400/40 text-white">
              <History className="w-6 h-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="font-black text-base sm:text-lg">
                  متابعة وتتبع مسار استمارة ساقط القيد
                </h3>
                <span className="px-2.5 py-0.5 rounded-md bg-white/20 text-emerald-200 font-mono text-xs font-bold">
                  {record.formNumber}
                </span>
                {record.status === 'approved' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-emerald-500/40 text-emerald-200 border border-emerald-400 text-xs font-bold">
                    معتمد رسمياً
                  </span>
                )}
                {record.status === 'rejected' && (
                  <span className="px-2.5 py-0.5 rounded-full bg-rose-500/40 text-rose-200 border border-rose-400 text-xs font-bold">
                    مرفوض
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-300 mt-0.5">
                صاحب القيد: <strong className="text-white">{record.personName}</strong> | 
                النوع: {record.type === 'birth' ? 'ساقط قيد ميلاد' : 'ساقط قيد وفاة'} ({record.ageCategory === 'over_one_year' ? 'أكبر من عام' : 'أقل من عام'})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-300 hover:text-white hover:bg-white/10 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Top Summary Bar */}
        <div className="bg-slate-50 border-b border-slate-200 p-3 sm:p-4 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <div>
            <span className="text-slate-500 block">تاريخ تقديم الطلب:</span>
            <span className="font-mono font-bold text-slate-800">{record.submissionDate}</span>
          </div>
          <div>
            <span className="text-slate-500 block">مقدم الطلب:</span>
            <span className="font-bold text-slate-800">{record.applicantName} ({record.applicantRelation})</span>
          </div>
          <div>
            <span className="text-slate-500 block">تاريخ الواقعة:</span>
            <span className="font-mono font-bold text-slate-800">{record.eventDate || 'غير محدد'}</span>
          </div>
          <div>
            <span className="text-slate-500 block">الموظف المسؤول:</span>
            <span className="font-bold text-emerald-800">{record.staffName}</span>
          </div>
        </div>

        {/* 4-Stage Stepper Progress Pipeline */}
        <div className="p-4 bg-white border-b border-slate-200">
          <div className="text-xs font-black text-slate-700 mb-3 flex items-center justify-between">
            <span>مخطط مراحل سير الاستمارة الإدارية والقانونية:</span>
            <span className="text-[11px] text-slate-500 font-normal">
              المكتب: {officeSettings.officeName} - مركز {officeSettings.center}
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STAGES.map((stg, idx) => {
              const isCurrent = record.status === stg.status;
              const isPast = currentStageIndex > idx && record.status !== 'rejected';
              const Icon = stg.icon;

              return (
                <div
                  key={stg.status}
                  className={`p-3 rounded-xl border transition-all ${
                    isCurrent
                      ? 'bg-emerald-50/90 border-emerald-500 ring-2 ring-emerald-500/20 shadow-xs'
                      : isPast
                      ? 'bg-slate-50 border-emerald-300 text-emerald-950'
                      : 'bg-slate-50/60 border-slate-200 text-slate-400 opacity-80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1.5">
                    <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[11px] ${
                      isCurrent 
                        ? 'bg-emerald-700 text-white' 
                        : isPast 
                        ? 'bg-emerald-600 text-white' 
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {isPast ? '✓' : stg.number}
                    </span>
                    <Icon className={`w-4 h-4 ${isCurrent ? 'text-emerald-700' : isPast ? 'text-emerald-600' : 'text-slate-400'}`} />
                  </div>

                  <div className={`font-black text-xs ${isCurrent ? 'text-emerald-950' : isPast ? 'text-slate-800' : 'text-slate-500'}`}>
                    {stg.shortTitle}
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-snug line-clamp-2">
                    {stg.description}
                  </p>

                  {isCurrent && (
                    <div className="mt-2 text-[10px] font-extrabold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded-md inline-block">
                      المرحلة الحالية الآن
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {record.status === 'rejected' && (
            <div className="mt-3 p-3 rounded-xl bg-rose-50 border border-rose-200 text-xs text-rose-900 flex items-start gap-2">
              <XCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <strong className="font-bold block">تم رفض الاستمارة:</strong>
                <p className="mt-0.5">{record.rejectionReason || 'لم يتم استيفاء الشروط والمستندات القانونية المطلوبة.'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Sub-tabs: Update Status vs Tracking History */}
        <div className="flex border-b border-slate-200 bg-slate-100/70 px-4 pt-2 gap-2 text-xs font-bold">
          <button
            type="button"
            onClick={() => setActiveSubTab('update')}
            className={`px-4 py-2.5 rounded-t-xl transition cursor-pointer border-t border-x ${
              activeSubTab === 'update'
                ? 'bg-white text-emerald-800 border-slate-200 border-b-white -mb-px'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            تحديث المرحلة وتسجيل إجراء جديد
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('history')}
            className={`px-4 py-2.5 rounded-t-xl transition cursor-pointer border-t border-x ${
              activeSubTab === 'history'
                ? 'bg-white text-emerald-800 border-slate-200 border-b-white -mb-px'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            سجل حركات وتتبع الاستمارة ({record.trackingHistory?.length || 1})
          </button>

          <button
            type="button"
            onClick={() => setActiveSubTab('print')}
            className={`px-4 py-2.5 rounded-t-xl transition cursor-pointer border-t border-x ${
              activeSubTab === 'print'
                ? 'bg-white text-emerald-800 border-slate-200 border-b-white -mb-px'
                : 'text-slate-600 hover:text-slate-900 border-transparent'
            }`}
          >
            بطاقة وإيصال متابعة للمواطن (طباعة)
          </button>
        </div>

        {/* Content Area */}
        <div className="p-4 sm:p-6 overflow-y-auto flex-1 space-y-4">
          {activeSubTab === 'update' && (
            <form onSubmit={handleExecuteUpdate} className="space-y-4">
              <div className="bg-emerald-50/50 p-4 rounded-xl border border-emerald-200 space-y-3">
                <label className="block text-xs font-black text-emerald-950">
                  اختر المرحلة أو الحالة الجديدة للاستمارة: *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2">
                  {STAGES.map((s) => (
                    <label
                      key={s.status}
                      className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2.5 cursor-pointer transition ${
                        selectedStatus === s.status
                          ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
                          : 'bg-white text-slate-800 border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="stageStatus"
                        value={s.status}
                        checked={selectedStatus === s.status}
                        onChange={() => setSelectedStatus(s.status)}
                        className="mt-0.5"
                      />
                      <div>
                        <div className="font-black">{s.title}</div>
                        <div className={`text-[10px] mt-0.5 ${selectedStatus === s.status ? 'text-emerald-100' : 'text-slate-500'}`}>
                          {s.description}
                        </div>
                      </div>
                    </label>
                  ))}

                  {/* Rejected option */}
                  <label
                    className={`p-3 rounded-xl border text-xs font-bold flex items-start gap-2.5 cursor-pointer transition ${
                      selectedStatus === 'rejected'
                        ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
                        : 'bg-white text-rose-800 border-rose-300 hover:bg-rose-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="stageStatus"
                      value="rejected"
                      checked={selectedStatus === 'rejected'}
                      onChange={() => setSelectedStatus('rejected')}
                      className="mt-0.5"
                    />
                    <div>
                      <div className="font-black">مرفوض لعدم استيفاء الشروط</div>
                      <div className={`text-[10px] mt-0.5 ${selectedStatus === 'rejected' ? 'text-rose-100' : 'text-rose-600'}`}>
                        بيان أسباب الرفض وحفظ الملف
                      </div>
                    </div>
                  </label>
                </div>
              </div>

              {/* Dynamic Inputs Based on Target Status */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    تاريخ اتخاذ هذا الإجراء: *
                  </label>
                  <input
                    type="date"
                    required
                    value={actionDate}
                    onChange={(e) => setActionDate(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:bg-white focus:border-emerald-600"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    الموظف القائم بالمتابعة والتسجيل: *
                  </label>
                  <input
                    type="text"
                    required
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-slate-900 font-bold focus:bg-white focus:border-emerald-600"
                  />
                </div>
              </div>

              {/* Specific Stage Fields */}
              {selectedStatus === 'medical_comm' && (
                <div className="p-3.5 bg-blue-50 border border-blue-200 rounded-xl space-y-3 text-xs">
                  <div className="font-bold text-blue-950 flex items-center gap-1.5">
                    <Stethoscope className="w-4 h-4 text-blue-700" />
                    <span>بيانات الإحالة وقرار اللجنة الطبية بساقلتة:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        رقم خطاب الإحالة الصادر:
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: صادر 218 / لجنة طبية"
                        value={docNumber}
                        onChange={(e) => setDocNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        قرار اللجنة الطبية وتقدير السن (إن ورد):
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: تم تقدير السن بثلاث سنوات وشهرين ومطابقة الفحص"
                        value={committeeDecision}
                        onChange={(e) => setCommitteeDecision(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedStatus === 'civil_registry' && (
                <div className="p-3.5 bg-purple-50 border border-purple-200 rounded-xl space-y-3 text-xs">
                  <div className="font-bold text-purple-950 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-purple-700" />
                    <span>بيانات الإرسال لقسم السجل المدني بساقلتة:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        رقم صادر السجل المدني / كتاب القيد:
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: كتاب 140 / أحوال مدنية ساقلتة"
                        value={docNumber}
                        onChange={(e) => setDocNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-900 font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        جهة الاستلام والمتابعة:
                      </label>
                      <input
                        type="text"
                        defaultValue="قسم سجل مدني ساقلتة - مباحث الأحوال المدنية"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-slate-700"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedStatus === 'approved' && (
                <div className="p-3.5 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3 text-xs">
                  <div className="font-bold text-emerald-950 flex items-center gap-1.5">
                    <CheckCircle2 className="w-4 h-4 text-emerald-700" />
                    <span>بيانات الاعتماد النهائي واستخراج قيد الميلاد/الوفاة:</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        رقم القيد النهائي بسجل ساقط القيد: *
                      </label>
                      <input
                        type="text"
                        required
                        placeholder="مثال: قيد رقم 62 لسنة 2026"
                        value={finalRegNumber}
                        onChange={(e) => setFinalRegNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-emerald-400 rounded-xl text-slate-900 font-bold font-mono"
                      />
                    </div>
                    <div>
                      <label className="block font-bold text-slate-700 mb-1">
                        رقم الشهادة المستخرجة رسمياً:
                      </label>
                      <input
                        type="text"
                        placeholder="مثال: 0142095"
                        value={finalCertNumber}
                        onChange={(e) => setFinalCertNumber(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-emerald-400 rounded-xl text-slate-900 font-mono"
                      />
                    </div>
                  </div>
                </div>
              )}

              {selectedStatus === 'rejected' && (
                <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl space-y-2 text-xs">
                  <div className="font-bold text-rose-950 flex items-center gap-1.5">
                    <XCircle className="w-4 h-4 text-rose-700" />
                    <span>أسباب رفض الاستمارة: *</span>
                  </div>
                  <textarea
                    rows={2}
                    required
                    placeholder="بيان سبب الرفض التفصيلي (مثال: عدم ثبوت النسب / عدم مطابقة وثيقة الزواج / تقرير اللجنة الطبية...)"
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-rose-300 rounded-xl text-slate-900"
                  />
                </div>
              )}

              {/* Tracking Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  ملاحظات وإجراءات المتابعة المتخذة:
                </label>
                <textarea
                  rows={2}
                  placeholder="سجل أية تفاصيل أو اتصالات مع المواطن أو مكاتبات رسمية واردة..."
                  value={stepNotes}
                  onChange={(e) => setStepNotes(e.target.value)}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-900 focus:border-emerald-600 focus:outline-hidden"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold transition cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-6 py-2 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs sm:text-sm font-black shadow-md transition cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>تثبيت وحفظ المرحلة الجديدة</span>
                </button>
              </div>
            </form>
          )}

          {activeSubTab === 'history' && (
            <div className="space-y-4">
              <div className="text-xs font-bold text-slate-600 flex items-center justify-between pb-2 border-b border-slate-100">
                <span>سجل المتابعة الزمني لمراحل هذه الاستمارة:</span>
                <span className="font-mono text-emerald-800 font-bold">
                  {(record.trackingHistory?.length || 1)} إجراءات مسجلة
                </span>
              </div>

              <div className="relative border-r-2 border-emerald-300 mr-3 space-y-6">
                {/* Fallback initial step if trackingHistory is empty */}
                {(!record.trackingHistory || record.trackingHistory.length === 0) && (
                  <div className="relative pr-6">
                    <span className="absolute -right-2 top-0 w-4 h-4 rounded-full bg-emerald-600 border-2 border-white ring-2 ring-emerald-300" />
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-black text-slate-800">
                          تقديم الاستمارة واستلام الأوراق بمكتب صحة سفلاق
                        </span>
                        <span className="font-mono text-slate-500">{record.submissionDate}</span>
                      </div>
                      <p className="text-slate-600">
                        {record.notes || 'تم استلام الملف وقيده برقم الاستمارة وتحديد سبب التأخر.'}
                      </p>
                      <span className="text-[11px] text-slate-400 block">
                        بمعرفة: {record.staffName}
                      </span>
                    </div>
                  </div>
                )}

                {record.trackingHistory?.map((step, idx) => (
                  <div key={step.id || idx} className="relative pr-6">
                    <span className="absolute -right-2 top-0 w-4 h-4 rounded-full bg-emerald-600 border-2 border-white ring-2 ring-emerald-300" />
                    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs hover:border-emerald-300 transition">
                      <div className="flex flex-wrap items-center justify-between gap-1">
                        <span className="font-black text-slate-900 text-sm">
                          {step.actionTitle}
                        </span>
                        <div className="flex items-center gap-2 font-mono text-slate-500 text-[11px]">
                          <span>{step.date}</span>
                          {step.time && <span>({step.time})</span>}
                        </div>
                      </div>

                      {step.officialDocNumber && (
                        <div className="text-emerald-800 font-semibold font-mono">
                          رقم المستند / الصادر: {step.officialDocNumber}
                        </div>
                      )}

                      {step.committeeDecision && (
                        <div className="text-blue-900 font-semibold">
                          قرار اللجنة الطبية: {step.committeeDecision}
                        </div>
                      )}

                      {step.notes && (
                        <p className="text-slate-700 bg-white p-2 rounded-lg border border-slate-200 mt-1 leading-relaxed">
                          {step.notes}
                        </p>
                      )}

                      <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-200">
                        <span>القائم بالإجراء: {step.performedBy}</span>
                        <span className="font-bold text-slate-500">
                          {step.status === 'approved' ? 'مكتمل ومعتمد' : step.status === 'rejected' ? 'مرفوض' : 'قيد المتابعة'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeSubTab === 'print' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-200">
                <span className="text-xs font-bold text-slate-600">
                  معاينة إيصال وبطاقة متابعة استمارة ساقط القيد (جاهز للطباعة والتسليم للمواطن):
                </span>
                <button
                  type="button"
                  onClick={handlePrintSlip}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shadow-xs"
                >
                  <Printer className="w-4 h-4" />
                  <span>طباعة الإيصال الآن</span>
                </button>
              </div>

              {/* Printable Card */}
              <div className="p-6 bg-white border-2 border-slate-800 rounded-2xl shadow-xs space-y-4 max-w-2xl mx-auto text-slate-900 text-xs">
                <div className="text-center border-b-2 border-slate-800 pb-3 space-y-1">
                  <div className="text-sm font-bold text-slate-700">جمهورية مصر العربية - وزارة الصحة والسكان</div>
                  <div className="text-xs text-slate-600">مديرية الشؤون الصحية بسوهاج - الإدارة الصحية بساقلتة</div>
                  <div className="text-base font-black text-slate-900">{officeSettings.officeName}</div>
                  <div className="inline-block px-4 py-1 bg-slate-100 border border-slate-400 rounded-lg font-black text-sm mt-1">
                    إيصال وبطاقة متابعة استمارة ساقط قيد ({record.type === 'birth' ? 'ميلاد' : 'وفاة'})
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 bg-slate-50 p-3 rounded-xl border border-slate-300">
                  <div>
                    <span className="text-slate-500 block text-[11px]">رقم الاستمارة:</span>
                    <strong className="font-mono text-sm text-emerald-900">{record.formNumber}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">تاريخ تقديم الطلب:</span>
                    <strong className="font-mono text-slate-900">{record.submissionDate}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">اسم صاحب القيد:</span>
                    <strong className="text-slate-900">{record.personName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500 block text-[11px]">اسم مقدم الطلب وصفته:</span>
                    <strong className="text-slate-900">{record.applicantName} ({record.applicantRelation})</strong>
                  </div>
                </div>

                <div>
                  <span className="font-bold text-slate-800 block mb-1">الموقف الحالي للمعاملة:</span>
                  <div className="p-3 bg-emerald-50 border border-emerald-300 rounded-xl flex items-center justify-between">
                    <div>
                      <strong className="text-emerald-950 font-black text-sm block">
                        {record.status === 'under_review' && 'المرحلة الأولى: قيد الفحص والمراجعة بمكتب صحة سفلاق'}
                        {record.status === 'medical_comm' && 'المرحلة الثانية: محال للجنة الطبية بساقلتة (تقدير سن)'}
                        {record.status === 'civil_registry' && 'المرحلة الثالثة: أرسل لقسم السجل المدني بساقلتة'}
                        {record.status === 'approved' && 'المرحلة الرابعة: معتمد ومسجل رسمياً - جاهز للاستلام'}
                        {record.status === 'rejected' && 'المعاملة مرفوضة'}
                      </strong>
                      <span className="text-[11px] text-slate-600 mt-0.5 block">
                        {record.notes || 'جاري استكمال الإجراءات القانونية والمستندية'}
                      </span>
                    </div>
                    <span className="px-3 py-1 rounded-md bg-emerald-700 text-white font-bold text-xs">
                      {record.status === 'approved' ? 'معتمد' : 'سارٍ'}
                    </span>
                  </div>
                </div>

                {record.finalRegistrationNumber && (
                  <div className="p-2.5 bg-emerald-100/70 border border-emerald-400 rounded-xl font-bold text-emerald-950">
                    رقم القيد النهائي المسجل: {record.finalRegistrationNumber}
                    {record.finalCertificateNumber && ` | رقم الشهادة: ${record.finalCertificateNumber}`}
                  </div>
                )}

                <div className="border-t border-dashed border-slate-300 pt-3 text-[11px] text-slate-500 leading-relaxed">
                  * تنبيه: يُرجى الاحتفاظ بهذا الإيصال للمراجعة ومتابعة نتائج اللجنة الطبية والسجل المدني بمكتب صحة سفلاق.
                </div>

                <div className="flex justify-between pt-4 text-xs font-bold text-slate-700">
                  <div>توقيع مقدم الطلب: .....................</div>
                  <div>الموظف المختص: {record.staffName}</div>
                  <div>خاتم مكتب صحة سفلاق</div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
