# AGPS — Automated Government Procurement System
## Master Build Specification — v4 (APPROVED — Phase 1 authorised)

**Project:** B.Tech final-year prototype
**Status:** **APPROVED.** Phase 1 (pure engines + unit tests) is authorised. Phases 2+ proceed per §27.
**Supersedes:** v1 (original 34-section prompt), v2, v3.

Changes introduced in **v4** are marked **[v4]**. Earlier markers **[v3]** / **[v2]** record provenance of prior decisions.

**v4 applies four approved decisions:** graduated configuration locking (§6) · `TND-2026-003` retained as the generic-criteria proof (§21) · `MINMAX` deferred with TOPSIS (§28) · evidence recorded as metadata only, with mandatory UI disclosure (§5.6).

---

## 0. Document contract

This is the single source of truth for the build. Where it conflicts with any earlier prompt, this document wins.

**Approval gate:** §31 lists what must be signed off before Phase 1 begins.

---

## 1. Principles

AGPS demonstrates **automated, transparent, configurable and explainable** government tender evaluation using a **deterministic rule-based decision engine with weighted multi-criteria scoring**.

**Hard constraints**

- **NO** machine learning, LLM, generative AI, chatbot, or predictive model anywhere in the evaluation path.
- **NO** blockchain. **NO** Docker.
- **NO TOPSIS or any second MCDM method in this build.** **[v3]** The architecture must *permit* one later (§12.5); it must not contain one now.
- Every number shown to a user is computed by the backend from stored data. Nothing is faked, hardcoded, or computed in the UI.
- Evaluation is **deterministic**: identical inputs always yield identical output (§13).
- **The system never overstates what it knows.** **[v3]** Vendor-supplied data is labelled as vendor-supplied, everywhere it appears (§6).

**Do not over-engineer.** §29 is the explicit out-of-scope list.

---

## 2. Academic framing **[v2]**

A **two-layer decision model**:

| Layer | Method | Character |
|---|---|---|
| 1. Screening | Rule-based eligibility filter | **Non-compensatory** — failing any mandatory rule is fatal |
| 2. Ranking | **SAW** (Simple Additive Weighting) with linear scale transformation | **Compensatory** — strengths and weaknesses trade off by declared weight |

This mirrors **QCBS** (Quality-and-Cost-Based Selection) and aligns with GFR 2017 / CVC two-envelope practice (§8).

**Prepared viva answers**

- *"Why did a vendor who is best at nothing win?"* → Compensatory aggregation above a non-compensatory floor. Eligibility guarantees no amount of cheapness rescues sub-threshold quality; above that floor, declared weights govern trade-offs. Deliberate design property, not an artefact.
- *"How do you know the vendor's quality claim is true?"* **[v3]** → **We don't, and the system says so.** AGPS records quality data as vendor-reported and unverified, displays that provenance on every screen, and provides the data model and rule hooks for a verification workflow to be added without redesign. Claiming verification we have not performed would be the actual flaw.

---

## 3. Technology stack

**Frontend** — React 18 · Vite · **TypeScript** · React Router v6 · Tailwind CSS · **TanStack Query** · Recharts
**Backend** — Node.js 20+ · Express 4 · **TypeScript** · **Zod** · Vitest + Supertest
**Database** — MongoDB + Mongoose. Atlas free tier recommended, but §12.3's single-document design removes any need for transactions, so a standalone `mongod` is sufficient.

```
AGPS/
  server/        Express + engines
  client/        React
  shared/        TypeScript types shared by both
  SPEC.md  README.md
```

---

## 4. Roles

| Role | Capability |
|---|---|
| **ADMIN** | Full lifecycle, rule/weight configuration, run evaluation, confirm award, manage vendors |
| **VENDOR** | Register, maintain profile, view published tenders, submit/revise own bid, view own status and own rejection reasons |
| **AUDITOR** **[v2]** | **Read-only everywhere**, including full audit log and chain verification. Changes nothing. |

**Confidentiality (absolute):** a vendor can never read another vendor's bid values through any endpoint at any stage. Enforced by query-level scoping (§17.2), not UI hiding.

---

# PART A — DATA PROVENANCE **[v3]**

## 5. Vendor-reported data is labelled as vendor-reported

### 5.1 The problem being solved honestly

Quality, technical attributes, and experience are **submitted by the party that benefits from them**. AGPS does not have — and this prototype will not build — an independent verification capability.

Two dishonest responses are rejected:

