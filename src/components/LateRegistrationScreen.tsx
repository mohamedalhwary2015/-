import React, { useState, useMemo } from 'react';
import { AppDatabase, LateRegistrationRecord, LateRegStatus, LateRegType } from '../types';
import { addLateRegistration, updateLateRegistration, deleteLateRegistration, trackLateRegistrationStatus } from '../storage/db';
import { LateRegTrackerModal } from './LateRegTrackerModal';
import { 
  FileQuestion, 
  PlusCircle, 
  Search, 
  Edit3, 
  Trash2, 
  CheckCircle2, 
  Clock, 
  FileText, 
  Send, 
  User, 
  Phone, 
  MapPin, 
  AlertCircle,
  Printer,
  ChevronDown,
  History,
  Stethoscope,
  Building2,
  Filter
} from 'lucide-react';

interface LateRegistrationScreenProps {
  db: AppDatabase;
  onDatabaseUpdate: (newDb: AppDatabase) => void;
  onPrintLateReg: (record: LateRegistrationRecord) => void;
}

export const LateRegistrationScreen: React.FC<LateRegistrationScreenProps> = ({
  db,
  onDatabaseUpdate,
  onPrintLateReg,
}) => {
  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LateRegistrationRecord | null>(null);
  const [trackingRecord, setTrackingRecord] = useState<LateRegistrationRecord | null>(null);

  // Form Fields
  const [formNumber, setFormNumber] = useState('');
  const [submissionDate, setSubmissionDate] = useState(new Date().toISOString().split('T')[0]);
  const [type, setType] = useState<LateRegType>('birth');
  const [ageCategory, setAgeCategory] = useState<'under_one_year' | 'over_one_year'>('under_one_year');
  const [deductStockOnSave, setDeductStockOnSave] = useState(true);
  
  // Person Data
  const [personName, setPersonName] = useState('');
  const [gender, setGender] = useState<'male' | 'female'>('male');
  const [eventDate, setEventDate] = useState('');
  const [eventPlace, setEventPlace] = useState('قرية سفلاق - مركز ساقلتة');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');

  // Applicant Data
  const [applicantName, setApplicantName] = useState('');
  const [applicantRelation, setApplicantRelation] = useState('الأب');
  const [applicantNationalId, setApplicantNationalId] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantAddress, setApplicantAddress] = useState('سفلاق - ساقلتة');

  // Reasons & Notes (The key requirement)
  const [delayReason, setDelayReason] = useState('الولادة تمت بالمنزل وتعذر التبليغ خلال المهلة القانونية (15 يوماً)');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<LateRegStatus>('under_review');
  const [staffName, setStaffName] = useState(db.officeSettings.currentEmployee || 'كاتب صحة سفلاق');

  // Search & Filter
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [ageCategoryFilter, setAgeCategoryFilter] = useState<string>('all');
  const [monthFilter, setMonthFilter] = useState<string>('all');

  const availableMonths = useMemo(() => {
    const set = new Set<string>();
    (db.lateRegistrations || []).forEach((r) => {
      if (r.submissionDate && r.submissionDate.length >= 7) {
        set.add(r.submissionDate.substring(0, 7));
      }
    });
    const currentMonth = new Date().toISOString().substring(0, 7);
    set.add(currentMonth);
    return Array.from(set).sort().reverse();
  }, [db.lateRegistrations]);

  // Auto-generate a suggested form number
  const openNewForm = () => {
    const year = new Date().getFullYear();
    const count = db.lateRegistrations.length + 1;
    const formattedNum = `س-ق-${year}/${String(count).padStart(3, '0')}`;
    setFormNumber(formattedNum);
    setSubmissionDate(new Date().toISOString().split('T')[0]);
    setType('birth');
    setAgeCategory('under_one_year');
    setDeductStockOnSave(true);
    setPersonName('');
    setGender('male');
    setEventDate('');
    setEventPlace('قرية سفلاق - مركز ساقلتة');
    setFatherName('');
    setMotherName('');
    setApplicantName('');
    setApplicantRelation('الأب');
    setApplicantNationalId('');
    setApplicantPhone('');
    setApplicantAddress('سفلاق - ساقلتة');
    setDelayReason('الولادة تمت بالمنزل وتعذر التبليغ في الميعاد القانوني');
    setNotes('');
    setStatus('under_review');
    setEditingRecord(null);
    setShowAddForm(true);
  };

  const handleEditClick = (record: LateRegistrationRecord) => {
    setEditingRecord(record);
    setFormNumber(record.formNumber);
    setSubmissionDate(record.submissionDate);
    setType(record.type);
    setAgeCategory(record.ageCategory || 'under_one_year');
    setPersonName(record.personName);
    setGender(record.gender);
    setEventDate(record.eventDate);
    setEventPlace(record.eventPlace);
    setFatherName(record.fatherName);
    setMotherName(record.motherName);
    setApplicantName(record.applicantName);
    setApplicantRelation(record.applicantRelation);
    setApplicantNationalId(record.applicantNationalId);
    setApplicantPhone(record.applicantPhone);
    setApplicantAddress(record.applicantAddress);
    setDelayReason(record.delayReason);
    setNotes(record.notes);
    setStatus(record.status);
    setStaffName(record.staffName);
    setShowAddForm(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!personName.trim()) {
      alert('يرجى إدخال اسم صاحب القيد');
      return;
    }
    if (!formNumber.trim()) {
      alert('يرجى إدخال رقم استمارة ساقط القيد');
      return;
    }

    if (editingRecord) {
      // Update
      const updatedDb = updateLateRegistration(editingRecord.id, {
        formNumber: formNumber.trim(),
        submissionDate,
        type,
        ageCategory,
        personName: personName.trim(),
        gender,
        eventDate,
        eventPlace: eventPlace.trim(),
        fatherName: fatherName.trim(),
        motherName: motherName.trim(),
        applicantName: applicantName.trim(),
        applicantRelation: applicantRelation.trim(),
        applicantNationalId: applicantNationalId.trim(),
        applicantPhone: applicantPhone.trim(),
        applicantAddress: applicantAddress.trim(),
        delayReason: delayReason.trim(),
        notes: notes.trim(),
        status,
        staffName: staffName.trim(),
      });
      onDatabaseUpdate(updatedDb);
    } else {
      // Add
      const { db: updatedDb } = addLateRegistration(
        {
          formNumber: formNumber.trim(),
          submissionDate,
          type,
          ageCategory,
          personName: personName.trim(),
          gender,
          eventDate,
          eventPlace: eventPlace.trim(),
          fatherName: fatherName.trim(),
          motherName: motherName.trim(),
          applicantName: applicantName.trim(),
          applicantRelation: applicantRelation.trim(),
          applicantNationalId: applicantNationalId.trim(),
          applicantPhone: applicantPhone.trim(),
          applicantAddress: applicantAddress.trim(),
          delayReason: delayReason.trim(),
          notes: notes.trim(),
          status,
          staffName: staffName.trim(),
        },
        deductStockOnSave
      );
      onDatabaseUpdate(updatedDb);
    }

    setShowAddForm(false);
    setEditingRecord(null);
  };

  const handleDelete = (id: string, name: string) => {
    if (confirm(`هل أنت متأكد من حذف استمارة ساقط القيد الخاصة بـ: ${name}؟`)) {
      const updatedDb = deleteLateRegistration(id);
      onDatabaseUpdate(updatedDb);
    }
  };

  const getStatusBadge = (st: LateRegStatus) => {
    switch (st) {
      case 'under_review':
        return (
          <span className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-bold">
            قيد الفحص بمكتب الصحة
          </span>
        );
      case 'medical_comm':
        return (
          <span className="px-2.5 py-1 rounded-full bg-blue-50 text-blue-800 border border-blue-200 text-xs font-bold">
            محال للجنة الطبية (تقدير سن)
          </span>
        );
      case 'civil_registry':
        return (
          <span className="px-2.5 py-1 rounded-full bg-purple-50 text-purple-800 border border-purple-200 text-xs font-bold">
            أرسل للسجل المدني بساقلتة
          </span>
        );
      case 'approved':
        return (
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold">
            معتمد ومسجل رسمياً
          </span>
        );
      case 'rejected':
        return (
          <span className="px-2.5 py-1 rounded-full bg-rose-50 text-rose-800 border border-rose-200 text-xs font-bold">
            مرفوض / غير مستوفٍ
          </span>
        );
    }
  };

  const filteredRecords = db.lateRegistrations.filter((r) => {
    const s = searchTerm.toLowerCase().trim();
    const matchesSearch =
      !s ||
      r.personName.toLowerCase().includes(s) ||
      r.formNumber.toLowerCase().includes(s) ||
      r.applicantName.toLowerCase().includes(s) ||
      r.notes.toLowerCase().includes(s);

    const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
    const matchesAge = ageCategoryFilter === 'all' || (r.ageCategory || 'under_one_year') === ageCategoryFilter;
    const matchesMonth = monthFilter === 'all' || (r.submissionDate && r.submissionDate.startsWith(monthFilter));
    return matchesSearch && matchesStatus && matchesAge && matchesMonth;
  });

  const handleUpdateTrackingStatus = (
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
  ) => {
    const updatedDb = trackLateRegistrationStatus(recordId, newStatus, details);
    onDatabaseUpdate(updatedDb);
    const fresh = updatedDb.lateRegistrations.find((r) => r.id === recordId) || null;
    setTrackingRecord(fresh);
  };

  const totalCount = db.lateRegistrations.length;
  const underReviewCount = db.lateRegistrations.filter(r => r.status === 'under_review').length;
  const medicalCommCount = db.lateRegistrations.filter(r => r.status === 'medical_comm').length;
  const civilRegistryCount = db.lateRegistrations.filter(r => r.status === 'civil_registry').length;
  const approvedCount = db.lateRegistrations.filter(r => r.status === 'approved').length;
  const rejectedCount = db.lateRegistrations.filter(r => r.status === 'rejected').length;

  return (
    <div className="space-y-6">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 md:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-10 h-10 rounded-xl bg-teal-50 text-teal-800 flex items-center justify-center border border-teal-200">
              <FileQuestion className="w-6 h-6 text-teal-700" />
            </div>
            <div>
              <h3 className="font-bold text-lg text-slate-900">
                منظومة ومتابعة استمارات ساقط القيد (الميلاد والوفاة)
              </h3>
              <p className="text-xs text-slate-500 font-medium">
                مكتب صحة سفلاق | تسجيل وتتبع مسار الاستمارات (فحص الأوراق ⬅ اللجنة الطبية ⬅ السجل المدني ⬅ الاعتماد النهائي)
              </p>
            </div>
          </div>
        </div>

        <button
          id="add-late-reg-btn"
          onClick={openNewForm}
          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-700 hover:bg-emerald-800 text-white rounded-xl text-xs md:text-sm font-bold shadow-md transition active:scale-95 cursor-pointer self-start sm:self-auto"
        >
          <PlusCircle className="w-4 h-4" />
          <span>تسجيل استمارة ساقط قيد جديدة</span>
        </button>
      </div>

      {/* Pipeline Status Tracking KPI Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
        <button
          type="button"
          onClick={() => setStatusFilter('all')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
            statusFilter === 'all'
              ? 'bg-slate-900 text-white border-slate-900 shadow-xs'
              : 'bg-white text-slate-800 border-slate-200 hover:border-slate-400'
          }`}
        >
          <span className="text-[11px] block text-slate-400 font-bold">إجمالي الاستمارات</span>
          <span className="text-xl font-black font-mono">{totalCount}</span>
          <span className="text-[10px] block opacity-80 mt-0.5">كافة الطلبات</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('under_review')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
            statusFilter === 'under_review'
              ? 'bg-amber-600 text-white border-amber-600 shadow-xs'
              : 'bg-amber-50/70 text-amber-950 border-amber-200 hover:border-amber-400'
          }`}
        >
          <span className="text-[11px] block opacity-80 font-bold">1. قيد الفحص</span>
          <span className="text-xl font-black font-mono">{underReviewCount}</span>
          <span className="text-[10px] block opacity-80 mt-0.5">بمكتب الصحة</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('medical_comm')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
            statusFilter === 'medical_comm'
              ? 'bg-blue-600 text-white border-blue-600 shadow-xs'
              : 'bg-blue-50/70 text-blue-950 border-blue-200 hover:border-blue-400'
          }`}
        >
          <span className="text-[11px] block opacity-80 font-bold">2. اللجنة الطبية</span>
          <span className="text-xl font-black font-mono">{medicalCommCount}</span>
          <span className="text-[10px] block opacity-80 mt-0.5">تقدير السن بساقلتة</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('civil_registry')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
            statusFilter === 'civil_registry'
              ? 'bg-purple-600 text-white border-purple-600 shadow-xs'
              : 'bg-purple-50/70 text-purple-950 border-purple-200 hover:border-purple-400'
          }`}
        >
          <span className="text-[11px] block opacity-80 font-bold">3. السجل المدني</span>
          <span className="text-xl font-black font-mono">{civilRegistryCount}</span>
          <span className="text-[10px] block opacity-80 mt-0.5">أحوال مدنية ساقلتة</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('approved')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
            statusFilter === 'approved'
              ? 'bg-emerald-700 text-white border-emerald-700 shadow-xs'
              : 'bg-emerald-50/70 text-emerald-950 border-emerald-200 hover:border-emerald-400'
          }`}
        >
          <span className="text-[11px] block opacity-80 font-bold">4. معتمد ومسجل</span>
          <span className="text-xl font-black font-mono">{approvedCount}</span>
          <span className="text-[10px] block opacity-80 mt-0.5">استخرج القيد رسمياً</span>
        </button>

        <button
          type="button"
          onClick={() => setStatusFilter('rejected')}
          className={`p-3 rounded-2xl border text-right transition cursor-pointer ${
            statusFilter === 'rejected'
              ? 'bg-rose-700 text-white border-rose-700 shadow-xs'
              : 'bg-rose-50/70 text-rose-950 border-rose-200 hover:border-rose-400'
          }`}
        >
          <span className="text-[11px] block opacity-80 font-bold">مرفوض</span>
          <span className="text-xl font-black font-mono">{rejectedCount}</span>
          <span className="text-[10px] block opacity-80 mt-0.5">غير مستوفٍ</span>
        </button>
      </div>

      {/* FORM MODAL / COLLAPSIBLE PANEL */}
      {showAddForm && (
        <div className="bg-white rounded-2xl border-2 border-emerald-600 p-5 md:p-7 shadow-lg space-y-5 animate-in fade-in">
          <div className="flex items-center justify-between pb-3 border-b border-slate-200">
            <h4 className="font-black text-base text-slate-900">
              {editingRecord ? 'تعديل استمارة ساقط قيد وملاحظاتها' : 'تسجيل استمارة ساقط قيد جديدة'}
            </h4>
            <button
              onClick={() => setShowAddForm(false)}
              className="px-3 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold"
            >
              إلغاء وإغلاق
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-5 text-xs md:text-sm">
            {/* Type, Age Category and Meta */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div>
                <label className="block font-bold text-slate-700 mb-1">نوع ساقط القيد *</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType('birth')}
                    className={`flex-1 py-2 rounded-xl font-bold border transition ${
                      type === 'birth'
                        ? 'bg-teal-50 border-teal-600 text-teal-900'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    ميلاد
                  </button>
                  <button
                    type="button"
                    onClick={() => setType('death')}
                    className={`flex-1 py-2 rounded-xl font-bold border transition ${
                      type === 'death'
                        ? 'bg-slate-100 border-slate-700 text-slate-900'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    وفاة
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">فئة السن (تصنيف الاستمارة) *</label>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setAgeCategory('under_one_year')}
                    className={`flex-1 py-2 px-2 rounded-xl font-bold border text-xs transition ${
                      ageCategory === 'under_one_year'
                        ? 'bg-amber-100 border-amber-600 text-amber-950 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    أقل من عام
                    <span className="block text-[10px] font-normal text-amber-800">
                      رصيد: {db.stocks.late_reg_under_year?.currentStock ?? 0}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setAgeCategory('over_one_year')}
                    className={`flex-1 py-2 px-2 rounded-xl font-bold border text-xs transition ${
                      ageCategory === 'over_one_year'
                        ? 'bg-orange-100 border-orange-600 text-orange-950 shadow-xs'
                        : 'bg-white border-slate-200 text-slate-600'
                    }`}
                  >
                    أكبر من عام
                    <span className="block text-[10px] font-normal text-orange-800">
                      رصيد: {db.stocks.late_reg_over_year?.currentStock ?? 0}
                    </span>
                  </button>
                </div>
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  رقم استمارة ساقط القيد *
                </label>
                <input
                  type="text"
                  required
                  value={formNumber}
                  onChange={(e) => setFormNumber(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 font-mono font-bold text-slate-900"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  تاريخ تقديم الاستمارة بالمكتب *
                </label>
                <input
                  type="date"
                  required
                  value={submissionDate}
                  onChange={(e) => setSubmissionDate(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                />
              </div>
            </div>

            {/* Auto-deduct stock checkbox (only for new records) */}
            {!editingRecord && (
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between text-xs">
                <label className="flex items-center gap-2 cursor-pointer font-bold text-slate-800">
                  <input
                    type="checkbox"
                    checked={deductStockOnSave}
                    onChange={(e) => setDeductStockOnSave(e.target.checked)}
                    className="accent-emerald-700 rounded w-4 h-4"
                  />
                  <span>
                    خصم استمارة واحدة تلقائياً من رصيد {ageCategory === 'under_one_year' ? 'ساقط قيد (أقل من عام)' : 'ساقط قيد (أكبر من عام)'} بالمخزن
                  </span>
                </label>
                <span className="text-[11px] text-slate-500">
                  المتاح حالياً: {ageCategory === 'under_one_year' ? db.stocks.late_reg_under_year?.currentStock : db.stocks.late_reg_over_year?.currentStock} استمارة
                </span>
              </div>
            )}

            {/* Person Data */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                <User className="w-4 h-4 text-emerald-700" />
                <span>بيانات صاحب القيد المطلوب قيده</span>
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block font-bold text-slate-700 mb-1">
                    اسم صاحب القيد رباعي *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="الاسم بالكامل كما هو مثبت بالأوراق"
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 font-bold bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">النوع *</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as 'male' | 'female')}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white"
                  >
                    <option value="male">ذكر</option>
                    <option value="female">أنثى</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    تاريخ الواقعة (الميلاد أو الوفاة الفعلي أو التقريبي)
                  </label>
                  <input
                    type="text"
                    placeholder="مثال: 2024-03-15 أو تقديري لسنة 2020"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    محل الواقعة (القرية أو المستشفى)
                  </label>
                  <input
                    type="text"
                    value={eventPlace}
                    onChange={(e) => setEventPlace(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم الأب</label>
                  <input
                    type="text"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم الأم</label>
                  <input
                    type="text"
                    value={motherName}
                    onChange={(e) => setMotherName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Applicant Data */}
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
              <h5 className="font-bold text-slate-900 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-emerald-700" />
                <span>بيانات مقدم الطلب</span>
              </h5>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">اسم مقدم الطلب *</label>
                  <input
                    type="text"
                    required
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    صفته / صلته بصاحب القيد *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="الأب / الأم / الأخ / الوكيل"
                    value={applicantRelation}
                    onChange={(e) => setApplicantRelation(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    الرقم القومي لمقدم الطلب (14 رقم)
                  </label>
                  <input
                    type="text"
                    maxLength={14}
                    value={applicantNationalId}
                    onChange={(e) => setApplicantNationalId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-slate-900"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">رقم الهاتف للتواصل</label>
                  <input
                    type="tel"
                    value={applicantPhone}
                    onChange={(e) => setApplicantPhone(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-mono text-slate-900"
                  />
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">محل الإقامة / العنوان</label>
                  <input
                    type="text"
                    value={applicantAddress}
                    onChange={(e) => setApplicantAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Delay Reason & Detailed Notes (Core Requirement) */}
            <div className="space-y-3">
              <div>
                <label className="block font-bold text-slate-700 mb-1">
                  أسباب التأخر عن الميعاد القانوني للتبليغ
                </label>
                <input
                  type="text"
                  value={delayReason}
                  onChange={(e) => setDelayReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                />
              </div>

              {/* CRITICAL: NOTES TEXTAREA */}
              <div className="p-4 rounded-2xl bg-amber-50/80 border-2 border-amber-300">
                <label className="block font-black text-amber-950 mb-1.5 text-sm">
                  خانة تسجيل الملاحظات الإدارية والقانونية على الاستمارة * (مطلوبة صراحة):
                </label>
                <textarea
                  rows={4}
                  required
                  id="late-registration-notes-textarea"
                  placeholder="سجل هنا بالتفصيل: حالة الأوراق والمستندات المرفقة، شهادة الشهود، قرار اللجنة الطبية لتقدير السن، رقم محضر الشرطة أو السجل المدني، أية مكاتبات صادرة أو واردة..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border-2 border-amber-300 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 bg-white text-slate-900 text-sm leading-relaxed"
                />
                <p className="text-[11px] text-amber-800 mt-1">
                  تُسجل هذه الملاحظات في الملف الورقي وتُطبع في إشعار القيد وقرار الإحالة للجنة الطبية.
                </p>
              </div>

              {/* Status & Staff */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block font-bold text-slate-700 mb-1">حالة الطلب الحالية</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as LateRegStatus)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 bg-white font-bold text-slate-800"
                  >
                    <option value="under_review">قيد الفحص والمراجعة بمكتب الصحة</option>
                    <option value="medical_comm">محال للجنة الطبية (تقدير سن / كشف)</option>
                    <option value="civil_registry">أرسل للسجل المدني بساقلتة</option>
                    <option value="approved">معتمد وتم استخراج القيد</option>
                    <option value="rejected">مرفوض لعدم استيفاء الشروط</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1">الموظف المختص بمكتب الصحة</label>
                  <input
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-slate-900"
                  />
                </div>
              </div>
            </div>

            {/* Buttons */}
            <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowAddForm(false)}
                className="px-5 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold"
              >
                إلغاء
              </button>
              <button
                type="submit"
                id="save-late-reg-btn"
                className="px-6 py-2.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white font-black shadow-md cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>حفظ استمارة ساقط القيد والملاحظات</span>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FILTER & SEARCH BAR */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute right-3 top-3" />
          <input
            type="text"
            placeholder="بحث باسم صاحب القيد، رقم الاستمارة، مقدم الطلب، أو نص الملاحظات..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pr-9 pl-3 py-2 rounded-xl border border-slate-200 text-xs md:text-sm text-slate-900 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-bold whitespace-nowrap">فئة السن:</span>
            <select
              value={ageCategoryFilter}
              onChange={(e) => setAgeCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700"
            >
              <option value="all">كافة الفئات</option>
              <option value="under_one_year">أقل من عام (ساقط حديث)</option>
              <option value="over_one_year">أكبر من عام (معتمد)</option>
            </select>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-xs text-slate-500 font-bold whitespace-nowrap">الحالة:</span>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-2.5 py-1.5 rounded-xl border border-slate-200 text-xs font-semibold bg-white text-slate-700"
            >
              <option value="all">كافة الحالات ({db.lateRegistrations.length})</option>
              <option value="under_review">قيد الفحص</option>
              <option value="medical_comm">اللجنة الطبية</option>
              <option value="civil_registry">السجل المدني</option>
              <option value="approved">معتمد</option>
              <option value="rejected">مرفوض</option>
            </select>
          </div>
        </div>
      </div>

      {/* RECORDS LIST CARDS / TABLE */}
      {filteredRecords.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
          لا توجد استمارات ساقط قيد مطابقة للبحث.
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredRecords.map((r) => (
            <div
              key={r.id}
              className="bg-white rounded-2xl border border-slate-200 p-4 md:p-5 shadow-xs hover:border-slate-300 transition space-y-3"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span className="px-2.5 py-1 bg-slate-100 text-slate-800 font-mono text-xs font-bold rounded-lg">
                    {r.formNumber}
                  </span>
                  <h4 className="font-bold text-base text-slate-900">{r.personName}</h4>
                  <span className="text-xs text-slate-400">
                    ({r.type === 'birth' ? 'ساقط قيد ميلاد' : 'ساقط قيد وفاة'})
                  </span>
                  {r.ageCategory === 'over_one_year' ? (
                    <span className="px-2 py-0.5 rounded-md bg-orange-50 text-orange-800 border border-orange-200 text-[11px] font-bold">
                      أكبر من عام
                    </span>
                  ) : (
                    <span className="px-2 py-0.5 rounded-md bg-amber-50 text-amber-900 border border-amber-200 text-[11px] font-bold">
                      أقل من عام
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {getStatusBadge(r.status)}

                  {/* Tracking Button */}
                  <button
                    type="button"
                    onClick={() => setTrackingRecord(r)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-black transition cursor-pointer shadow-xs active:scale-95"
                    title="تتبع مسار استمارة ساقط القيد وتحديث حالتها خطوة بخطوة"
                  >
                    <History className="w-3.5 h-3.5 text-emerald-200" />
                    <span>متابعة وتحديث الحالة</span>
                    {r.trackingHistory && r.trackingHistory.length > 0 && (
                      <span className="bg-emerald-900 text-emerald-100 text-[10px] px-1.5 py-0.2 rounded-full font-mono">
                        {r.trackingHistory.length}
                      </span>
                    )}
                  </button>

                  <button
                    onClick={() => onPrintLateReg(r)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-emerald-800 hover:bg-emerald-50 transition cursor-pointer"
                    title="طباعة الاستمارة / إيصال الاستلام"
                  >
                    <Printer className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleEditClick(r)}
                    className="p-1.5 rounded-lg text-slate-500 hover:text-blue-800 hover:bg-blue-50 transition cursor-pointer"
                    title="تعديل الاستمارة والملاحظات"
                  >
                    <Edit3 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(r.id, r.personName)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition cursor-pointer"
                    title="حذف"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Official Tracking Doc Badges */}
              {(r.medicalCommitteeDocNumber || r.civilRegistryDocNumber || r.finalRegistrationNumber || r.finalCertificateNumber) && (
                <div className="flex flex-wrap items-center gap-2 pt-1 pb-1">
                  {r.medicalCommitteeDocNumber && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold bg-blue-50 text-blue-900 px-2.5 py-1 rounded-lg border border-blue-200 shadow-2xs">
                      <Stethoscope className="w-3.5 h-3.5 text-blue-600" />
                      <span>خطاب اللجنة الطبية: {r.medicalCommitteeDocNumber}</span>
                    </span>
                  )}
                  {r.civilRegistryDocNumber && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-bold bg-purple-50 text-purple-900 px-2.5 py-1 rounded-lg border border-purple-200 shadow-2xs">
                      <Building2 className="w-3.5 h-3.5 text-purple-600" />
                      <span>صادر السجل المدني: {r.civilRegistryDocNumber}</span>
                    </span>
                  )}
                  {r.finalRegistrationNumber && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black bg-emerald-100 text-emerald-950 px-2.5 py-1 rounded-lg border border-emerald-300 shadow-2xs">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-700" />
                      <span>رقم القيد النهائي: {r.finalRegistrationNumber}</span>
                    </span>
                  )}
                  {r.finalCertificateNumber && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-mono font-black bg-teal-100 text-teal-950 px-2.5 py-1 rounded-lg border border-teal-300 shadow-2xs">
                      <span>رقم الشهادة: {r.finalCertificateNumber}</span>
                    </span>
                  )}
                </div>
              )}

              {/* Latest Tracking History Step */}
              {r.trackingHistory && r.trackingHistory.length > 0 && (
                <div className="flex items-start gap-2 text-xs bg-slate-50 p-2.5 rounded-xl border border-slate-200 text-slate-700">
                  <Clock className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <span className="font-bold text-slate-900">
                      آخر إجراء مسجل: {r.trackingHistory[r.trackingHistory.length - 1].actionTitle}
                    </span>
                    <span className="text-[11px] text-slate-500 mr-2 font-mono">
                      ({r.trackingHistory[r.trackingHistory.length - 1].date})
                    </span>
                    {r.trackingHistory[r.trackingHistory.length - 1].notes && (
                      <p className="text-[11px] text-slate-600 mt-0.5">
                        {r.trackingHistory[r.trackingHistory.length - 1].notes}
                      </p>
                    )}
                  </div>
                </div>
              )}

              {/* Data Summary Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-xs text-slate-600">
                <div>
                  <span className="font-bold text-slate-700">تاريخ التقديم: </span>
                  <span className="font-mono">{r.submissionDate}</span>
                </div>
                <div>
                  <span className="font-bold text-slate-700">مقدم الطلب: </span>
                  <span>{r.applicantName} ({r.applicantRelation})</span>
                </div>
                <div>
                  <span className="font-bold text-slate-700">الهاتف: </span>
                  <span className="font-mono">{r.applicantPhone || '—'}</span>
                </div>
              </div>

              {/* DETAILED NOTES BOX */}
              <div className="p-3 bg-amber-50/60 rounded-xl border border-amber-200 text-xs text-slate-800 leading-relaxed">
                <span className="font-bold text-amber-900 block mb-1">
                  الملاحظات المدونة على الاستمارة:
                </span>
                <p className="whitespace-pre-wrap">{r.notes || 'لا توجد ملاحظات مدونة'}</p>
              </div>

              {/* Reason */}
              {r.delayReason && (
                <div className="text-[11px] text-slate-500">
                  <strong className="text-slate-700">سبب التأخير:</strong> {r.delayReason}
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Late Registration Tracking Modal */}
      {trackingRecord && (
        <LateRegTrackerModal
          isOpen={!!trackingRecord}
          record={trackingRecord}
          officeSettings={db.officeSettings}
          onClose={() => setTrackingRecord(null)}
          onUpdateStatus={handleUpdateTrackingStatus}
        />
      )}
    </div>
  );
};
