/**
 * Shared Entity Models (SPEC §6, §14, §15, §16, §25)
 */

import { ConfigLockState, Constraints, TenderConfigSnapshot } from './snapshot.js';
import { ScoringCriterion, TechnicalCriterion } from './criteria.js';
import { EligibilityRule } from './rules.js';
import { Provenance } from './provenance.js';

export type UserRole = 'ADMIN' | 'VENDOR' | 'AUDITOR';

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

export interface IUser {
  id: string;
  _id?: string;
  email: string;
  role: UserRole;
  name: string;
}

export interface IVendorProfile {
  _id: string;
  user: string | IUser;
  companyName: string;
  registrationNo: string;
  gstin: string;
  address: string;
  contactPhone: string;
  experienceYears: number;
  annualTurnoverMinor: number;
  isBlacklisted: boolean;
  provenance: Provenance;
}

export interface ITender {
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
  constraints: Constraints;
  scoringCriteria: ScoringCriterion[];
  technicalCriteria?: TechnicalCriterion[];
  eligibilityRules: EligibilityRule[];
  lockedConfig?: TenderConfigSnapshot;
  configHistory?: TenderConfigSnapshot[];
  firstBidAt?: string | null;
  createdBy?: string | IUser;
  createdAt?: string;
  updatedAt?: string;
}

export interface IBid {
  _id: string;
  tender: string | ITender;
  vendor: string | IUser;
  revision: number;
  isLatest: boolean;
  configVersionAtSubmission: number;
  configHashAtSubmission: string;
  priceMinor?: number; // Sealed by default
  deliveryDays: { value: number; provenance?: Provenance };
  vendorSnapshot: {
    experienceYears: number;
    annualTurnoverMinor: number;
    isBlacklisted?: boolean;
    provenance?: Provenance;
  };
  technicalValues: Record<string, any>;
  derivedQualityScore?: number;
  submittedAt: string;
}

export interface IAuditEntry {
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
