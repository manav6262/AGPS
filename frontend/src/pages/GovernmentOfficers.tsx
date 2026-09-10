import React, { useEffect, useState } from 'react';
import { api } from '../services/api.js';
import { IUser, IDepartment } from '@agps/shared';
import { RoleBadge } from '../components/common/RoleBadge.js';
import { useAuth } from '../context/AuthContext.js';
import {
  Users,
  UserPlus,
  Building2,
  AlertCircle,
  CheckCircle2,
  Search,
  X,
  RefreshCw,
  PowerOff,
  Power,
  Edit2,
} from 'lucide-react';

export const GovernmentOfficers: React.FC = () => {
  const { user: currentUser } = useAuth();
  const [officers, setOfficers] = useState<IUser[]>([]);
  const [departments, setDepartments] = useState<IDepartment[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Modal states
  const [showRegisterModal, setShowRegisterModal] = useState(false);
  const [registerForm, setRegisterForm] = useState({
    name: '',
    email: '',
    departmentId: '',
    password: '',
    confirmPassword: '',
  });
  const [registerLoading, setRegisterLoading] = useState(false);
  const [registerError, setRegisterError] = useState<string | null>(null);

  // Department edit modal states
  const [editingOfficer, setEditingOfficer] = useState<IUser | null>(null);
  const [newDepartmentId, setNewDepartmentId] = useState('');
  const [editDeptLoading, setEditDeptLoading] = useState(false);
  const [editDeptError, setEditDeptError] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [officersRes, deptsRes] = await Promise.all([
        api.admin.officers.list(),
        api.departments.list(),
      ]);
      setOfficers(officersRes.officers || []);
      setDepartments(deptsRes.departments || []);
      if (deptsRes.departments && deptsRes.departments.length > 0 && !registerForm.departmentId) {
        setRegisterForm((prev) => ({ ...prev, departmentId: deptsRes.departments[0]._id }));
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load government officers and departments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setRegisterError(null);

    if (registerForm.password !== registerForm.confirmPassword) {
      setRegisterError('Passwords do not match');
      return;
    }
    if (registerForm.password.length < 8) {
      setRegisterError('Password must be at least 8 characters long');
      return;
    }
    if (!registerForm.departmentId) {
      setRegisterError('Please select an authorized government department');
      return;
    }

    setRegisterLoading(true);
    try {
      await api.admin.officers.create({
        name: registerForm.name,
        email: registerForm.email,
        password: registerForm.password,
        departmentId: registerForm.departmentId,
      });

      setShowRegisterModal(false);
      setRegisterForm({
        name: '',
        email: '',
        departmentId: departments[0]?._id || '',
        password: '',
        confirmPassword: '',
      });
      setSuccessMessage('Government Procurement Officer provisioned successfully.');
      setTimeout(() => setSuccessMessage(null), 5000);
      await loadData();
    } catch (err: any) {
      setRegisterError(err.message || 'Failed to provision officer');
    } finally {
      setRegisterLoading(false);
    }
  };

  const handleToggleStatus = async (officer: IUser) => {
    const isDeactivating = officer.isActive !== false;
    const confirmPrompt = isDeactivating
      ? `Are you sure you want to deactivate ${officer.name}? They will no longer be able to log in or manage department procurement.`
      : `Reactivate ${officer.name}?`;

    if (!window.confirm(confirmPrompt)) {
      return;
    }

    setError(null);
    try {
      await api.admin.officers.updateStatus(officer._id || officer.id, !isDeactivating);
      setSuccessMessage(`Account status updated for ${officer.name}.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();
    } catch (err: any) {
      setError(err.message || 'Failed to update account status');
    }
  };

  const handleDepartmentReassignment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingOfficer) return;
    setEditDeptError(null);
    setEditDeptLoading(true);

    try {
      await api.admin.officers.updateDepartment(
        editingOfficer._id || editingOfficer.id,
        newDepartmentId
      );
      setEditingOfficer(null);
      setSuccessMessage(`Department assignment updated for ${editingOfficer.name}.`);
      setTimeout(() => setSuccessMessage(null), 4000);
      await loadData();
    } catch (err: any) {
      setEditDeptError(err.message || 'Failed to reassign department');
    } finally {
      setEditDeptLoading(false);
    }
  };

  const filteredOfficers = officers.filter((o) => {
    const q = searchQuery.toLowerCase();
    const deptName = typeof o.department === 'object' && o.department ? o.department.name : '';
    return (
      o.name.toLowerCase().includes(q) ||
      o.email.toLowerCase().includes(q) ||
      o.role.toLowerCase().includes(q) ||
      deptName.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-stone-200 pb-4">
        <div>
          <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2">
            <Users className="w-5 h-5 text-brand" />
            <span>Government Procurement Officers</span>
          </h1>
          <p className="text-xs text-stone-500">
            Centralized provisioning, departmental jurisdiction assignment, and credential status control
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setShowRegisterModal(true);
              setRegisterError(null);
            }}
            className="btn-primary flex items-center gap-1.5 text-xs py-1.5 px-3"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ Register Government Officer</span>
          </button>
          <button
            onClick={loadData}
            disabled={loading}
            className="btn-secondary p-1.5 text-stone-600 hover:text-stone-900"
            title="Reload official directory"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="p-3 bg-status-passedBg border border-status-passedBorder rounded-sm text-status-passedText text-xs flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-status-failedBg border border-status-failedBorder rounded-sm text-status-failedText text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="flex items-center justify-between gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="w-3.5 h-3.5 text-stone-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by name, email, or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-8 text-xs w-full"
          />
        </div>
        <div className="text-xs text-stone-500 font-mono">
          Total Authorized Officials: <strong className="text-stone-800">{officers.length}</strong>
        </div>
      </div>

      {/* Officers Table */}
      <div className="gov-panel overflow-hidden p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="bg-stone-100 border-b border-stone-200 text-stone-700 font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-4">Name</th>
                <th className="py-2.5 px-4">Official Email</th>
                <th className="py-2.5 px-4">Department</th>
                <th className="py-2.5 px-4">Role</th>
                <th className="py-2.5 px-4">Status</th>
                <th className="py-2.5 px-4">Created</th>
                <th className="py-2.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-stone-200">
              {loading && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-500 font-mono">
                    Loading authorized government officials...
                  </td>
                </tr>
              )}

              {!loading && filteredOfficers.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-stone-500">
                    No government officers match your criteria.
                  </td>
                </tr>
              )}

              {!loading &&
                filteredOfficers.map((officer) => {
                  const deptObj =
                    typeof officer.department === 'object' && officer.department
                      ? officer.department
                      : departments.find(
                          (d) =>
                            d._id === officer.departmentId ||
                            d._id === (officer.department as any)
                        );
                  const isCurrentAdmin = Boolean(
                    currentUser && (officer._id === currentUser.id || officer.id === currentUser.id)
                  );
                  const isActive = officer.isActive !== false;

                  return (
                    <tr key={officer._id || officer.id} className="hover:bg-stone-50 transition-colors">
                      <td className="py-2.5 px-4 font-medium text-stone-900">
                        {officer.name}
                        {isCurrentAdmin && (
                          <span className="ml-2 text-[10px] bg-amber-100 text-amber-800 font-mono px-1 py-0.5 rounded">
                            You
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-stone-600 font-mono">{officer.email}</td>
                      <td className="py-2.5 px-4">
                        {deptObj ? (
                          <div className="flex items-center gap-1.5">
                            <Building2 className="w-3.5 h-3.5 text-stone-400" />
                            <span className="font-medium text-stone-800">{deptObj.name}</span>
                            <span className="text-[10px] font-mono text-stone-400">({deptObj.code})</span>
                          </div>
                        ) : (
                          <span className="text-stone-400 italic">
                            {officer.role === 'SUPER_ADMIN' || officer.role === 'ADMIN'
                              ? 'System-wide Administration'
                              : 'Unassigned'}
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4">
                        <RoleBadge role={officer.role} />
                      </td>
                      <td className="py-2.5 px-4">
                        {isActive ? (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[11px] font-mono font-medium bg-emerald-50 text-emerald-700 border border-emerald-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span>
                            ACTIVE
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-sm text-[11px] font-mono font-medium bg-stone-100 text-stone-600 border border-stone-300">
                            <span className="w-1.5 h-1.5 rounded-full bg-stone-400"></span>
                            DEACTIVATED
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-4 text-stone-500 font-mono text-[11px]">
                        {officer.createdAt ? new Date(officer.createdAt).toLocaleDateString() : '—'}
                      </td>
                      <td className="py-2.5 px-4 text-right space-x-1.5 whitespace-nowrap">
                        {officer.role === 'PROCUREMENT_OFFICER' && (
                          <button
                            onClick={() => {
                              setEditingOfficer(officer);
                              setNewDepartmentId(
                                deptObj?._id || officer.departmentId || departments[0]?._id || ''
                              );
                              setEditDeptError(null);
                            }}
                            className="btn-secondary text-[11px] py-1 px-2 inline-flex items-center gap-1"
                            title="Reassign official department"
                          >
                            <Edit2 className="w-3 h-3 text-stone-600" />
                            <span>Reassign Dept</span>
                          </button>
                        )}

                        <button
                          onClick={() => handleToggleStatus(officer)}
                          disabled={isCurrentAdmin}
                          className={`text-[11px] py-1 px-2 inline-flex items-center gap-1 border rounded-sm transition-colors ${
                            isCurrentAdmin
                              ? 'opacity-40 cursor-not-allowed border-stone-200 text-stone-400 bg-stone-50'
                              : isActive
                              ? 'border-rose-300 text-rose-700 hover:bg-rose-50'
                              : 'border-emerald-300 text-emerald-700 hover:bg-emerald-50'
                          }`}
                          title={
                            isCurrentAdmin
                              ? 'Cannot deactivate active administrative session'
                              : isActive
                              ? 'Deactivate officer account'
                              : 'Activate officer account'
                          }
                        >
                          {isActive ? (
                            <>
                              <PowerOff className="w-3 h-3" />
                              <span>Deactivate</span>
                            </>
                          ) : (
                            <>
                              <Power className="w-3 h-3" />
                              <span>Activate</span>
                            </>
                          )}
                        </button>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal: Register Officer */}
      {showRegisterModal && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-300 shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <UserPlus className="w-4 h-4 text-brand" />
                <span>Register Government Procurement Officer</span>
              </h2>
              <button
                onClick={() => setShowRegisterModal(false)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {registerError && (
              <div className="p-2.5 bg-status-failedBg border border-status-failedBorder rounded-sm text-status-failedText text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{registerError}</span>
              </div>
            )}

            <form onSubmit={handleRegisterSubmit} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-medium text-stone-700 mb-1">Full Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Vikramaditya Sharma"
                  value={registerForm.name}
                  onChange={(e) => setRegisterForm({ ...registerForm, name: e.target.value })}
                  className="w-full"
                />
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">
                  Official Government Email *
                </label>
                <input
                  type="email"
                  required
                  placeholder="officer.name@agps.gov.in"
                  value={registerForm.email}
                  onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                  className="w-full font-mono text-xs"
                />
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">
                  Authorized Government Department *
                </label>
                <select
                  required
                  value={registerForm.departmentId}
                  onChange={(e) => setRegisterForm({ ...registerForm, departmentId: e.target.value })}
                  className="w-full"
                >
                  <option value="" disabled>
                    Select Department
                  </option>
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
                <p className="mt-1 text-[11px] text-stone-500">
                  Officer will have procurement authority strictly isolated to tenders in this department.
                </p>
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">
                  Assigned System Role (Immutable)
                </label>
                <div className="p-2 bg-stone-100 border border-stone-300 rounded font-mono font-medium text-stone-700 flex items-center justify-between">
                  <span>PROCUREMENT_OFFICER</span>
                  <span className="text-[10px] text-stone-500 font-sans">Role is system-enforced</span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Initial Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={registerForm.password}
                    onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                    className="w-full"
                  />
                </div>
                <div>
                  <label className="block font-medium text-stone-700 mb-1">Confirm Password *</label>
                  <input
                    type="password"
                    required
                    placeholder="••••••••••••"
                    value={registerForm.confirmPassword}
                    onChange={(e) =>
                      setRegisterForm({ ...registerForm, confirmPassword: e.target.value })
                    }
                    className="w-full"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-stone-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowRegisterModal(false)}
                  className="btn-secondary py-1.5 px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={registerLoading}
                  className="btn-primary py-1.5 px-4"
                >
                  {registerLoading ? 'Provisioning...' : 'Provision Officer'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Reassign Department */}
      {editingOfficer && (
        <div className="fixed inset-0 bg-black/40 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded border border-stone-300 shadow-xl max-w-sm w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-stone-200 pb-3">
              <h2 className="text-sm font-bold text-stone-900 flex items-center gap-2">
                <Building2 className="w-4 h-4 text-brand" />
                <span>Reassign Department Jurisdiction</span>
              </h2>
              <button
                onClick={() => setEditingOfficer(null)}
                className="text-stone-400 hover:text-stone-700"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {editDeptError && (
              <div className="p-2.5 bg-status-failedBg border border-status-failedBorder rounded-sm text-status-failedText text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{editDeptError}</span>
              </div>
            )}

            <form onSubmit={handleDepartmentReassignment} className="space-y-3.5 text-xs">
              <div>
                <label className="block text-stone-500 mb-0.5">Procurement Officer</label>
                <div className="font-semibold text-stone-800">{editingOfficer.name}</div>
                <div className="font-mono text-stone-500 text-[11px]">{editingOfficer.email}</div>
              </div>

              <div>
                <label className="block font-medium text-stone-700 mb-1">
                  New Department Assignment *
                </label>
                <select
                  required
                  value={newDepartmentId}
                  onChange={(e) => setNewDepartmentId(e.target.value)}
                  className="w-full"
                >
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
                <p className="mt-1.5 text-[11px] text-amber-700 bg-amber-50 p-2 border border-amber-200 rounded">
                  Notice: Reassigning will change the officer's authorization scope to tenders under the new department. An audit trail event will be permanently recorded.
                </p>
              </div>

              <div className="pt-3 border-t border-stone-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setEditingOfficer(null)}
                  className="btn-secondary py-1.5 px-3"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={editDeptLoading}
                  className="btn-primary py-1.5 px-4"
                >
                  {editDeptLoading ? 'Saving...' : 'Confirm Reassignment'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
