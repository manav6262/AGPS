/**
 * Evaluation and scoring outcome types (SPEC §8.6)
 */

import { FailedRule } from './rules.js';
import { Provenance } from './provenance.js';
import { TenderConfigSnapshot } from './snapshot.js';

export interface ScoreBreakdownItem {
  key: string;
  label: string;
  rawValue: number;
  unit: string;
  normalizedScore: number;
  weight: number;
  weightedScore: number;
  provenance?: Provenance;
}

export interface RankedResult {
  bidId: string;
  vendorId: string;
  vendorName?: string;
  eligible: boolean;
  failedRules: FailedRule[];
  rawValues?: Record<string, { value: number; unit: string; provenance?: Provenance }>;
  breakdown?: ScoreBreakdownItem[];
  finalScore?: number;
  rank?: number;
  tieBrokenBy?: string | null;
  isNonComparative?: boolean;
}

export interface EvaluationSummary {
  totalBids: number;
  eligibleCount: number;
  rejectedCount: number;
  outcome: 'RANKED' | 'NO_ELIGIBLE_VENDORS';
  winnerBid?: string | null;
  winningScore?: number | null;
}

export interface ProvenanceSummary {
  allSelfReported: boolean;
  verifiedFieldCount: number;
  totalFieldCount: number;
  overallStatus: string;
}

export interface EvaluationResult {
  tenderId: string;
  runNumber: number;
  evaluatedAt: string | Date;
  durationMs: number;
  configHash: string;
  configSnapshot: TenderConfigSnapshot;
  summary: EvaluationSummary;
  results: RankedResult[];
  provenanceSummary: ProvenanceSummary;
}
