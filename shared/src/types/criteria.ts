/**
 * Generic scoring and technical criteria types (SPEC §7 & §8.4)
 */

export type Direction = 'lower' | 'higher';

export type ValueSource =
  | { type: 'BID_FIELD'; path: 'priceMinor' | 'deliveryDays' }
  | { type: 'VENDOR_FIELD'; path: 'experienceYears' | 'annualTurnoverMinor' }
  | { type: 'TECHNICAL_VALUE'; path: string }   // any technicalCriteria key
  | { type: 'DERIVED_QUALITY' };                // aggregate of all technical criteria

export interface ScoringCriterion {
  key: string;            // stable id, e.g. 'price', 'warranty'
  label: string;          // display name
  direction: Direction;
  weight: number;         // INTEGER percent; all weights sum to exactly 100
  unit: string;           // 'INR' | 'score' | 'days' | 'years' | 'months' | ...
  valueSource: ValueSource;
}

export interface NumericTechnicalCriterion {
  key: string;
  label: string;
  points: number;         // INTEGER; all points sum to exactly 100
  type: 'numeric';
  direction: Direction;
  min: number;
  max: number;
}

export interface BooleanTechnicalCriterion {
  key: string;
  label: string;
  points: number;
  type: 'boolean';
}

export interface EnumOption {
  value: string;
  label: string;
  fraction: number;       // 0..1
}

export interface EnumTechnicalCriterion {
  key: string;
  label: string;
  points: number;
  type: 'enum';
  options: EnumOption[];
}

export interface ChecklistItem {
  key: string;
  label: string;
  fraction: number;       // fractions sum to 1
}

export interface ChecklistTechnicalCriterion {
  key: string;
  label: string;
  points: number;
  type: 'checklist';
  items: ChecklistItem[];
}

export type TechnicalCriterion =
  | NumericTechnicalCriterion
  | BooleanTechnicalCriterion
  | EnumTechnicalCriterion
  | ChecklistTechnicalCriterion;
