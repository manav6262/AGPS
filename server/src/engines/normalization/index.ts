/**
 * Normalization Strategy Registry (SPEC §11.1)
 */

import { NormalizationStrategy, ratioStrategy } from './ratio.js';

export * from './ratio.js';

const strategies: Record<string, NormalizationStrategy> = {
  RATIO: ratioStrategy,
};

export function getNormalizationStrategy(name: string = 'RATIO'): NormalizationStrategy {
  const strategy = strategies[name.toUpperCase()];
  if (!strategy) {
    throw new Error(`Unsupported normalization strategy: '${name}'. Only 'RATIO' is implemented in this build.`);
  }
  return strategy;
}