1. **Trusting the number silently.** A vendor typing `qualityScore: 100` and winning. (This was v1's behaviour.)
2. **Deriving a score from unverified facts and calling the result objective.** (This was v2's behaviour. Computing quality from a vendor's *claimed* 60-month warranty does not make the warranty real. v2 solved the wrong half of the problem.)

**v3's position:** structure the input so a vendor cannot award themselves an arbitrary score, **and** carry explicit provenance so nothing is ever presented as verified when it is not.

### 5.2 Provenance model

Every vendor-supplied evaluative value carries provenance:

```ts
interface Provenance {
  source: 'SELF_REPORTED'        // vendor typed it            ← Phase 1 default
        | 'DOCUMENT_SUPPORTED'   // vendor attached evidence   ← metadata only in Phase 1
        | 'ADMIN_ENTERED';       // an official entered it

  verificationStatus: 'UNVERIFIED'            // ← Phase 1 default, always
                    | 'PENDING_VERIFICATION'
                    | 'VERIFIED'
                    | 'DISPUTED';

  evidence: Array<{                // metadata only — no file storage in scope
    name: string; type: string; sizeBytes: number; uploadedAt: Date;
  }>;

  verifiedBy: ObjectId | null;     // reserved — always null in Phase 1
  verifiedAt: Date | null;         // reserved — always null in Phase 1
  verificationNote: string | null; // reserved
}
```

**Phase 1 rules — non-negotiable**

- Every vendor-submitted value is written with `source: 'SELF_REPORTED'`, `verificationStatus: 'UNVERIFIED'`.
- The API **never** returns `VERIFIED` in this build. There is no code path that sets it.
- `verifiedBy` / `verifiedAt` / `verificationNote` exist in the schema, are always null, and are documented in the README as **reserved for future work**.

Attaching evidence sets `source: 'DOCUMENT_SUPPORTED'` but **leaves `verificationStatus: 'UNVERIFIED'`** — attaching a document is not verification. This distinction is deliberate and should be stated in the paper.

### 5.3 Mandatory disclosure in the UI

Wherever a vendor-supplied evaluative value is displayed — bid detail, score breakdown, decision explanation, ranking table, exported report — it is accompanied by a provenance badge:

```
Quality  76.40  [ VENDOR-REPORTED · UNVERIFIED ]
```

Every evaluation result screen and every export carries this block:

> **Data provenance notice**
> Technical and quality values in this evaluation were supplied by the bidding vendors and have **not been independently verified** by this system. Eligibility screening and scoring operate on vendor-declared data. Independent verification of vendor claims is outside the scope of this prototype.

Badge colour is **neutral grey**, never green. Green reads as "verified" at a glance and would undo the disclosure.

### 5.4 Structured claims, not free scores

A vendor still cannot type a quality score directly. They declare **structured factual claims** against criteria the tender declared in advance, and the engine aggregates them deterministically (§9). This achieves two things at once:

- removes arbitrary self-scoring (the v1 flaw),
- keeps the inputs **auditable factual claims** — "60-month warranty", "ISO 9001 certified" — which are precisely the things a future verification workflow would check against documents.

**A false claim becomes a falsifiable, attributable, audit-logged statement rather than an unfalsifiable opinion.** That is the honest, achievable improvement, and it is what the paper should claim — no more.

### 5.5 Designed-in verification seam (built later, not now)

Reserved but unimplemented:

1. `PATCH /api/bids/:id/technical/:key/verify` — route **not registered** in Phase 1.
2. Eligibility fields `qualityVerificationStatus` and `verifiedFieldRatio` exist in the field whitelist (§10.1) so a future tender can require `qualityVerificationStatus eq VERIFIED`. **No seeded tender enables such a rule**, because nothing can currently satisfy it.
3. `Bid.dataIntegrity` rollup (`verifiedFieldCount`, `totalFieldCount`, `overallStatus`) is computed and stored — in Phase 1 it always reports `0 / n · UNVERIFIED`, which is the truthful value.
4. `TECHNICAL_VERIFICATION` is **not** a lifecycle state. Adding it later inserts one node into the transition map (§7.3) and touches nothing else.

### 5.6 Evidence is metadata only **[v4 — approved decision 4]**

Vendors may record supporting-document **metadata** — filename, document type, size, upload timestamp. **No file is stored, transmitted, or retained.** There is no upload endpoint, no storage bucket, no filesystem write.

**Mandatory UI copy**, shown on the bid form and beside every evidence list:

> **Evidence is recorded as metadata only.** This prototype stores the document name, type and size that you declare. **The file itself is not uploaded, not stored, and not examined.** Declared evidence does not constitute verification of any claim.

Recording evidence sets `source: 'DOCUMENT_SUPPORTED'` and **leaves `verificationStatus: 'UNVERIFIED'`** — see §5.2. A vendor naming a file they do not possess is indistinguishable from one who does, and the UI must never imply otherwise.

This limitation belongs in the README under **Known limitations** and in the paper's threats-to-validity section. It is a scope decision, not an oversight, and stating it plainly is stronger than leaving a reader to infer that files were checked.

---

# PART B — CONFIGURATION SNAPSHOT

## 6. Graduated configuration locking **[v4 — approved decision 1]**

**The lock is triggered by the arrival of the first bid, not by publication.**

*Rationale: freezing at publish (v3) was needlessly rigid — a typo discovered five minutes after publishing, with nobody yet affected, would have cost a whole new tender code. Freezing at first bid preserves the principle that actually matters: **no bidder is ever judged by rules that changed after they committed.** Before the first bid, nobody has committed, so a versioned and audited correction harms no one.*

### 6.1 Three lock states

| State | Condition | Evaluation configuration | Snapshot |
|---|---|---|---|
| `UNLOCKED` | `DRAFT` | fully editable | `null` — none yet |
| `SOFT_LOCKED` | `PUBLISHED` / `BIDDING_OPEN`, **zero bids** | editable; **every change bumps `version` and is audit-logged** | exists, versioned |
| `HARD_LOCKED` | **first bid received**, and forever after | **immutable — `409 CONFIG_HARD_LOCKED`** | frozen permanently |

**A material change after bids exist requires cancel-and-reissue** with a new `tenderCode`, linked to the original via `supersedes` / `supersededBy`. This is what real procurement does, and it leaves a visible trail rather than a silent edit.

### 6.2 What may change while `SOFT_LOCKED`

**Editable** (each edit → new snapshot version + `TENDER_CONFIG_REVISED` audit event):
`constraints` · `eligibilityRules` · `technicalCriteria` · `scoringCriteria` and weights · `tieBreakOrder` · `normalizationMethod` · `rankingMethod` · `title` · `description` · `deadlineAt` (must remain in the future)

**Never editable after `DRAFT`, in any state:**
`tenderCode` · `department` · `createdBy` · `startAt` once it has passed

### 6.3 `TenderConfigSnapshot`

Created on `DRAFT → PUBLISHED`. Re-created (version + 1) on each `SOFT_LOCKED` edit. Frozen at first bid.

```ts
interface TenderConfigSnapshot {
  version: number;              // 1 at publish; +1 per SOFT_LOCKED revision
  lockState: 'SOFT_LOCKED' | 'HARD_LOCKED';
  lockedAt: Date;               // when THIS version was written
  lockedBy: ObjectId;
  hardLockedAt: Date | null;    // set once, when the first bid arrives
  engineVersion: string;        // e.g. "1.0.0"

  rankingMethod: 'SAW';         // §12.5 — one value in this build
  normalizationMethod: 'RATIO'; // 'MINMAX' deferred, §11.1

  constraints: {
    maxBudgetMinor: number; minQualityScore: number;
    maxDeliveryDays: number;  minExperienceYears: number;
  };

  eligibilityRules: EligibilityRule[];
  technicalCriteria: TechnicalCriterion[];
  scoringCriteria: ScoringCriterion[];
  tieBreakOrder: string[];

  configHash: string;           // sha256 over key-sorted canonical JSON, §13.2
}
```

`tender.configHistory: TenderConfigSnapshot[]` retains **every** version. Realistically 1–3 entries, since revision is only possible before any bid exists.

### 6.4 The hard lock must be atomic **[v4 — critical]**

A bid arriving mid-edit is a genuine race: a check-then-write would let a configuration change land *after* a vendor has already committed to the old rules — precisely the corruption this whole design exists to prevent.

**Guard inside the query, never before it:**

```ts
// Config edit — succeeds ONLY if no bid has landed
const updated = await Tender.findOneAndUpdate(
  { _id: id, firstBidAt: null, status: { $in: ['PUBLISHED', 'BIDDING_OPEN'] } },
  { $set: { /* new working config + new snapshot */ },
    $push: { configHistory: newSnapshot } },
  { new: true },
);
if (!updated) throw new Conflict('CONFIG_HARD_LOCKED');

// Bid submission — first writer wins; later writers no-op harmlessly
await Tender.updateOne({ _id: id, firstBidAt: null }, { $set: { firstBidAt: now } });
```

This is the same lesson as the IDOR fix (§17.2): **the guard belongs in the filter, not in an `if` before it.**

### 6.5 The rule that makes it work

> **The evaluation engine reads configuration ONLY from a `TenderConfigSnapshot`. It must never read the working configuration fields on the tender document.**

Enforced by signature: `evaluationService` receives a `TenderConfigSnapshot`, never a `Tender`. Reading live config is structurally impossible, not merely discouraged.

### 6.6 Bids record the configuration they were made under

Each bid stores `configVersionAtSubmission` and `configHashAtSubmission`.

Because of the hard lock, **every bid in a tender must share the same values** — this is an invariant, asserted by test 24b. Storing them is cheap and turns the invariant into evidence a reader can check directly rather than a claim they must take on trust.

### 6.7 Reproducibility across configurations

Each tender carries its own snapshot history, so an admin may freely create later tenders with entirely different rules, criteria, weights, or normalization **without affecting any historical evaluation**.

Each `Evaluation` additionally stores a **full copy** of the exact snapshot it ran under, plus its `configHash` (§12.2) — defence in depth, so a stored result stays self-explanatory even if the tender document is later modified or removed.

**Verification test:** `evaluation.configSnapshot.configHash` equals the `configHash` of the snapshot version in force at evaluation time, asserted on every run.

---

# PART C — GENERIC SCORING ARCHITECTURE

## 7. Criteria are configuration, not code **[v3 — extended from v2]**

### 7.1 Design requirement

> The scoring engine must have **no knowledge** of Price, Quality, Delivery, or Experience. Those are the default tender's *configuration*. Adding Warranty, Technical Compliance, or Maintenance Support must require **zero changes** to any engine file.

### 7.2 `ScoringCriterion`

```ts
interface ScoringCriterion {
  key: string;            // stable id, e.g. 'price', 'warranty'
  label: string;          // display name
  direction: 'lower' | 'higher';
  weight: number;         // INTEGER percent; all weights sum to exactly 100
  unit: string;           // 'INR' | 'score' | 'days' | 'years' | 'months' | ...
  valueSource: ValueSource;
}
```

### 7.3 `ValueSource` — the extension point

```ts
type ValueSource =
  | { type: 'BID_FIELD';       path: 'priceMinor' | 'deliveryDays' }
  | { type: 'VENDOR_FIELD';    path: 'experienceYears' | 'annualTurnoverMinor' }
  | { type: 'TECHNICAL_VALUE'; path: string }   // any technicalCriteria key
  | { type: 'DERIVED_QUALITY' };                // aggregate of all technical criteria
```

A single pure resolver maps a criterion to a number:

```ts
resolveCriterionValue(
  criterion: ScoringCriterion,
  context:   BidContext,
  technical: TechnicalCriterion[],
): number
```

| `type` | Resolution |
|---|---|
| `BID_FIELD` | whitelisted numeric field on the bid |
| `VENDOR_FIELD` | whitelisted numeric field on the vendor profile snapshot |
| `TECHNICAL_VALUE` | the declared value, coerced to a number by its declared type: `boolean → 0\|100`, `numeric → as-is`, `enum → fraction × 100`, `checklist → ticked fraction × 100` |
| `DERIVED_QUALITY` | the aggregate quality score, `[0, 100]` (§9) |

**Paths are whitelisted.** Arbitrary path traversal is rejected at tender validation, not at evaluation time.

### 7.4 Adding a future criterion — worked examples

Each of these is **pure configuration**. No engine file changes.

**Warranty**
```jsonc
// tender.technicalCriteria — declares the claim
{ "key": "warrantyMonths", "label": "Warranty (months)", "type": "numeric",
  "direction": "higher", "min": 12, "max": 60, "points": 20 }

// tender.scoringCriteria — scores it directly
{ "key": "warranty", "label": "Warranty", "direction": "higher",
  "weight": 10, "unit": "months",
  "valueSource": { "type": "TECHNICAL_VALUE", "path": "warrantyMonths" } }
```

**Technical Compliance**
```jsonc
{ "key": "specCompliance", "label": "Specification compliance", "type": "checklist",
  "points": 40, "items": [ /* 8 items × 0.125 */ ] }

{ "key": "technicalCompliance", "label": "Technical Compliance", "direction": "higher",
  "weight": 15, "unit": "score",
  "valueSource": { "type": "TECHNICAL_VALUE", "path": "specCompliance" } }
```

**Maintenance Support**
```jsonc
{ "key": "maintenanceTier", "label": "Maintenance support", "type": "enum", "points": 20,
  "options": [ { "value": "basic",    "fraction": 0.3 },
               { "value": "standard", "fraction": 0.7 },
               { "value": "premium",  "fraction": 1.0 } ] }

{ "key": "maintenanceSupport", "label": "Maintenance Support", "direction": "higher",
  "weight": 10, "unit": "score",
  "valueSource": { "type": "TECHNICAL_VALUE", "path": "maintenanceTier" } }
```

### 7.5 Default tender configuration (the only one seeded as primary)

```
key         label       direction  weight  valueSource
─────────────────────────────────────────────────────────────────────
price       Price       lower        40    BID_FIELD/priceMinor
quality     Quality     higher       30    DERIVED_QUALITY
delivery    Delivery    lower        20    BID_FIELD/deliveryDays
experience  Experience  higher       10    VENDOR_FIELD/experienceYears
                                    ────
                                     100
```

**Weights are integers and must satisfy `sum === 100` exactly.** *Float weights are rejected: `40.1 + 29.9 + 20 + 10` can evaluate to `100.00000000000001`, making the publish check pass or fail at random.*

Criteria count is bounded at **2 ≤ n ≤ 10** — enough for any realistic tender, small enough to keep the UI honest.

---

# PART D — DOMAIN MODEL

## 8. Schemas

Money is stored as **integer paise** (`…Minor`). All timestamps UTC.

### 8.1 `User`
```
_id · email (unique, lowercase, indexed) · passwordHash (bcrypt 12, select:false)
role: ADMIN | VENDOR | AUDITOR · name · isActive · createdAt · updatedAt
```

### 8.2 `VendorProfile`
```
user (ref, unique) · companyName · registrationNo · gstin · address · contactPhone
experienceYears        number >= 0   +  provenance: Provenance   [v3]
annualTurnoverMinor    integer       +  provenance: Provenance   [v3]
isBlacklisted          boolean (admin-set, not vendor-supplied)
createdAt · updatedAt
```
**[v3]** `isVerified` from v2 is **removed**. It implied a verification capability this build does not have. Vendor registration status is not modelled as verification.

### 8.3 `Tender`
```
_id · tenderCode (unique, indexed) · title · description · department · category
createdBy · status (§7 of Part E) · startAt · deadlineAt

# --- working configuration: editable ONLY in DRAFT ---
constraints          { maxBudgetMinor, minQualityScore, maxDeliveryDays, minExperienceYears }
eligibilityRules     EligibilityRule[]
technicalCriteria    TechnicalCriterion[]
scoringCriteria      ScoringCriterion[]
normalizationMethod  'RATIO'
rankingMethod        'SAW'
tieBreakOrder        string[]

# --- snapshot: the ONLY config the engine reads (§6) ---
lockedConfig         TenderConfigSnapshot | null      # null while DRAFT
configHistory        TenderConfigSnapshot[]           # every version   [v4]
configLockState      UNLOCKED | SOFT_LOCKED | HARD_LOCKED               [v4]
firstBidAt           Date | null    # atomic hard-lock trigger, §6.4    [v4]

# --- reissue lineage (§6.1) --- [v4]
supersedes           ref Tender | null
supersededBy         ref Tender | null

# --- outcome ---
latestEvaluation · recommendedBid · awardedBid · awardJustification
```

### 8.4 `TechnicalCriterion`
```
key · label · points (INTEGER; all points sum to exactly 100) · type
  numeric   → direction, min, max
  boolean   → —
  enum      → options: [{ value, label, fraction 0..1 }]
  checklist → items:   [{ key, label, fraction }]  (fractions sum to 1)
```

### 8.5 `Bid`
```
_id · tender (indexed) · vendor (indexed) · revision · isLatest (indexed) · submittedAt
configVersionAtSubmission · configHashAtSubmission        # §6.6        [v4]

# --- technical envelope ---
technicalValues:  Map<key, { value: any, provenance: Provenance }>     [v3]
deliveryDays:     { value: integer >= 1, provenance: Provenance }      [v3]
vendorSnapshot:   { experienceYears, annualTurnoverMinor, provenance } [v3]

# --- financial envelope — SEALED until FINANCIAL_OPEN (§8 Part E) ---
priceMinor:       integer > 0

# --- derived, stored ---
derivedQualityScore:  number [0,100]        # computed from technicalValues
dataIntegrity:        { verifiedFieldCount, totalFieldCount, overallStatus }   [v3]
```
Indexes: `{ tender, vendor, revision }`; partial-unique `{ tender, vendor, isLatest }` where `isLatest: true`.

**Revisions are supported.** Resubmission before the deadline creates `revision + 1` and flips the prior `isLatest` to false. **Only `isLatest: true` bids are evaluated.** Prior revisions are immutable and visible in the audit trail.

### 8.6 `Evaluation` — one document per run
```
_id · tender (indexed) · runNumber (unique per tender) · evaluatedBy · evaluatedAt
configSnapshot     full copy of tender.lockedConfig       [v3]
configHash         must equal tender.lockedConfig.configHash
durationMs         honestly measured (§12.4)
provenanceSummary  { allSelfReported: true, verifiedFieldCount: 0, ... }   [v3]

summary  { totalBids, eligibleCount, rejectedCount,
           outcome: 'RANKED' | 'NO_ELIGIBLE_VENDORS', winnerBid, winningScore }

results[] {
  bid · vendor · vendorName
  eligible · failedRules[] { code, message, field, operator, actualValue, requiredValue }
  rawValues   Map<criterionKey, { value, unit, provenance }>     [v3]
  breakdown[] { key, label, rawValue, unit, normalizedScore, weight, weightedScore }
  finalScore  (full precision, unrounded)
  rank · tieBrokenBy
}
```

### 8.7 `AuditLog` — append-only, hash-chained
```
tender (indexed) · seq (unique per tender) · timestamp · actor · actorRole
action · vendor · description · payload · prevHash · hash
```

---

# PART E — BEHAVIOUR

## 9. Quality derivation

Quality is the deterministic aggregate of the vendor's declared technical claims:

```
boolean    earned = value === true ? points : 0
numeric    t = clamp((value - min) / (max - min), 0, 1)
           earned = points * (direction === 'higher' ? t : 1 - t)
enum       earned = points * option.fraction
checklist  earned = points * Σ(fraction of ticked items)

derivedQualityScore = Σ earned          // ∈ [0, 100] by construction
```

**This aggregation is deterministic. Its inputs are not verified.** Both facts are displayed together, always (§5.3).

**[v3]** v2's `COMMITTEE` mode is **removed from scope**. It required an evaluation-committee workflow that does not exist and would have introduced a subjective, non-deterministic input — contradicting §1. `ADMIN_ENTERED` remains in the `Provenance.source` enum as a reserved value for future work.

---

## 10. Eligibility engine — data-driven

### 10.1 Rule model
```ts
interface EligibilityRule {
  code: string;      // UPPER_SNAKE, unique within tender
  field: string;     // MUST be whitelisted
  operator: string;  // MUST be whitelisted
  value: number | boolean | string | string[];
  message: string;
  enabled: boolean;
}
```

**Whitelisted fields**
```
price   deliveryDays   experienceYears   derivedQualityScore
annualTurnover   documentCount   vendorBlacklisted
technical.<key>                                   ← any declared technicalCriteria key
qualityVerificationStatus   verifiedFieldRatio    ← reserved, §5.5 — unusable in Phase 1
```

**Whitelisted operators** — `lt lte gt gte eq neq in nin isTrue isFalse`

**A whitelist, not a DSL.** Do not build an expression parser: the whitelist provides genuine runtime configurability with no injection surface and no grammar to debug.

### 10.2 Contract
```ts
evaluateEligibility(context: BidContext, rules: EligibilityRule[]): EligibilityResult
```
- Evaluates **every** enabled rule; returns **all** failures. Never short-circuits.
- **Pure function** — no DB, no I/O, no `Date.now()`, no randomness.

### 10.3 Default rule set
```
PRICE_WITHIN_BUDGET       price                lte  <maxBudgetMinor>
QUALITY_MEETS_MINIMUM     derivedQualityScore  gte  <minQualityScore>
DELIVERY_WITHIN_LIMIT     deliveryDays         lte  <maxDeliveryDays>
EXPERIENCE_MEETS_MINIMUM  experienceYears      gte  <minExperienceYears>
VENDOR_NOT_BLACKLISTED    vendorBlacklisted    isFalse
```

---

## 11. Normalization and scoring

### 11.1 Normalization strategy (pluggable, one implementation)

```ts
interface NormalizationStrategy {
  key: 'RATIO';                                        // 'MINMAX' reserved
  normalize(value: number, cohort: number[], direction: Direction): number;
}
```

**`RATIO` — implemented, and the only method in this build**
```
lower is better:   (min / value) * 100
higher is better:  (value / max) * 100
```

**`MINMAX` — reserved.** Interface accommodates it; **not implemented in Phase 1.** Adding it later is one file plus one enum value. Deferred alongside TOPSIS (§12.5) so Phase 1 stays focused.

### 11.2 Degenerate-case guards — mandatory

| Situation | Unguarded result | Required behaviour |
|---|---|---|
| `max === min` on a criterion | division by zero / all-100 ambiguity | **All vendors score 100** — the criterion carries no discriminating information |
| `deliveryDays = 0` | `min / 0` → `Infinity` | **Blocked at validation:** `deliveryDays >= 1` |
| `priceMinor = 0` | `Infinity` | **Blocked at validation:** `priceMinor > 0` |
| All vendors at 0 experience | `0 / 0` → `NaN` | caught by the `max === min` guard → all 100 |
| One eligible vendor | scores 100.00 silently | permitted, but UI **labels it**: *"Single eligible bid — normalized scores are not comparative."* |

```ts
function normalize(value, cohort, direction) {
  const min = Math.min(...cohort), max = Math.max(...cohort);
  if (max === min) return 100;                       // no discriminating information
  if (direction === 'lower' && value <= 0)
    throw new EngineError('NON_POSITIVE_VALUE');
  return direction === 'lower' ? (min / value) * 100 : (value / max) * 100;
}
```

### 11.3 Aggregation
```
finalScore = Σ over scoringCriteria of (normalizedScore × weight / 100)
```
Summation follows the **order of the frozen `configSnapshot.scoringCriteria` array**. Fixing the order fixes floating-point accumulation, which is what makes results bit-identical across runs.

**Precision:** compute and store at full `float64`. **Round to 2 decimals at display only.** Rounding during accumulation makes the breakdown fail to sum to the total — a visible bug on the explainability screen.

### 11.4 Tie-breaking — deterministic cascade
Stored in `tieBreakOrder`, frozen in the snapshot:
```
1. finalScore   DESC
2. price        ASC     (cheaper wins)
3. derivedQualityScore  DESC
4. deliveryDays ASC
5. submittedAt  ASC     (earlier wins)
6. bidId        ASC     (lexicographic — guarantees a TOTAL order)
```
Step 6 makes an unresolved tie mathematically impossible. When a tie resolves at step ≥ 2, set `tieBrokenBy` and show it: *"Ranked above Vendor C on identical score; resolved by lower price."*

### 11.5 Golden test vector

v1's §8 worked example, verified arithmetically consistent — frozen as a regression fixture tying the code to the paper:

```
Vendor A — price ₹8,00,000 · quality 85 · delivery 20d · experience 8y
Cohort   — minPrice ₹7,40,000 · maxQuality 100 · minDelivery 15d · maxExperience 10y
Weights  — 40 / 30 / 20 / 10 · RATIO

price       92.50 × 0.40 = 37.00
quality     85.00 × 0.30 = 25.50
delivery    75.00 × 0.20 = 15.00
experience  80.00 × 0.10 =  8.00
                            ─────
final                       85.50
```
Note Vendor A is **best at nothing** yet ranks #1 — see §2.

---

## 12. Evaluation execution

### 12.1 Pipeline
```
POST /tenders/:id/evaluate
  → load tender.lockedConfig            (never the working fields)
  → load bids where isLatest = true
  → build BidContext[]                   (pure data, no Mongoose documents)
  ┌─ PURE ZONE — no I/O beyond this point ────────────────┐
  │  qualityEngine        derived quality per bid          │
  │  eligibilityEngine    screen → eligible[] rejected[]   │
  │  criterionResolver    resolve values for eligible[]    │
  │  normalization        per-criterion cohort scaling     │
  │  scoringEngine        weighted aggregation             │
  │  rankingStrategy      SAW ordering + tie-break         │
  └────────────────────────────────────────────────────────┘
  → persist ONE Evaluation document
  → audit events
  → tender status → EVALUATED  |  FAILED
```

### 12.2 Snapshot integrity
The run asserts `configSnapshot.configHash === tender.lockedConfig.configHash` before executing and stores both. Mismatch aborts with `500 CONFIG_INTEGRITY_FAILURE` and an audit event.

### 12.3 Idempotency and atomicity
- In-process lock per tender; double-clicking creates exactly one run.
- Each run inserts a **new** `Evaluation` with `runNumber = max + 1`. Prior runs are retained and viewable.
- Because all results live in **one document**, the run is atomic under a single `insertOne` — no replica set, no transaction.
- Re-running after `EVALUATED` is permitted and audit-logged; **blocked once `WINNER_SELECTED`**.

### 12.4 Honest measurement
`durationMs` measured with `performance.now()` around the pure zone only. **Never fabricate, estimate, or favourably round a performance number.**

### 12.5 Ranking-method seam — designed, not built **[v3]**

```ts
interface RankingStrategy {
  key: 'SAW';                                   // the ONLY value in this build
  rank(cohort: NormalizedBid[], config: TenderConfigSnapshot): RankedResult[];
}
```

`evaluationService` depends on this interface, never on `sawStrategy` directly. `tender.rankingMethod` is an enum whose sole value is `'SAW'`.

**A future comparative method (TOPSIS or otherwise) would require:** one new file implementing `RankingStrategy`, one added enum value, one registry entry. **Zero changes** to `evaluationService`, the persistence layer, or the API contract.

**It is not implemented, not stubbed, not referenced in the UI, and not in the seed data.** The decision on whether to add it is deferred until Phase 1 is complete, tested, and demonstrated. Should it be declined, nothing in the codebase becomes dead — the interface has one legitimate implementation and pays for itself in testability.

### 12.6 Zero-eligible-vendor path
`eligibleCount === 0` → `summary.outcome = 'NO_ELIGIBLE_VENDORS'`, tender → `FAILED`, `TENDER_FAILED` audit event, dedicated screen listing every vendor with full failure reasons plus a **Re-tender** action cloning the tender to `DRAFT`.

---

## 13. Determinism contract

Guaranteed by five mandatory mechanisms:

1. **Publish-time lock** (§6) — config frozen before bidding opens.
2. **Config hash** — `sha256(canonicalJson(snapshot))` using a **key-sorted canonical serializer**. Plain `JSON.stringify` is key-order dependent and would produce different hashes for identical configs.
3. **Total ordering** — the tie-break cascade ends in a unique key (§11.4).
4. **Fixed accumulation order** — summation follows the snapshot array order (§11.3).
5. **Pure engines** — no `Date.now()`, no `Math.random()`, no I/O inside the pure zone. Timing is captured by the caller as metadata, never as engine input.

**Test:** run the same evaluation twice; assert deep equality of `results` and identical `configHash`.

---

## 14. Tender lifecycle

### 14.1 States
```
DRAFT · PUBLISHED · BIDDING_OPEN · BIDDING_CLOSED
FINANCIAL_OPEN · UNDER_EVALUATION · EVALUATED · WINNER_SELECTED · CLOSED
CANCELLED (terminal) · FAILED (terminal — zero eligible vendors)
```
**[v3]** v2's `TECHNICAL_EVALUATION` state is **removed** — it existed only for the committee-scoring mode dropped in §9. `TECHNICAL_VERIFICATION` may be inserted later at the same position (§5.5).

- `PUBLISHED` — visible, `now < startAt`, bids rejected.
- `BIDDING_OPEN` — `startAt ≤ now ≤ deadlineAt`, bids accepted.
- **Computed on read**, not by a scheduler. *A cron job is one more thing that can fail mid-demo, for zero benefit at this scale.*

### 14.2 Transition map — one file, one source of truth
```ts
const TRANSITIONS: Record<Status, Status[]> = {
  DRAFT:            ['PUBLISHED', 'CANCELLED'],
  PUBLISHED:        ['BIDDING_OPEN', 'CANCELLED'],
  BIDDING_OPEN:     ['BIDDING_CLOSED', 'CANCELLED'],
  BIDDING_CLOSED:   ['FINANCIAL_OPEN', 'CANCELLED'],
  FINANCIAL_OPEN:   ['UNDER_EVALUATION', 'CANCELLED'],
  UNDER_EVALUATION: ['EVALUATED', 'FAILED'],
  EVALUATED:        ['WINNER_SELECTED', 'UNDER_EVALUATION', 'CANCELLED'],
  WINNER_SELECTED:  ['CLOSED', 'CANCELLED'],
  CLOSED: [], CANCELLED: [], FAILED: [],
};
```

### 14.3 Two-envelope sealing
Grounded in GFR 2017 Rule 173 / CVC guidance.

1. `priceMinor` is **never** returned by any API — including to ADMIN — while status is `BIDDING_OPEN` or earlier.
2. Enforced by **service-layer field projection**, not UI hiding and not a controller `if`.
3. Unsealed at `FINANCIAL_OPEN`, which writes a `FINANCIAL_BIDS_OPENED` audit event recording who opened them and how many.

No cryptographic sealing. Access control plus the audit event is the correct prototype scope, stated honestly in the paper.

---

## 15. Award and explainability

### 15.1 Award flow
```
Engine ranks → rank #1 stored as recommendedBid
  → UI labels it "SYSTEM RECOMMENDATION — not a legal award"
  → Admin reviews the full breakdown
      ├─ confirms rank #1 ─────────→ one click
      └─ selects another vendor ───→ MANDATORY justification (≥ 30 chars)
  → awardedBid + awardJustification · status → WINNER_SELECTED
  → audit: WINNER_CONFIRMED | WINNER_OVERRIDDEN
```
An overridden award renders a **persistent warning banner** on the tender page and in every export, showing the justification, the recommended vendor, the awarded vendor, and the score gap.

### 15.2 Rejection explanation
Never a bare "Rejected." Render **every** failed rule from the backend result:
```
Vendor B — REJECTED

❌ Price exceeds maximum budget
   Bid price:      ₹12,00,000
   Maximum budget: ₹10,00,000

❌ Delivery time exceeds permitted limit
   Vendor delivery: 45 days
   Maximum allowed: 30 days
```
Rendered from `failedRules[]`. **No client-side reason strings.**

### 15.3 Decision explanation — generated from data only

**Templates that assert unverified facts are banned.** *(v1's "✓ Lowest/competitive bid score" may be false — in §11.5 the winner is not the lowest bidder.)*

```
Why is Vendor A recommended?

Eligibility
  ✓ Passed all 5 mandatory rules

Competitive position (2 eligible bids)
  Price       ₹8,00,000   rank 2 of 2   normalized 92.50   contributed 37.00
  Quality     85 / 100    rank 1 of 2   normalized 85.00   contributed 25.50   [VENDOR-REPORTED · UNVERIFIED]
  Delivery    20 days     rank 2 of 2   normalized 75.00   contributed 15.00   [VENDOR-REPORTED · UNVERIFIED]
  Experience  8 years     rank 1 of 2   normalized 80.00   contributed  8.00   [VENDOR-REPORTED · UNVERIFIED]

Final score 85.50 / 100 — highest among eligible bids
Margin over rank #2: 2.80 · Decisive criterion: quality

⚠ Technical and quality values are vendor-reported and not independently verified.

Config hash a3f9…c21e · Engine v1.0.0 · Method SAW · Normalization RATIO
```

---

## 16. Audit log

**Actions** — `TENDER_CREATED · TENDER_PUBLISHED · TENDER_CONFIG_REVISED · TENDER_CONFIG_HARD_LOCKED · TENDER_REISSUED · TENDER_CANCELLED · TENDER_FAILED · BIDDING_OPENED · BIDDING_CLOSED · BID_SUBMITTED · BID_REVISED · FINANCIAL_BIDS_OPENED · EVALUATION_STARTED · EVALUATION_COMPLETED · VENDOR_REJECTED · VENDOR_RANKED · WINNER_RECOMMENDED · WINNER_CONFIRMED · WINNER_OVERRIDDEN · TENDER_CLOSED · VENDOR_BLACKLISTED`

**Hash chain**, per tender:
```
seq 1:  prevHash = '0' × 64
seq n:  prevHash = hash(seq n-1)
hash    = sha256(prevHash + '|' + canonicalJson({ seq, timestamp, actorId, action, tenderId, vendorId, payload }))
```
- **Append-only, enforced at the model level** — a Mongoose `pre` hook rejects `update*`, `findOneAndUpdate`, `delete*` on the collection.
- Writes serialized per tender by the same lock as evaluation, so `seq` cannot race.
- **"Verify audit chain"** action (ADMIN, AUDITOR) recomputes and reports `OK` or the first broken `seq`.

**Stated limitation:** tamper-**evident** within a tender, not tamper-proof. An attacker with full database write access could recompute an entire tender's chain. It raises the cost of undetected tampering; it does not prevent tampering. Overclaiming here would be worse than the limitation.

---

## 17. Security

### 17.1 Authentication
bcrypt cost 12 · `passwordHash` `select: false` · JWT access token 15 min + refresh token in an **httpOnly, SameSite=Strict** cookie · `express-rate-limit` on `/auth/login` and `/auth/register` (5 / 15 min / IP) · `helmet` · CORS **allowlist** (never `origin: '*'` with credentials).

### 17.2 Authorization — IDOR is the real risk
Role checks do not stop Vendor A fetching `/api/bids/<vendor-B-id>`. **Ownership is enforced inside the query, never checked after fetching:**
```ts
// WRONG — leaks existence; one missed check leaks data
const bid = await Bid.findById(id);
if (bid.vendor !== req.user.id) throw new Forbidden();

// RIGHT — scoping is structural
const filter = req.user.role === 'VENDOR' ? { _id: id, vendor: req.user.id } : { _id: id };
const bid = await Bid.findOne(filter);
```

### 17.3 Mass assignment
**Never** spread `req.body` into a model — a vendor could post `{ eligible: true }`, `{ role: 'ADMIN' }`, or **`{ verificationStatus: 'VERIFIED' }`** **[v3]**. Every write handler passes **only** the output of a Zod `.strict().parse()`.

### 17.4 Other
Zod on body, params **and** query · central error middleware, no stack traces in responses · deadline enforced by the **server** clock only · `runValidators: true` on updates · financial fields and `passwordHash` excluded by **default model projection**, opted into explicitly where authorized.

---

## 18. Data conventions

| Concern | Rule |
|---|---|
| Money | integer paise; never float, never float-accumulated; converted at the API boundary only |
| Display | `Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 })` → `₹10,00,000` natively |
| Dates | UTC stored, IST rendered (`Asia/Kolkata`); server clock for deadlines |
| Scores | full precision stored; `toFixed(2)` at render only |
| Weights | integer percent; `sum === 100` exact |
| IDs | `tenderCode` (`TND-2026-001`) is user-facing; `_id` is never shown as the identifier |

---

## 19. Sensitivity analysis

### 19.1 Weight simulation
`POST /api/tenders/:id/simulate` — **strictly read-only**. Never writes an `Evaluation`, never mutates the tender, blocked for VENDOR. Re-runs the pure scoring engine over the stored eligible cohort with hypothetical weights and returns the hypothetical ranking beside the actual one.

Because it uses the same `RankingStrategy` interface, a future comparative method would be simulatable through the same endpoint with no API change.

### 19.2 Rank stability
Per weight configuration: **winner changed?** · **Kendall's tau-b** vs baseline · **mean absolute rank displacement**. Pure arithmetic, no ML.

### 19.3 Winner breakeven
Closed-form: how far one criterion's weight must move before the top two swap, holding remaining weights proportional.

> *"Vendor A remains the recommendation until the price weight exceeds 47%, at which point Vendor E overtakes it."*

Rendered on the decision-explanation screen.

---

## 20. Experimental design

*v1's headline metric was "evaluation time in seconds". At 5 vendors that is well under a millisecond and invites "so what?"*

1. **Scaling** — synthetic cohorts of 50 / 100 / 500 / 1,000 / 5,000 bids; show the profile is sort-dominated, `O(n log n)`. Plot it.
2. **Rank stability** — sweep the price weight 10 → 70 in steps of 5; record winner changes and Kendall's tau.
3. **Rule-failure distribution** — which eligibility rules eliminate the most vendors across seeded tenders.
4. **Reproducibility** — N repeated runs of one configuration; assert identical `configHash` and rankings, N/N.
5. **Configuration isolation** **[v3]** — create later tenders with different rules; re-run an older evaluation; assert byte-identical results. Direct empirical evidence for the snapshot design.
6. **Consistency vs. manual evaluation** — decision steps and reproducibility, *not* wall-clock milliseconds.

**Never fabricate, extrapolate, or favourably round a measurement.** Every number in the paper must be reproducible from the seed.

---

## 21. Seed data

`npm run seed` is idempotent (drops and rebuilds).

**Accounts** — 1 ADMIN · 1 AUDITOR · 6 VENDORS

**Tender `TND-2026-001` — Supply of Computer Systems**
Budget ₹10,00,000 · min quality 70 · max delivery 30 d · min experience 3 y
Weights 40/30/20/10 · RATIO · SAW

| Vendor | Outcome | Reason |
|---|---|---|
| A | **Eligible** | passes all → rank #1 |
| B | Rejected | price ₹12,00,000 > budget |
| C | Rejected | derived quality 62 < 70 |
| D | Rejected | delivery 45 d > 30 |
| E | **Eligible** | passes all, different score profile |
| F | Rejected | **two rules at once** — over budget *and* under-experienced (proves multi-failure reporting) |

**Tender `TND-2026-002`** — same bid values, weights **20/50/20/10**. Demonstrates the ranking flipping purely from configuration. **The clearest possible illustration of the project's thesis.**

**Tender `TND-2026-003`** **[v3]** — six scoring criteria including **Warranty**, **Technical Compliance**, and **Maintenance Support**, sourced entirely via `TECHNICAL_VALUE`. **Proves the generic-criteria architecture with zero engine changes.** Kept in the seed permanently as living evidence.

---

## 22. Test plan — 42 tests

Engine tests are **pure unit tests, no database**, and must run in under one second.

**Eligibility** — (1) price > budget → REJECT · (2) quality < min → REJECT · (3) delivery > max → REJECT · (4) all pass → ELIGIBLE · (5) multiple failures → **all** returned

**Scoring & ranking** — (6) weights ≠ 100 → publish blocked · (7) two eligible → correct scores and ranks · (8) **golden vector reproduces 85.50 exactly** · (9) breakdown sums to final within 1e-9 · (10) `max === min` → all 100, no NaN · (11) single eligible → 100.00, flagged non-comparative · (12) zero eligible → `FAILED`, no crash · (13) exact tie → cascade resolves, `tieBrokenBy` set · (14) determinism — two runs identical + identical hash · (15) float weights rejected

**Generic criteria [v3]** — (16) a **6-criterion** tender scores correctly with **no engine change** · (17) a `TECHNICAL_VALUE` criterion (warranty) resolves and scores · (18) an `enum` criterion coerces via declared fractions · (19) an unwhitelisted `valueSource.path` is rejected at tender validation · (20) criteria count outside 2–10 rejected

**Config snapshot & graduated lock [v4]** — (21) publishing populates `lockedConfig` v1 with a stable hash, state `SOFT_LOCKED` · (21b) editing weights while `SOFT_LOCKED` succeeds → version 2, new hash, `TENDER_CONFIG_REVISED` audited, old version retained in `configHistory` · (22) the **first bid** sets `firstBidAt` and `HARD_LOCKED` · (22b) editing any evaluation config after that → **409 `CONFIG_HARD_LOCKED`** · (22c) editing `tenderCode` in **any** post-`DRAFT` state → 409 · (23) evaluation reads the snapshot, **not** working fields — assert by mutating working fields directly in the DB and confirming the result is unchanged · (24) a *later* tender with different rules leaves an *earlier* stored evaluation byte-identical · (24b) **invariant** — every bid in a tender shares one `configVersionAtSubmission` and `configHashAtSubmission` · (24c) **race** — a config edit issued against a tender that already has a bid fails atomically, even when the pre-check would have passed

**Provenance [v3]** — (25) every vendor-submitted value persists as `SELF_REPORTED` / `UNVERIFIED` · (26) **no code path can set `VERIFIED`** — posting it is stripped by the Zod schema · (27) every evaluation response carries the provenance disclosure

**Lifecycle & bids** — (28) bid after deadline rejected (server clock) · (29) duplicate bid → revision 2, only `isLatest` evaluated · (30) illegal transition → 409 · (31) evaluation run twice → runNumbers 1 and 2, no duplicates

**Security** — (32) wrong-role admin endpoint → 401/403 · (33) **IDOR** — Vendor A requests Vendor B's bid → 404 · (34) **price sealed** during `BIDDING_OPEN`, even for ADMIN · (35) mass assignment (`role`, `eligible`, `verificationStatus`) stripped · (36) audit-chain verification detects a mutated entry · (37) `deliveryDays: 0` / `priceMinor: 0` rejected

---

## 23. API surface

```
POST   /api/auth/register · login · refresh · logout      GET /api/auth/me

GET    /api/vendors                       ADMIN | AUDITOR
PATCH  /api/vendors/:id/blacklist         ADMIN
GET    /api/vendors/me/profile            VENDOR
PATCH  /api/vendors/me/profile            VENDOR

GET    /api/tenders                       role-scoped listing
POST   /api/tenders                       ADMIN
GET    /api/tenders/:id                   role-scoped projection
PATCH  /api/tenders/:id                   ADMIN — DRAFT only, else 409
POST   /api/tenders/:id/transition        ADMIN — guarded by the transition map
POST   /api/tenders/:id/evaluate          ADMIN — idempotent
POST   /api/tenders/:id/simulate          ADMIN | AUDITOR — READ-ONLY
GET    /api/tenders/:id/breakeven         ADMIN | AUDITOR
POST   /api/tenders/:id/award             ADMIN — justification required on override
GET    /api/tenders/:id/report.csv        export incl. provenance disclosure

POST   /api/tenders/:id/bids              VENDOR — creates a revision
GET    /api/tenders/:id/bids              ADMIN | AUDITOR — sealed per §14.3
GET    /api/bids/mine                     VENDOR
GET    /api/bids/:id                      ownership-scoped query

GET    /api/tenders/:id/evaluations       GET /api/evaluations/:id
GET    /api/tenders/:id/audit             GET /api/tenders/:id/audit/verify

# reserved, NOT registered in Phase 1
# PATCH /api/bids/:id/technical/:key/verify
```

---

## 24. Backend structure

```
server/src/
  config/          env · db
  models/          user · vendorProfile · tender · bid · evaluation · auditLog
  engines/         ── PURE ZONE: zero imports from models/ express/ mongoose ──
    qualityEngine.ts        derived quality from technical claims
    eligibilityEngine.ts    rule screening
    criterionResolver.ts    ValueSource → number            [v3]
    normalization/
      index.ts              strategy registry
      ratio.ts              the only implementation
    scoringEngine.ts        weighted aggregation
    ranking/
      index.ts              strategy registry              [v3]
      saw.ts                the only implementation        [v3]
    tieBreak.ts
  services/        evaluationService · lifecycle · configSnapshot · sensitivityService · auditService
  controllers/  routes/  middleware/  validators/  utils/  seed/
  app.ts  server.ts
tests/  unit/ (engines, no DB)   integration/ (supertest + in-memory mongo)
```

**Enforced by ESLint `no-restricted-imports`:** nothing under `engines/` may import from `models/`, `express`, or `mongoose`.

*This is what lets §26's promise hold — the procurement algorithm lifts into the research paper as self-contained, independently testable logic, entirely separate from React and Express.*

---

## 25. Frontend structure

```
client/src/
  components/  ui/ · tender/ · bid/ · evaluation/ · charts/
               ProvenanceBadge.tsx · ProvenanceDisclosure.tsx     [v3]
  pages/       auth/ · admin/ · vendor/ · auditor/
  services/    typed API client (against shared/)
  hooks/       TanStack Query hooks
  context/     auth
  utils/       formatCurrency (en-IN) · formatDate (IST) · formatScore
  App.tsx  main.tsx
shared/types/  Provenance · ScoringCriterion · ValueSource · EligibilityRule
               TenderConfigSnapshot · EvaluationResult
```

**No procurement logic in the client.** The frontend renders backend output; it never computes a score, rank, normalization, or rejection reason.

---

## 26. UI/UX

Serious enterprise/government tool. Clean, restrained, dense where density helps.

**Required on every data view:** loading · error · empty states, and confirmation dialogs on publish, cancel, award, close.
**Banned:** gradients, glassmorphism, decorative animation, "AI startup" styling.
**Mandatory:** provenance badges (§5.3) wherever vendor-supplied evaluative data appears; the disclosure block on every results screen and export.

**Screens** — Auth (login, vendor register) · Admin (dashboard · tender list · create wizard with live weight-sum validation · tender detail: *Information · Rules · Criteria · Bids · Results · Decision · Sensitivity · Audit*) · Vendor (dashboard · open tenders · bid form · my bids · bid result) · Auditor (read-only mirror + chain verification)

**Persistent transparency footer** on every results screen: `configHash · engineVersion · rankingMethod · normalizationMethod · evaluatedAt · provenance summary`.

---

## 27. Build order

Engines are Phase 1 — they *are* the project, and being pure functions they are fully testable before any database exists.

| Phase | Deliverable |
|---|---|
| **1** | Repo · shared types · **pure engines + unit tests 1–20** (no DB, no server) |
| **2** | Models · Provenance · canonical JSON · config snapshot + hash · audit chain + verify |
| **3** | Auth · roles · middleware · security hardening |
| **4** | Tender CRUD · transition map · publish validation + config lock |
| **5** | Vendor profiles · bid submission with provenance · revisions · sealing |
| **6** | `evaluationService` wiring engines to persistence · idempotency |
| **7** | Award flow with override justification · explainability payloads |
| **8** | Seed (all three tenders) · integration tests 21–37 |
| **9** | Frontend spine: auth → tender → bid → results, with provenance UI |
| **10** | Sensitivity · breakeven · dashboard · charts · CSV export |
| **11** | UI polish · empty/error states · accessibility |
| **12** | README · end-to-end verification · paper artefacts |

**If time runs short, cut from Phase 10 upward. Never cut Phases 1–8.**

---

## 28. Out of scope

Do not build: ML / AI / LLM / chatbot / predictive model · blockchain · Docker/K8s/CI · real file upload and storage (metadata only) · email/SMS/push · WebSockets · a rule expression DSL (whitelist instead, §10.1) · payments · i18n · microservices · SSR · cryptographic bid sealing · lifecycle cron/scheduler · **TOPSIS or any second MCDM method** · **`MINMAX` normalization** · **any verification workflow** — the seam exists (§5.5), the implementation does not.

### Deferred decisions (revisit only after Phase 12)
| Candidate | Precondition |
|---|---|
| TOPSIS as a comparative experiment | Phase 1–12 complete, tested, demonstrated; time remaining; supervisor agrees it adds research value |
| `MINMAX` normalization sensitivity | same |
| Vendor claim verification workflow | same |

**None of these may be started early, stubbed, or referenced in the UI.**

---

## 29. Acceptance test

Must run end-to-end through the real UI, API and database.

```
Admin logs in
  ↓ creates TND-2026-001 · budget ₹10,00,000 · min quality 70 · max delivery 30d · min exp 3y
  ↓ declares technical criteria summing to exactly 100 points
  ↓ sets weights 40/30/20/10 — publish blocked while sum ≠ 100
  ↓ publishes → lockedConfig created, configHash displayed        ← verify
  ↓ attempts to edit rules → 409                                  ← verify
Vendors A–F submit bids
  ↓ every technical value stored SELF_REPORTED / UNVERIFIED       ← verify
  ↓ Vendor A revises → revision 2; only revision 2 is evaluated
  ↓ Admin CANNOT see any price while bidding is open              ← verify
  ↓ Vendor A CANNOT read Vendor B's bid by id                     ← verify
  ↓ post-deadline submission rejected by the server clock
Admin closes bidding → BIDDING_CLOSED → FINANCIAL_OPEN (audit event written)
  ↓ runs evaluation, double-clicking → exactly ONE run created
Engine
  ↓ B rejected (price) · C (quality) · D (delivery) · F (two rules)
  ↓ A and E eligible, normalized, ranked, tie-break applied
  ↓ A recommended, labelled SYSTEM RECOMMENDATION
Admin
  ↓ reads the breakdown — each criterion sums visibly to the final score
  ↓ sees VENDOR-REPORTED · UNVERIFIED on every quality/technical value   ← verify
  ↓ opens Sensitivity: quality → 50% — observes whether the winner flips
  ↓ reads breakeven: "A wins until price weight exceeds X%"
  ↓ confirms A → WINNER_SELECTED → CLOSED
Auditor logs in
  ↓ views the full audit trail · runs Verify audit chain → OK
  ↓ re-runs the evaluation → identical configHash, identical ranking

Then verify:
  · TND-2026-002 (different weights, same bids) produces a DIFFERENT winner
  · TND-2026-003 (6 criteria incl. Warranty / Compliance / Maintenance) evaluates
    correctly with ZERO engine changes
  · Creating a NEW tender with different rules leaves TND-2026-001's stored
    evaluation byte-identical
  · A tender where every bid is ineligible reaches FAILED and offers Re-tender
```

---

## 30. Definition of done

1. Phases 1–9 work end to end through the UI.
2. All 42 tests in §22 pass.
3. §29 runs clean, including every marked verification and the failure path.
4. `npm run seed && npm run dev` works from a clean clone using only the README.
5. The §11.5 golden vector is verified by an automated test.
6. Two identical runs produce identical `configHash` and rankings.
7. **No screen displays vendor-supplied evaluative data without a provenance badge.**
8. **No code path sets `verificationStatus: 'VERIFIED'`.**
9. **No engine file imports from `models/`, `express`, or `mongoose`.**
10. No fake buttons, no hardcoded winners, no client-side scoring, no stubbed endpoints.
11. Anything not fully implemented is listed in the README under **Known limitations**. Partial work stated honestly is acceptable; partial work presented as complete is not.

---

## 31. Approval record

**Approved — Phase 1 authorised.** The following were signed off:

1. **Provenance model** (§5) — no verification workflow ships in this build; all vendor data is `SELF_REPORTED` / `UNVERIFIED`.
2. **Graduated configuration locking** (§6) — `UNLOCKED` → `SOFT_LOCKED` (versioned, audited) → `HARD_LOCKED` at first bid; material change thereafter requires cancel-and-reissue.
3. **Generic-criteria architecture** (§7) — `ValueSource` as the extension point, with `TND-2026-003` retained as permanent proof.
4. **`RankingStrategy` seam** with **SAW as the sole implementation** (§12.5); **TOPSIS and `MINMAX` deferred** to a post-Phase-12 decision.
5. **Evidence as metadata only** (§5.6), with mandatory UI disclosure.
6. The data model in Part D and the build order in §27.

---

## Appendix A — Change log

### v4 (this revision — approved)

| Area | Change |
|---|---|
| **Config locking** | v3's freeze-at-publish replaced by a **graduated three-state lock**: `UNLOCKED` (draft) → `SOFT_LOCKED` (published, zero bids — versioned + audited edits allowed) → `HARD_LOCKED` (first bid, permanent). The principle preserved is the one that matters: *no bidder is judged by rules that changed after they committed* |
| **Atomic hard lock** | `firstBidAt` guard placed **inside the update filter**, not in a pre-check — closes a genuine race where an edit could land after a vendor committed |
| **Reissue lineage** | `supersedes` / `supersededBy` link a cancelled tender to its replacement |
| **Bid config stamp** | `configVersionAtSubmission` / `configHashAtSubmission` turn the single-version invariant into checkable evidence |
| **`TND-2026-003`** | **Retained** as the permanent six-criteria proof that the engine is generic |
| **`MINMAX`** | **Deferred** with TOPSIS; `RATIO` is the only strategy in Tier 1, behind an unchanged extensible interface |
| **Evidence** | Metadata only, formalised in §5.6 with mandatory UI copy stating files are neither uploaded nor examined |
| **Tests** | 37 → 42, adding soft-lock revision, hard-lock enforcement, the config-stamp invariant, and the race case |

### v3

| Area | Change |
|---|---|
| **Provenance** | v2's "derived quality solves self-reporting" position **corrected**. Deriving a score from vendor-*claimed* facts does not verify them. Full `Provenance` model added; every vendor value is `SELF_REPORTED` / `UNVERIFIED`; mandatory UI badges and disclosure; verification seam designed but **not built** |
| **Committee mode** | **Removed.** Required a non-existent workflow and introduced a subjective, non-deterministic input |
| **`isVerified` on vendor** | **Removed.** Implied a verification capability that does not exist |
| **Snapshot timing** | Moved from **evaluation time → publish time**; vendors now bid against an already-frozen ruleset |
| **Snapshot enforcement** | Engine signatures accept `TenderConfigSnapshot`, never `Tender` — reading live config is structurally impossible |
| **Generic criteria** | Extended with `ValueSource`, a whitelisted path resolver, three worked future criteria, and `TND-2026-003` as permanent living proof |
| **TOPSIS** | Downgraded from "optional after Phase 9" to **explicitly out of scope**; only the `RankingStrategy` seam remains |
| **`MINMAX`** | Also deferred, for the same reason — keeps Phase 1 focused |
| **`TECHNICAL_EVALUATION` state** | Removed with committee mode |
| **Tests** | 28 → 37, adding generic-criteria, snapshot-isolation and provenance suites |

### v2 (carried forward)

Config snapshot + `configHash` · generic `criteria[]` · data-driven eligibility rules with whitelist · two-envelope sealing · six-level tie-break cascade · degenerate-case guards · integer weights · `CANCELLED`/`FAILED` states · declarative transition map · post-publish immutability · AUDITOR role · IDOR query-scoping · mass-assignment defence · hash-chained append-only audit log · award override with justification · integer-paise money · bid revisions · evaluation idempotency · single-document atomicity · data-generated explanations · SAW/QCBS academic framing · substantive experiments replacing "evaluation time"
