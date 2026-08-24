/**
 * Ratio Normalization Strategy (SPEC §11.1 & §11.2)
 *
 * lower is better:  (min / value) * 100
 * higher is better: (value / max) * 100
 *
 * Degenerate guard: max === min => all vendors score 100
 */

import { Direction } from '@agps/shared';

export interface NormalizationStrategy {
  key: string;
  normalize(value: number, cohort: number[], direction: Direction): number;
}

export class RatioNormalizationStrategy implements NormalizationStrategy {
  readonly key = 'RATIO';

  normalize(value: number, cohort: number[], direction: Direction): number {
    if (!cohort || cohort.length === 0) {
      return 100;
    }

    const min = Math.min(...cohort);
    const max = Math.max(...cohort);

    // Degenerate-case guard: max === min -> all vendors score 100 (SPEC §11.2, Invariant 5)
    if (max === min) {
      return 100;
    }

    if (direction === 'lower') {
      if (value <= 0) {
        throw new Error('NON_POSITIVE_VALUE: lower-is-better normalization requires positive value');
      }
      return (min / value) * 100;
    } else {
      if (max === 0) {
        return 100;
      }
      return (value / max) * 100;
    }
  }
}

export const ratioStrategy = new RatioNormalizationStrategy();
