/**
 * Award & Closure Zod Validators with .strict() (SPEC §15, §17.3)
 */

import { z } from 'zod';

export const confirmWinnerSchema = z
  .object({})
  .strict();

export const overrideWinnerSchema = z
  .object({
    targetBidId: z.string().min(1, 'targetBidId is required'),
    justification: z.string().min(10, 'Mandatory justification must be at least 10 characters explaining override reason'),
  })
  .strict();

export const closeTenderSchema = z
  .object({
    closureNotes: z.string().optional(),
  })
  .strict();
