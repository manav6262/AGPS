/**
 * Bid context and data models (SPEC §8.5)
 */

import { Provenance, VerificationStatus } from './provenance.js';

export interface FieldWithProvenance<T> {
  value: T;
  provenance?: Provenance;
}

export interface VendorProfileSnapshot {
  experienceYears: number;
  annualTurnoverMinor: number;
  isBlacklisted?: boolean;
  provenance?: Provenance;
}

export interface DataIntegrityRollup {
  verifiedFieldCount: number;
  totalFieldCount: number;
  overallStatus: VerificationStatus;
}

export interface BidContext {
  bidId: string;
  vendorId: string;
  vendorName?: string;
  submittedAt: string | Date;
  priceMinor: number; // integer paise > 0
  deliveryDays: FieldWithProvenance<number> | number;
  vendorSnapshot: VendorProfileSnapshot;
  technicalValues: Record<string, FieldWithProvenance<any> | any>;
  derivedQualityScore?: number;
  documentCount?: number;
  vendorBlacklisted?: boolean;
  qualityVerificationStatus?: string;
  verifiedFieldRatio?: number;
}
