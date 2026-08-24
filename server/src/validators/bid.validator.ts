/**
 * Bid Zod Validators with .strict() (SPEC §5.2, §8.5, §17.3, Tests 26, 37)
 */

import { z } from 'zod';

const evidenceMetadataSchema = z
  .object({
    name: z.string().min(1),
    type: z.string().min(1),
    sizeBytes: z.number().int().positive(),
    uploadedAt: z.string().datetime().or(z.date()).optional(),
  })
  .strict();

export const submitBidSchema = z
  .object({
    // Financial envelope
    priceMinor: z.number().int().min(1, 'priceMinor must be a positive integer in paise (>= 1)'),

    // Technical envelope
    deliveryDays: z.number().int().min(1, 'deliveryDays must be at least 1 day'),
    technicalValues: z.record(z.any()).default({}),

    // Evidence metadata (metadata only per SPEC §5.6)
    evidence: z.array(evidenceMetadataSchema).optional().default([]),
  })
  .strict(); // Rejects any attempt to pass verificationStatus: 'VERIFIED', role, or other unauthorized fields (Test 26)

export type SubmitBidInput = z.infer<typeof submitBidSchema>;
