import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api } from '../services/api.js';
import { ScoringCriterion, EligibilityRule, IDepartment } from '@agps/shared';
import { useAuth } from '../context/AuthContext.js';
import { PlusCircle, Trash2, ArrowLeft, AlertCircle, Building2, Lock } from 'lucide-react';

export const CreateTender: React.FC = () => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const isOfficer = user?.role === 'PROCUREMENT_OFFICER';

  const [departments, setDepartments] = useState<IDepartment[]>([]);
  const [formData, setFormData] = useState({
    tenderCode: `TND-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`,
    title: '',
    description: '',
    departmentId: '',
    department: '',
    category: 'Information Technology',
    startAt: new Date(Date.now() + 3600000).toISOString().slice(0, 16),
    deadlineAt: new Date(Date.now() + 86400000 * 15).toISOString().slice(0, 16),
    maxBudgetMinor: 5000000000,
    minQualityScore: 70,
    maxDeliveryDays: 60,
    minExperienceYears: 3,
  });

  useEffect(() => {
    async function loadDepartments() {
      try {
        const res = await api.departments.list();
        const depts: IDepartment[] = res.departments || [];
        setDepartments(depts);

        if (isOfficer && user) {
          // Officer scope is strictly locked to their department
          const officerDeptId =
            user.departmentId ||
            (typeof user.department === 'object' && user.department ? user.department._id : '');
          const matched = depts.find(
            (d) => d._id === officerDeptId || (user.department && typeof user.department === 'string' && d.name.includes(user.department))
          ) || depts[0];

          if (matched) {
            setFormData((prev) => ({
              ...prev,
              departmentId: matched._id,
              department: matched.name,
            }));
          }
        } else if (depts.length > 0) {
          setFormData((prev) => ({
            ...prev,
            departmentId: prev.departmentId || depts[0]._id,
            department: prev.department || depts[0].name,
          }));
        }
      } catch (err) {
        console.error('Failed to load departments', err);
      }
    }
    loadDepartments();
  }, [isOfficer, user]);

  const [scoringCriteria, setScoringCriteria] = useState<ScoringCriterion[]>([
    { key: 'price', label: 'Commercial Price', direction: 'lower', weight: 40, unit: 'INR', valueSource: { type: 'BID_FIELD', path: 'priceMinor' } },
    { key: 'quality', label: 'Technical Quality', direction: 'higher', weight: 30, unit: 'points', valueSource: { type: 'DERIVED_QUALITY' } },
    { key: 'delivery', label: 'Delivery Schedule', direction: 'lower', weight: 20, unit: 'days', valueSource: { type: 'BID_FIELD', path: 'deliveryDays' } },
    { key: 'experience', label: 'Vendor Track Record', direction: 'higher', weight: 10, unit: 'years', valueSource: { type: 'VENDOR_FIELD', path: 'experienceYears' } },
  ]);

  const [eligibilityRules] = useState<EligibilityRule[]>([
    { code: 'PRICE_BUDGET', field: 'price', operator: 'lte', value: 5000000000, message: 'Price exceeds budget ceiling', enabled: true },
    { code: 'MIN_EXPERIENCE', field: 'experienceYears', operator: 'gte', value: 3, message: 'Insufficient vendor experience', enabled: true },
    { code: 'NOT_BLACKLISTED', field: 'vendorBlacklisted', operator: 'isFalse', value: false, message: 'Vendor is blacklisted', enabled: true },
  ]);

  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const totalWeight = scoringCriteria.reduce((acc, c) => acc + (Number(c.weight) || 0), 0);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    if (name === 'departmentId') {
      const selectedDept = departments.find((d) => d._id === value);
      setFormData((prev) => ({
        ...prev,
        departmentId: value,
        department: selectedDept ? selectedDept.name : prev.department,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        [name]: type === 'number' ? Number(value) : value,
      }));
    }
  };

  const handleWeightChange = (index: number, newWeight: number) => {
    setScoringCriteria((prev) => {
      const updated = [...prev];
      updated[index] = { ...updated[index], weight: newWeight };
      return updated;
    });
  };

  const handleAddCriterion = () => {
    const newKey = `criterion_${scoringCriteria.length + 1}`;
    setScoringCriteria((prev) => [
      ...prev,
      { key: newKey, label: `Custom Criterion ${prev.length + 1}`, direction: 'higher', weight: 0, unit: 'score', valueSource: { type: 'DERIVED_QUALITY' } },
    ]);
  };

  const handleRemoveCriterion = (index: number) => {
    if (scoringCriteria.length <= 1) return;
    setScoringCriteria((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (totalWeight !== 100) {
      setError(`Scoring criteria weights must sum to exactly 100% (currently ${totalWeight}%).`);
      return;
    }
    setError(null);
    setLoading(true);

    try {
      const payload: any = {
        tenderCode: formData.tenderCode,
        title: formData.title,
        description: formData.description,
        department: formData.department,
        category: formData.category,
        startAt: new Date(formData.startAt).toISOString(),
        deadlineAt: new Date(formData.deadlineAt).toISOString(),
        constraints: {
          maxBudgetMinor: formData.maxBudgetMinor,
          minQualityScore: formData.minQualityScore,
          maxDeliveryDays: formData.maxDeliveryDays,
          minExperienceYears: formData.minExperienceYears,
        },
        scoringCriteria,
        eligibilityRules,
      };

      if (formData.departmentId) {
        payload.departmentId = formData.departmentId;
      }

      const res = await api.tenders.create(payload);
      navigate(`/tenders/${res.tender._id}`);
    } catch (err: any) {
      setError(err.message || 'Failed to create tender notice');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <Link
          to="/tenders"
          className="text-xs text-stone-500 hover:text-stone-800 inline-flex items-center gap-1 mb-1 font-medium"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Back to Tenders Registry</span>
        </Link>
        <h1 className="text-lg font-bold text-stone-900 flex items-center gap-2">
          <PlusCircle className="w-5 h-5 text-brand" />
          <span>Initialize New Procurement Tender Dossier</span>
        </h1>
        <p className="text-xs text-stone-500">
          Configure tender scope, constraints, and mathematical SAW scoring weights (sum = 100%)
        </p>
      </div>

      {error && (
        <div className="p-3 bg-status-failedBg border border-status-failedBorder rounded-sm text-status-failedText text-xs flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Basic Information */}
        <div className="gov-panel space-y-4">
          <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-200 pb-2">
            1. Procurement Overview & Schedule
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Tender Identification Code *
              </label>
              <input
                type="text"
                required
                name="tenderCode"
                value={formData.tenderCode}
                onChange={handleInputChange}
                className="w-full font-mono font-bold text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1 flex items-center justify-between">
                <span>Issuing Ministry / Department *</span>
                {isOfficer && (
                  <span className="text-[10px] text-amber-700 font-normal inline-flex items-center gap-1">
                    <Lock className="w-3 h-3" /> Locked to assigned scope
                  </span>
                )}
              </label>
              {isOfficer ? (
                <div className="p-2 bg-stone-100 border border-stone-300 rounded text-xs text-stone-800 font-medium flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-stone-500" />
                    <span>{formData.department || 'Your Department'}</span>
                  </div>
                  <span className="text-[10px] text-stone-500 font-mono">SCOPED</span>
                </div>
              ) : (
                <select
                  required
                  name="departmentId"
                  value={formData.departmentId}
                  onChange={handleInputChange}
                  className="w-full text-xs"
                >
                  {departments.map((dept) => (
                    <option key={dept._id} value={dept._id}>
                      {dept.name} ({dept.code})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Tender Title / Scope *
              </label>
              <input
                type="text"
                required
                name="title"
                value={formData.title}
                onChange={handleInputChange}
                placeholder="e.g. Supply and Setup of High-Performance Computing Cluster"
                className="w-full text-xs font-medium"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Detailed Scope of Work & Deliverables *
              </label>
              <textarea
                required
                rows={3}
                name="description"
                value={formData.description}
                onChange={handleInputChange}
                placeholder="Specifications, delivery terms, and SLA requirements..."
                className="w-full text-xs"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Bidding Start Date & Time *
              </label>
              <input
                type="datetime-local"
                required
                name="startAt"
                value={formData.startAt}
                onChange={handleInputChange}
                className="w-full text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Submission Deadline *
              </label>
              <input
                type="datetime-local"
                required
                name="deadlineAt"
                value={formData.deadlineAt}
                onChange={handleInputChange}
                className="w-full text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Constraints */}
        <div className="gov-panel space-y-4">
          <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider border-b border-stone-200 pb-2">
            2. Mandatory Constraints & Disqualification Thresholds
          </h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Maximum Allocated Budget (Paise) *
              </label>
              <input
                type="number"
                required
                min={1}
                name="maxBudgetMinor"
                value={formData.maxBudgetMinor}
                onChange={handleInputChange}
                className="w-full text-xs font-mono"
              />
              <span className="text-[11px] text-stone-500 mt-0.5 block">
                ₹{(formData.maxBudgetMinor / 100).toLocaleString('en-IN')} INR
              </span>
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Minimum Quality Score (0-100) *
              </label>
              <input
                type="number"
                required
                min={0}
                max={100}
                name="minQualityScore"
                value={formData.minQualityScore}
                onChange={handleInputChange}
                className="w-full text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Maximum Delivery Days *
              </label>
              <input
                type="number"
                required
                min={1}
                name="maxDeliveryDays"
                value={formData.maxDeliveryDays}
                onChange={handleInputChange}
                className="w-full text-xs font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-stone-700 mb-1">
                Minimum Vendor Experience (Years) *
              </label>
              <input
                type="number"
                required
                min={0}
                name="minExperienceYears"
                value={formData.minExperienceYears}
                onChange={handleInputChange}
                className="w-full text-xs font-mono"
              />
            </div>
          </div>
        </div>

        {/* Scoring Criteria Matrix */}
        <div className="gov-panel space-y-4">
          <div className="flex items-center justify-between border-b border-stone-200 pb-2">
            <h2 className="text-xs font-bold text-stone-800 uppercase tracking-wider">
              3. Scoring Criteria & Weight Allocation (Sum Must Equal 100%)
            </h2>
            <span
              className={`font-mono text-xs font-bold px-2 py-0.5 rounded-sm border ${
                totalWeight === 100
                  ? 'bg-[#F0FDF4] text-[#15803D] border-[#BBF7D0]'
                  : 'bg-[#FEF2F2] text-[#B91C1C] border-[#FECACA]'
              }`}
            >
              Current Sum: {totalWeight}% / 100%
            </span>
          </div>

          <div className="space-y-3">
            {scoringCriteria.map((criterion, idx) => (
              <div
                key={criterion.key}
                className="flex items-center gap-3 bg-stone-50 p-2.5 rounded-sm border border-stone-200 text-xs"
              >
                <div className="flex-1 font-semibold text-stone-800">{criterion.label}</div>
                <div className="text-stone-500 font-mono text-[11px] uppercase">
                  {criterion.direction} ({criterion.unit})
                </div>
                <div className="w-24 flex items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={100}
                    value={criterion.weight}
                    onChange={(e) => handleWeightChange(idx, Number(e.target.value))}
                    className="w-16 font-mono text-right text-xs"
                  />
                  <span className="font-mono">%</span>
                </div>
                {scoringCriteria.length > 1 && (
                  <button
                    type="button"
                    onClick={() => handleRemoveCriterion(idx)}
                    className="text-stone-400 hover:text-status-failedText"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAddCriterion}
            className="btn-secondary text-xs"
          >
            + Add Scoring Dimension
          </button>
        </div>

        {/* Submit */}
        <div className="flex justify-end gap-3 pt-2">
          <Link to="/tenders" className="btn-secondary px-4 py-2 text-xs">
            Cancel
          </Link>
          <button
            type="submit"
            disabled={loading || totalWeight !== 100}
            className="btn-primary px-6 py-2 text-xs font-semibold"
          >
            {loading ? 'Initializing Tender...' : 'Create Draft Tender Dossier'}
          </button>
        </div>
      </form>
    </div>
  );
};
