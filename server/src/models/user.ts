/**
 * User Model (SPEC §8.1)
 */

import { Schema, model, Document, Types } from 'mongoose';

export type UserRole = 'ADMIN' | 'SUPER_ADMIN' | 'PROCUREMENT_OFFICER' | 'VENDOR' | 'AUDITOR';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  role: UserRole;
  name: string;
  departmentId?: Types.ObjectId | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const userSchema = new Schema<IUser>(
  {
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false, // excluded by default projection (SPEC §17.4)
    },
    role: {
      type: String,
      enum: ['ADMIN', 'SUPER_ADMIN', 'PROCUREMENT_OFFICER', 'VENDOR', 'AUDITOR'],
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    departmentId: {
      type: Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

export const User = model<IUser>('User', userSchema);
