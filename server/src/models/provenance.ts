/**
 * Provenance Mongoose Schema (SPEC §5.2)
 */

import { Schema } from 'mongoose';
import { Provenance, EvidenceMetadata } from '@agps/shared';

export const EvidenceMetadataSchema = new Schema<EvidenceMetadata>(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    sizeBytes: { type: Number, required: true },
    uploadedAt: { type: Date, required: true, default: Date.now },
  },
  { _id: false }
);

export const ProvenanceSchema = new Schema<Provenance>(
  {
    source: {
      type: String,
      enum: ['SELF_REPORTED', 'DOCUMENT_SUPPORTED', 'ADMIN_ENTERED'],
      required: true,
      default: 'SELF_REPORTED',
    },
    verificationStatus: {
      type: String,
      enum: ['UNVERIFIED', 'PENDING_VERIFICATION', 'VERIFIED', 'DISPUTED'],
      required: true,
      default: 'UNVERIFIED',
    },
    evidence: {
      type: [EvidenceMetadataSchema],
      default: [],
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
    verificationNote: {
      type: String,
      default: null,
    },
  },
  { _id: false }
);
