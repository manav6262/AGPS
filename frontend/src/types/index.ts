/**
 * Frontend Type Definitions
 */

export type UserRole = 'ADMIN' | 'VENDOR' | 'AUDITOR';

export interface User {
  id: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface VendorProfile {
  _id: string;
  user: string | User;
  companyName: string;
  registrationNo: string;
  gstin: string;
  address: string;
  contactPhone: string;
  experienceYears: number;
  annualTurnoverMinor: number;
  isBlacklisted: boolean;
  provenance: any;
}

export type TenderStatus =
  | 'DRAFT'
  | 'PUBLISHED'
  | 'BIDDING_OPEN'
  | 'BIDDING_CLOSED'
  | 'FINANCIAL_OPEN'
  | 'EVALUATED'
  | 'WINNER_SELECTED'
  | 'CLOSED'
  | 'CANCELLED';

export type ConfigLockState = 'UNLOCKED' | 'SOFT_LOCKED' | 'HARD_LOCKED';

export interface ScoringCriterion {
  key: string;
  label: string;
  direction: 'higher' | 'lower';
  weight: number;
  unit: string;
  valueSource: {
    type: 'BID_FIELD' | 'TECHNICAL_VALUE' | 'VENDOR_FIELD' | 'DERIVED_QUALITY';
    path?: string;
  };
}

export interface EligibilityRule {
  code: string;
  field: string;
  operator: 'lt' | 'lte' | 'gt' | 'gte' | 'eq' | 'neq' | 'in' | 'nin' | 'isTrue' | 'isFalse';
  value: any;
  message: string;
  enabled: boolean;
}

export interface TenderConfigSnapshot {
  version: number;
  configHash: string;
  lockedAt: string;
  lockedBy: string;
  lockState: ConfigLockState;
  hardLockedAt?: string;
  constraints: {
    maxBudgetMinor: number;
    minQualityScore: number;
    maxDeliveryDays: number;
    minExperienceYears: number;
  };
  scoringCriteria: ScoringCriterion[];
  eligibilityRules?: EligibilityRule[];
  tieBreakOrder: string[];
}

export interface Tender {
  _id: string;
  tenderCode: string;
  title: string;
  description: string;
  department: string;
  category: string;
  status: TenderStatus;
  configLockState: ConfigLockState;
  startAt: string;
  deadlineAt: string;
  constraints: {
    maxBudgetMinor: number;
    minQualityScore: number;
    maxDeliveryDays: number;
    minExperienceYears: number;
  };
  scoringCriteria: ScoringCriterion[];
  technicalCriteria?: any[];
  eligibilityRules: EligibilityRule[];
  lockedConfig?: TenderConfigSnapshot;
  configHistory?: TenderConfigSnapshot[];
  firstBidAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Bid {
  _id: string;
  tender: string | Tender;
  vendor: string | User;
  revision: number;
  isLatest: boolean;
  configVersionAtSubmission: number;
  configHashAtSubmission: string;
  priceMinor?: number; // Sealed by default
  deliveryDays: { value: number; provenance: any };
  vendorSnapshot: any;
  technicalValues: Record<string, any>;
  derivedQualityScore: number;
  submittedAt: string;
}

export interface CriterionBreakdown {
  key: string;
  rawValue: any;
  normalizedScore: number;
  weight: number;
  weightedScore: number;
  provenance: any;
}

export interface RankedResult {
  bidId: string;
  vendorId: string;
  vendorName: string;
  eligible: boolean;
  failedRules?: any[];
  finalScore?: number;
  rank?: number;
  breakdown?: CriterionBreakdown[];
  dataIntegrityRatio?: number;
}

export interface Evaluation {
  _id: string;
  tender: string;
  runNumber: number;
  evaluatedAt: string;
  configHash: string;
  configSnapshot: TenderConfigSnapshot;
  results: RankedResult[];
  summary: {
    outcome: 'RANKED' | 'NO_ELIGIBLE_VENDORS' | 'TIE_REQUIRES_MANUAL_REVIEW';
    winnerBid: string | null;
    winningScore: number | null;
    totalBids: number;
    eligibleCount: number;
    rejectedCount: number;
  };
  provenanceSummary: {
    totalFields: number;
    verifiedFields: number;
    verificationRatio: number;
  };
}

export interface AuditEntry {
  _id: string;
  seq: number;
  timestamp: string;
  tender: string;
  actorId: string;
  actorRole: UserRole;
  action: string;
  description: string;
  prevHash: string;
  entryHash: string;
  payload?: any;
}
