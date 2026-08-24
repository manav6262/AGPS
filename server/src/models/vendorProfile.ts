/**
 * Vendor Profile Model (SPEC §8.2, §5.2)
 */

import { Schema, model, Document, Types } from 'mongoose';
import { Provenance, DEFAULT_PROVENANCE } from '@agps/shared';
import { ProvenanceSchema } from './provenance.js';

export interface IVendorProfile extends Document {
  _id: Types.ObjectId;
  user: Types.ObjectId;
  companyName: string;
  registrationNo: string;
  gstin: string;
  address: string;
  contactPhone: string;
  experienceYears: number;
  annualTurnoverMinor: number;
  provenance: Provenance;
  isBlacklisted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const vendorProfileSchema = new Schema<IVendorProfile>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
      index: true,
    },
    companyName: {
      type: String,
      required: true,
      trim: true,
    },
    registrationNo: {
      type: String,
      required: true,
      trim: true,
    },
    gstin: {
      type: String,
      required: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    contactPhone: {
      type: String,
      required: true,
      trim: true,
    },
    experienceYears: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    annualTurnoverMinor: {
      type: Number,
      required: true,
      min: 0,
      default: 0,
    },
    provenance: {
      type: ProvenanceSchema,
      required: true,
      default: () => ({ ...DEFAULT_PROVENANCE }),
    },
    isBlacklisted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

export const VendorProfile = model<IVendorProfile>('VendorProfile', vendorProfileSchema);
