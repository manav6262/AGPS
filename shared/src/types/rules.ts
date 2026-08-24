/**
 * Eligibility Rule definitions (SPEC §10.1)
 */

export type RuleOperator =
  | 'lt'
  | 'lte'
  | 'gt'
  | 'gte'
  | 'eq'
  | 'neq'
  | 'in'
  | 'nin'
  | 'isTrue'
  | 'isFalse';

export interface EligibilityRule {
  code: string;      // UPPER_SNAKE, unique within tender
  field: string;     // MUST be whitelisted
  operator: RuleOperator;
  value: number | boolean | string | string[];
  message: string;
  enabled: boolean;
}

export interface FailedRule {
  code: string;
  message: string;
  field: string;
  operator: string;
  actualValue: any;
  requiredValue: any;
}

export interface EligibilityResult {
  eligible: boolean;
  failedRules: FailedRule[];
}

export const WHITELISTED_RULE_FIELDS = [
  'price',
  'deliveryDays',
  'experienceYears',
  'derivedQualityScore',
  'annualTurnover',
  'documentCount',
  'vendorBlacklisted',
  'qualityVerificationStatus',
  'verifiedFieldRatio',
] as const;

export const WHITELISTED_OPERATORS: RuleOperator[] = [
  'lt',
  'lte',
  'gt',
  'gte',
  'eq',
  'neq',
  'in',
  'nin',
  'isTrue',
  'isFalse',
];
