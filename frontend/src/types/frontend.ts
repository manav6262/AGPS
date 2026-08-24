/**
 * Frontend-Only UI View State Types (SPEC §25)
 *
 * NOTE: All domain, tender, evaluation, bid, and scoring types are strictly imported from @agps/shared.
 */

export interface TenderFilterState {
  searchTerm: string;
  statusFilter: string;
}

export interface SensitivityWeightDelta {
  criterionKey: string;
  originalWeight: number;
  simulatedWeight: number;
}
