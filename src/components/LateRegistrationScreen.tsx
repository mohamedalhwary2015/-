import React, { useState } from 'react';
import {
  FileSpreadsheet,
  Plus,
  Search,
  Trash2,
  Edit2,
  Filter,
  CheckCircle,
  Clock,
  Send,
  XCircle
} from 'lucide-react';
import { DatabaseSchema, LateRegistrationRecord } from '../types';
import { addLateRegistration, updateLateRegistration, deleteLateRegistration } from '../storage/db';

interface LateRegistrationScreenProps {
  db: DatabaseSchema;
}

export const LateRegistrationScreen: React.FC<LateRegistrationScreenProps> = ({ db }) => {
  const [showModal, setShowModal] = useState(false);
  const [editingRecord, setEditingRecord] = useState<LateRegistrationRecord | null>(null);

  // Form Fields
  const [formNumber, setFormNumber] = useState('');
  const [requestDate, setRequestDate] = useState(new Date().toISOString().split('T')[0]);
  const [personName, setPersonName] = useState('');
  const [personNationalId, setPersonNationalId] = useState('');
  const [fatherName, setFatherName] = useState('');
  const [motherName, setMotherName] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [eventType, setEventType] = useState<'ميلاد' | 'وفاة'>('ميلاد');
  const [gender, setGender] = useState<'ذكر' | 'أنثى'>('ذكر');
  const [applicantName, setApplicantName] = useState('');
  const [applicantRelation, setApplicantRelation] = useState('الأب');
  const [status, setStatus] = useState<'قيد الفحص' | 'محول للجنة' | 'معتمد ومقيد' | 'مرفوض'>('قيد الفحص');
  const [staffName, setStaffName] = useState(db.officeSettings?.currentEmployee || 'غير محدد');
  const [notes, setNotes] = useState('');

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');

  const openAddModal = () => {
    setEditingRecord(null);
    setFormNumber('');
    setRequestDate(new Date().toISOString().split('T')[0]);
    setPersonName('');
    setPersonNationalId('');
    setFatherName('');
    setMotherName('');
    setEventDate('');
    setEventType('ميلاد');
    setGender('ذكر');
    setApplicantName('');
    setApplicantRelation('الأب');
    setStatus('قيد الفحص');
    setStaffName(db.officeSettings?.currentEmployee || 'غير محدد');
    setNotes('');
    setShowModal(true);
  };

  const openEditModal = (r: LateRegistrationRecord) => {
    setEditingRecord(r);
    setFormNumber(r.formNumber);
    setRequestDate(r.date);
    setPersonName(r.personName);
    setPersonNationalId(r.personNationalId || '');
    setFatherName(r.fatherName);
    setMotherName(r.motherName);
    setEventDate(r.eventDate);
    setEventType(r.eventType);
    setGender(r.gender);
    setApplicantName(r.applicantName);
    setApplicantRelation(r.applicantRelation);
    setStatus(r.status);
    setStaffName(r.staffName);
    setNotes(r.notes || '');
    setShowModal(true);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formNumber.trim() || !personName.trim()) {
      alert('يرجى إدخال رقم الاستمارة واسم صاحب الواقعة');
      return;
    }

    if (editingRecord) {
      updateLateRegistration(editingRecord.id, {
        formNumber: formNumber.trim(),
        date: requestDate,
        personName: personName.trim(),
        personNationalId: personNationalId.trim(),
        fatherName: fatherName.trim(),
        motherName: motherName.trim(),
        eventDate,
        eventType,
        gender,
        applicantName: applicantName.trim(),
        applicantRelation: applicantRelation.trim(),
        status,
        staffName: staffName.trim() || 'غير محدد',
        notes: notes.trim()
      });
    } else {
      addLateRegistration({
        formNumber: formNumber.trim(),
        date: requestDate,
        personName: personName.trim(),
        personNationalId: personNationalId.trim(),
        fatherName: fatherName.trim(),
        motherName: motherName.trim(),
        eventDate,
        eventType,
        gender,
        applicantName: applicantName.trim(),
        applicantRelation: applicantRelation.trim(),
        status,
        staffName: staffName.trim() || 'غير محدد',
        notes: notes.trim()
      });
    }

    setShowModal(false);
  };

  const handleDelete = (r: LateRegistrationRecord) => {
    if (confirm(`هل أنت متأكد من حذف استمارة ساقط القيد رقم "${r.formNumber}" للمواطن "${r.personName}"؟`)) {
      deleteLateRegistration(r.id, db.officeSettings?.currentEmployee || 'غير محدد');
    }
  };

  const filteredRecords = (db.lateRegistrations || []).filter(r => {
    if (r.isDeleted) return false;
    if (statusFilter !== 'all' && r.status !== statusFilter) return false;
    if (typeFilter !== 'all' && r.eventType !== typeFilter) return false;
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      r.formNumber.toLowerCase().includes(q) ||
      r.personName.toLowerCase().includes(q) ||
      (r.personNationalId && r.personNationalId.includes(q)) ||
      r.applicantName.toLowerCase().includes(q) ||
      r.fatherName.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (s: string) => {
    switch (s) {
      case 'معتمد ومقيد':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
            <CheckCircle className="w-3 h-3" />
            <span>معتمد ومقيد</span>
          </span>
        );
      case 'محول للجنة':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200">
            <Send className="w-3 h-3" />
            <span>محول للجنة</span>
          </span>
        );
      case 'مرفوض':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200">
            <XCircle className="w-3 h-3" />
            <span>مرفوض</span>
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-amber-50 text-amber-800 border border-amber-200">
            <Clock className="w-3 h-3" />
            <span>قيد الفحص</span>
          </span>
        );
    }
  };

  return (
    <div className="space-y-6" id="late-reg-view">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            إدارة استمارات وطلبات ساقط القيد
          </h2>
          <p className="text-xs text-slate-500">
            تسجيل ومتابعة استمارات ساقط قيد الميلاد والوفاة وإحالتها للجنة المختصة
          </p>
        </div>

        <button
          id="btn-add-late-reg"
          onClick={openAddModal}
          className="flex items-center gap-1.5 px-4 py-2 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs sm:text-sm font-semibold shadow-xs transition-all self-start sm:self-auto"
        >
          <Plus className="w-4 h-4" />
          <span>استمارة ساقط قيد جديدة</span>
        </button>
      </div>

      {/* Main Table Card */}
      <div className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
        {/* Filters */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative w-full sm:w-64">
              <Search className="w-4 h-4 text-slate-400 absolute right-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="بحث برقم الاستمارة أو الاسم..."
                className="w-full pr-9 pl-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
              />
            </div>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">كل الحالات</option>
              <option value="قيد الفحص">قيد الفحص</option>
              <option value="محول للجنة">محول للجنة</option>
              <option value="معتمد ومقيد">معتمد ومقيد</option>
              <option value="مرفوض">مرفوض</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">كل الوقائع</option>
              <option value="ميلاد">ساقط قيد ميلاد</option>
              <option value="وفاة">ساقط قيد وفاة</option>
            </select>
          </div>

          <span className="text-xs font-semibold text-slate-500">
            إجمالي الطلبات: {filteredRecords.length}
          </span>
        </div>

        {filteredRecords.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs sm:text-sm">
            لا توجد استمارات ساقط قيد مطابقة للبحث.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs sm:text-sm text-right">
              <thead>
                <tr className="border-b border-slate-200 text-slate-600 font-semibold bg-slate-50">
                  <th className="py-2.5 px-3">رقم الاستمارة</th>
                  <th className="py-2.5 px-3">تاريخ الطلب</th>
                  <th className="py-2.5 px-3">اسم صاحب الواقعة</th>
                  <th className="py-2.5 px-3">النوع/الواقعة</th>
                  <th className="py-2.5 px-3">مقدم الطلب وصلته</th>
                  <th className="py-2.5 px-3">حالة الطلب</th>
                  <th className="py-2.5 px-3">الموظف المختص</th>
                  <th className="py-2.5 px-3 text-center">إجراءات</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRecords.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td className="py-2.5 px-3 font-bold text-slate-900 font-mono">
                      {r.formNumber}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">{r.date}</td>
                    <td className="py-2.5 px-3">
                      <div className="font-semibold text-slate-900">{r.personName}</div>
                      <div className="text-[11px] text-slate-500">
                        والده: {r.fatherName} | والدته: {r.motherName}
                      </div>
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`px-2 py-0.5 rounded-md text-xs font-medium ${
                        r.eventType === 'ميلاد' ? 'bg-teal-50 text-teal-700' : 'bg-slate-100 text-slate-700'
                      }`}>
                        {r.eventType} ({r.gender})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-700">
                      <div>{r.applicantName}</div>
                      <span className="text-[11px] text-slate-400">({r.applicantRelation})</span>
                    </td>
                    <td className="py-2.5 px-3">{getStatusBadge(r.status)}</td>
                    <td className="py-2.5 px-3 text-slate-500">{r.staffName}</td>
                    <td className="py-2.5 px-3 text-center">
                      <div className="inline-flex items-center gap-1">
                        <button
                          onClick={() => openEditModal(r)}
                          className="p-1 text-slate-500 hover:text-teal-600 hover:bg-teal-50 rounded-md transition-colors"
                          title="تعديل الاستمارة أو الحالة"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(r)}
                          className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors"
                          title="حذف الاستمارة"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl p-6 w-full max-w-xl shadow-xl border border-slate-200 max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-slate-900 mb-1">
              {editingRecord ? 'تعديل استمارة ساقط قيد' : 'تسجيل استمارة ساقط قيد جديدة'}
            </h3>
            <p className="text-xs text-slate-500 mb-4">
              بيانات الواقعة الرسمية لعرضها على لجنة ساقط القيد المعتمدة بالإدارة الصحية.
            </p>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">رقم الاستمارة / الملف *</label>
                  <input
                    type="text"
                    required
                    value={formNumber}
                    onChange={(e) => setFormNumber(e.target.value)}
                    placeholder="مثال: 45 / 2025"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ تقديم الطلب *</label>
                  <input
                    type="date"
                    required
                    value={requestDate}
                    onChange={(e) => setRequestDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اسم صاحب الواقعة المراد قيدها *</label>
                  <input
                    type="text"
                    required
                    value={personName}
                    onChange={(e) => setPersonName(e.target.value)}
                    placeholder="الاسم الرباعي لصاحب الواقعة"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الرقم القومي (إن وجد)</label>
                  <input
                    type="text"
                    maxLength={14}
                    value={personNationalId}
                    onChange={(e) => setPersonNationalId(e.target.value)}
                    placeholder="14 رقماً أو اتركه فارغاً"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm font-mono focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الوالد</label>
                  <input
                    type="text"
                    value={fatherName}
                    onChange={(e) => setFatherName(e.target.value)}
                    placeholder="اسم والد صاحب الواقعة"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اسم الوالدة</label>
                  <input
                    type="text"
                    value={motherName}
                    onChange={(e) => setMotherName(e.target.value)}
                    placeholder="اسم والدة صاحب الواقعة"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">نوع الواقعة *</label>
                  <select
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="ميلاد">ساقط قيد ميلاد</option>
                    <option value="وفاة">ساقط قيد وفاة</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">النوع *</label>
                  <select
                    value={gender}
                    onChange={(e) => setGender(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="ذكر">ذكر</option>
                    <option value="أنثى">أنثى</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">تاريخ الواقعة التقريبي</label>
                  <input
                    type="date"
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">اسم مقدم الطلب</label>
                  <input
                    type="text"
                    value={applicantName}
                    onChange={(e) => setApplicantName(e.target.value)}
                    placeholder="اسم من تقدم بالاستمارة"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">صلة القرابة</label>
                  <input
                    type="text"
                    value={applicantRelation}
                    onChange={(e) => setApplicantRelation(e.target.value)}
                    placeholder="الأب، الأم، الأخ، صاحب الشأن..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">حالة الطلب *</label>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as any)}
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm font-semibold focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  >
                    <option value="قيد الفحص">قيد الفحص</option>
                    <option value="محول للجنة">محول للجنة</option>
                    <option value="معتمد ومقيد">معتمد ومقيد</option>
                    <option value="مرفوض">مرفوض</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">الموظف المختص</label>
                  <input
                    type="text"
                    value={staffName}
                    onChange={(e) => setStaffName(e.target.value)}
                    placeholder="اسم الموظف أو غير محدد"
                    className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">ملاحظات وقرار اللجنة</label>
                <textarea
                  rows={2}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="أي ملاحظات أو رقم جلسة اللجنة..."
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs sm:text-sm focus:outline-hidden focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  id="btn-submit-late-reg"
                  className="px-5 py-2 text-xs font-semibold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
                >
                  {editingRecord ? 'حفظ التعديلات' : 'تسجيل الاستمارة'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
