/**
 * User Model (SPEC §8.1)
 */

import { Schema, model, Document, Types } from 'mongoose';

export type UserRole = 'ADMIN' | 'VENDOR' | 'AUDITOR';

export interface IUser extends Document {
  _id: Types.ObjectId;
  email: string;
  passwordHash: string;
  role: UserRole;
  name: string;
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
      enum: ['ADMIN', 'VENDOR', 'AUDITOR'],
      required: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
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
