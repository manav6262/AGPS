/**
 * SHA-256 Config Hash generator (SPEC §13.2)
 */

import { createHash } from 'node:crypto';
import { canonicalJson } from './canonicalJson.js';
import { TenderConfigSnapshot } from '@agps/shared';

export function hashConfig(snapshot: Omit<TenderConfigSnapshot, 'configHash'> | TenderConfigSnapshot): string {
  // Hash over key-sorted canonical JSON of snapshot excluding configHash
  const copy = { ...snapshot } as Record<string, unknown>;
  delete copy.configHash;
  const canonical = canonicalJson(copy);
  return createHash('sha256').update(canonical).digest('hex');
}
