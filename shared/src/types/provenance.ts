/**
 * Provenance model (SPEC §5.2)
 *
 * Every vendor-supplied evaluative value carries provenance.
 * In Phase 1:
 * - default source is 'SELF_REPORTED' (or 'DOCUMENT_SUPPORTED' if metadata attached)
 * - verificationStatus is ALWAYS 'UNVERIFIED'
 */

export type ProvenanceSource =
  | 'SELF_REPORTED'        // vendor typed it
  | 'DOCUMENT_SUPPORTED'   // vendor attached evidence metadata
  | 'ADMIN_ENTERED';       // an official entered it (reserved)

export type VerificationStatus =
  | 'UNVERIFIED'           // default in Phase 1
  | 'PENDING_VERIFICATION' // reserved
  | 'VERIFIED'             // reserved (no code path sets this in Phase 1)
  | 'DISPUTED';            // reserved

export interface EvidenceMetadata {
  name: string;
  type: string;
  sizeBytes: number;
  uploadedAt: string | Date;
}

export interface Provenance {
  source: ProvenanceSource;
  verificationStatus: VerificationStatus;
  evidence: EvidenceMetadata[];
  verifiedBy: string | null;     // reserved — always null in Phase 1
  verifiedAt: string | Date | null; // reserved — always null in Phase 1
  verificationNote: string | null; // reserved
}

export const DEFAULT_PROVENANCE: Provenance = {
  source: 'SELF_REPORTED',
  verificationStatus: 'UNVERIFIED',
  evidence: [],
  verifiedBy: null,
  verifiedAt: null,
  verificationNote: null,
};
