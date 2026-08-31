# ChatGPT Prompt — AGPS IEEE Research Paper Draft

Paste everything below the line into ChatGPT.

---

You are assisting a B.Tech final-year student in drafting an IEEE-format conference paper. You are producing a DRAFT that the student will verify, edit and rewrite. Follow the constraints exactly.

## ABSOLUTE CONSTRAINTS

1. **DO NOT invent, fabricate or guess any reference.** Do not produce author names, paper titles, years, DOIs, page numbers or venues unless I have supplied them. Where a citation is needed, insert a placeholder:

   ```
   [CITE: literature review of MCDM methods for supplier selection]
   [CITE: origin of SAW / linear scale transformation]
   ```

   I will locate and insert the real sources myself. A fabricated citation is worse than no citation.

2. **DO NOT invent results, numbers or measurements.** Use only the data given below. Where a number is needed that I have not supplied, write `[MEASURE: description]`.

3. **DO NOT overstate contributions.** No "revolutionary", "novel breakthrough", "first-ever". Write plainly and precisely.

4. State limitations honestly. Do not conceal the self-reported data issue — it is central to the paper's argument.

---

## THE SYSTEM (all facts below are true and verified)

**Name:** AGPS — Automated Government Procurement System

**Purpose:** deterministic, transparent, explainable evaluation of government tender bids. Explicitly NOT machine learning — the decision engine is rule-based and arithmetic.

### Decision model — two layers

**Layer 1, screening:** rule-based eligibility filter. NON-COMPENSATORY — failing any mandatory rule is fatal and no strength compensates. Returns ALL failed rules, never short-circuits on the first.

**Layer 2, ranking:** Simple Additive Weighting (SAW) with linear scale transformation. COMPENSATORY — strengths and weaknesses trade off by declared weight.

This mirrors Quality-and-Cost-Based Selection (QCBS) and aligns with Indian GFR 2017 / CVC two-envelope practice.

### Normalization (ratio method)

```
lower-is-better:   normalized = (min_cohort / value) * 100
higher-is-better:  normalized = (value / max_cohort) * 100
```

Degenerate guard: when max == min for a criterion, all bidders receive 100 (the criterion carries no discriminating information). Inputs are validated so deliveryDays >= 1 and price > 0, preventing division by zero.

### Aggregation

```
finalScore = SUM over criteria of (normalizedScore * weight / 100)
```

Weights are INTEGERS summing to exactly 100. Computation is at full float64 precision; rounding to 2 decimals occurs only at display. Summation follows the frozen criterion array order so accumulation is bit-reproducible.

### Default criterion configuration

```
price        lower    40%   from bid
quality      higher   30%   derived (see below)
delivery     lower    20%   from bid
experience   higher   10%   from vendor profile
```

### Generic criterion architecture

Criteria are configuration, not code. Each declares a `valueSource` of type `BID_FIELD`, `VENDOR_FIELD`, `TECHNICAL_VALUE` or `DERIVED_QUALITY`. The scoring engine has no knowledge of price, quality, delivery or experience. A demonstration tender uses SIX criteria including Warranty and Maintenance Support with ZERO changes to any engine file.

### Quality derivation (the paper's key honesty point)

Bidders do NOT enter a quality score. The procuring entity declares technical criteria with fixed point allocations totalling 100 BEFORE bidding opens. Bidders declare factual values; the engine aggregates deterministically:

```
boolean:    earned = value ? points : 0
numeric:    t = clamp((v - min)/(max - min), 0, 1)
            earned = points * (higher ? t : 1 - t)
enum:       earned = points * option.fraction
checklist:  earned = points * (sum of ticked fractions)
```

Inputs remain VENDOR-DECLARED AND UNVERIFIED. Every such value carries a provenance record (`source = SELF_REPORTED`, `verificationStatus = UNVERIFIED`) displayed on every screen and in every export. No code path sets VERIFIED.

### Determinism guarantees (five mechanisms)

1. Configuration is frozen in an immutable snapshot before bidding.
2. `configHash` = SHA-256 over key-sorted canonical JSON of that snapshot.
3. Six-level tie-break cascade terminating in bid identifier, giving a total order: finalScore desc, price asc, quality desc, delivery asc, submittedAt asc, bidId asc.
4. Fixed accumulation order from the frozen array.
5. Pure engine functions: no I/O, no system clock, no randomness.

### Graduated configuration locking

```
UNLOCKED      draft, fully editable
SOFT_LOCKED   published with zero bids; edits allowed but versioned and audit-logged
HARD_LOCKED   triggered atomically by the first bid; immutable
```

Principle: no bidder is ever judged by rules that changed after they committed. Material change after bids exist requires cancel-and-reissue.

### Other properties

