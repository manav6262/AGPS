/**
 * Auth Zod Schemas with .strict() (SPEC §17.3)
 */

import { z } from 'zod';

export const registerVendorSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    name: z.string().min(2, 'Name is required'),
    companyName: z.string().min(2, 'Company name is required'),
    registrationNo: z.string().min(2, 'Registration number is required'),
    gstin: z.string().min(2, 'GSTIN is required'),
    address: z.string().min(2, 'Address is required'),
    contactPhone: z.string().min(10, 'Valid phone number is required'),
    experienceYears: z.number().min(0).default(0),
    annualTurnoverMinor: z.number().min(0).default(0),
  })
  .strict(); // Strips or errors on unauthorized extra fields like role: 'ADMIN'

export const loginSchema = z
  .object({
    email: z.string().email(),
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

export type RegisterVendorInput = z.infer<typeof registerVendorSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
