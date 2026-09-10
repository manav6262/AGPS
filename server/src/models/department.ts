/**
 * Department Model for Procurement Scopes
 */

import { Schema, model, Document, Types } from 'mongoose';

export interface IDepartment extends Document {
  _id: Types.ObjectId;
  name: string;
  code: string;
  description: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const departmentSchema = new Schema<IDepartment>(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
      index: true,
    },
    description: {
      type: String,
      default: '',
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
  },
  {
    timestamps: true,
  }
);

export const Department = model<IDepartment>('Department', departmentSchema);