- **Two-envelope sealing:** financial values are inaccessible via any API, including to administrators, until the financial-open lifecycle stage.
- **Append-only audit log** with a per-tender SHA-256 hash chain: `hash = SHA256(prevHash + canonicalJSON(entry))`. Tamper-EVIDENT, not tamper-proof — state this limitation explicitly.
- **Award override** permitted but requires mandatory recorded justification.
- **Sensitivity analysis:** read-only weight simulation re-running the same engine, plus closed-form breakeven computation of the weight threshold at which the ranking changes.

### Implementation

React 18 / TypeScript / Vite frontend; Node.js / Express / TypeScript backend; MongoDB with Mongoose; Zod validation. Evaluation engines are pure functions with zero imports from persistence or web layers, enforced by a lint rule. 66 automated tests. Deployed on Vercel (frontend) and Render (API).

### Verified results — use ONLY these

- 66 of 66 automated tests pass.
- Golden test vector reproduces 85.50/100 exactly, verified to six decimal places.
- Two identical evaluation runs produce identical `configHash` and identical rankings.
- **Weight-flip demonstration:** two tenders with IDENTICAL bid data and different weight vectors (40/30/20/10 versus 20/50/20/10) produce DIFFERENT winners — asserted by name in an automated test.
- Six-criteria tender evaluates correctly with zero engine modification.
- Audit chain verification detects a manually mutated log entry.

For any other quantitative claim, write `[MEASURE: ...]`.

---

## PAPER STRUCTURE (IEEE conference format)

**Title** — specific and descriptive, not grandiose.

**Abstract** — 150–250 words: problem, approach, what was built, key results, limitation. No citations.

**Index Terms** — 5–7, alphabetical.

**I. INTRODUCTION** — procurement transparency problem; opacity and inconsistency in manual evaluation; objectives; contributions as a concise list; paper organisation.

**II. RELATED WORK** — MCDM approaches to supplier selection (SAW, AHP, TOPSIS); fuzzy and grey methods for uncertain input data; e-procurement transparency. Use `[CITE: ...]` placeholders throughout.

State the positioning explicitly: existing approaches address input uncertainty through fuzzy or grey modelling at the cost of exact reproducibility; this work retains crisp determinism and instead makes data provenance explicit.

**III. SYSTEM ARCHITECTURE** — two-layer model; generic criterion architecture; configuration snapshot and locking; the determinism contract. Describe figures as `[FIGURE 1: ...]` for me to draw.

**IV. EVALUATION METHODOLOGY** — eligibility rule evaluation; quality derivation; normalization with degenerate-case handling; weighted aggregation; tie-breaking. Include the formulas above, IEEE-numbered.

**V. IMPLEMENTATION** — stack, engine purity, test strategy.

**VI. RESULTS** — the verified results listed above. Include the worked example summing to 85.50 as a table. Include the weight-flip comparison as a table.

**VII. DISCUSSION AND THREATS TO VALIDITY** — be rigorous and honest:

- (a) Technical and quality inputs are self-reported and unverified. The design constrains manipulation — bidders cannot self-score, and the aggregation function is frozen before submission — but does not prevent misrepresentation.
- (b) Criteria differ structurally in verifiability. Bidder attributes (turnover, registration, incorporation date) are registry-verifiable. Third-party certifications are verifiable only where the issuing body publishes a registry. Warranty, service-level and delivery commitments are assertions about FUTURE performance and are not verifiable at evaluation time by any registry. Therefore verification integration would strengthen eligibility screening more than quality scoring.
- (c) SAW is compensatory: a bidder may rank first without leading on any single criterion. The non-compensatory eligibility layer bounds this.
- (d) The audit chain is tamper-evident within a tender, not tamper-proof.
- (e) Evaluation was conducted on seeded data, not live procurement.

**VIII. CONCLUSION AND FUTURE WORK** — summarise; then:

- **Registry-based verification** (GSTN, MCA21, Udyam, DigiLocker), noting it preserves determinism because a lookup returns a fact rather than a human judgement, unlike document review.
- **Performance-based vendor rating:** record post-award delivery adherence, commitment fulfilment and defect incidence; aggregate deterministically; expose as a scoring criterion in later tenders. System-generated from observed outcomes, therefore not self-reported. Supported by the existing architecture as configuration only. Address the cold-start problem: bidders without history would be disadvantaged, conflicting with MSE participation policy; assign the cohort median with criterion weight scaled by contract count.
- **Additional MCDM methods** (TOPSIS) for comparative validation.

**REFERENCES** — output ONLY placeholders in IEEE numbered style:

```
[1] [CITE: literature review of MCDM methods for supplier selection]
[2] [CITE: Government of India, General Financial Rules 2017]
```

---

## STYLE

- IEEE conference format, two-column assumed, formal academic register.
- Third person; past tense for what was done, present for what the system does.
- Define every symbol before use. Number equations.
- No bullet lists in the body except the contributions list.
- Target 6–8 pages.

Begin with the Title, Abstract and Index Terms, then **stop and ask me to confirm** before continuing to Section I.
