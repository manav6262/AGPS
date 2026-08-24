/**
 * Vendor Profile Zod Validators (SPEC §17.3, §23)
 */

import { z } from 'zod';

export const updateVendorProfileSchema = z
  .object({
    companyName: z.string().min(2).max(200).optional(),
    contactPhone: z.string().min(8).max(20).optional(),
    address: z.string().min(5).max(500).optional(),
    experienceYears: z.number().int().min(0).max(100).optional(),
    annualTurnoverMinor: z.number().int().min(0).optional(),
  })
  .strict();
