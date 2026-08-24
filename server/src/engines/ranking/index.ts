/**
 * Ranking Strategy Registry (SPEC §12.5)
 */

import { RankingStrategy, sawRankingStrategy } from './saw.js';

export * from './saw.js';

const strategies: Record<string, RankingStrategy> = {
  SAW: sawRankingStrategy,
};

export function getRankingStrategy(name: string = 'SAW'): RankingStrategy {
  const strategy = strategies[name.toUpperCase()];
  if (!strategy) {
    throw new Error(`Unsupported ranking strategy: '${name}'. Only 'SAW' is implemented in this build.`);
  }
  return strategy;
}
