# AGPS — Project Briefing

*Paste this whole document into ChatGPT (or any assistant), then ask your questions. It is a self-contained description of how the system works.*

---

## 1. What the project is

**AGPS — Automated Government Procurement System.** A B.Tech final-year web application that automates the evaluation of government tender bids.

A department publishes a tender. Vendors submit bids. The system screens each bid against mandatory rules, scores the survivors on weighted criteria, ranks them, and recommends a winner — showing exactly how every number was produced.

**The defining constraint: no machine learning, no AI, no LLM anywhere in the decision path.** Every decision is deterministic arithmetic and explicitly declared rules. This is a deliberate design choice, not a limitation — a procurement decision must be explainable and reproducible, and a model that cannot show its reasoning is unsuitable for public spending.

---

## 2. The core idea — a two-layer decision model

| Layer | Method | Behaviour |
|---|---|---|
| **1. Eligibility screening** | Rule-based filter | **Non-compensatory** — failing any mandatory rule eliminates the bid outright. No strength compensates. |
| **2. Weighted scoring** | **SAW** (Simple Additive Weighting) with ratio normalization | **Compensatory** — strengths and weaknesses trade off according to declared weights. |

This mirrors **QCBS** (Quality-and-Cost-Based Selection), the standard method in public procurement, and aligns with India's GFR 2017 / CVC two-envelope practice.

**Why two layers:** the floor is absolute — no amount of cheapness rescues a vendor below the quality threshold. Above that floor, the department decides how to trade price against quality by setting weights.

---

## 3. Layer 1 — Eligibility rules

Rules are stored as **data, not code**, so they are configurable per tender without changing the program.

Each rule is:
```
{ code, field, operator, value, message, enabled }
```

Fields and operators come from a fixed whitelist — no expression parser, no injection surface:

- **Fields:** price, deliveryDays, experienceYears, derivedQualityScore, annualTurnover, vendorBlacklisted, technical.\<key\>
- **Operators:** lt, lte, gt, gte, eq, neq, in, nin, isTrue, isFalse

A typical rule set:

```
PRICE_WITHIN_BUDGET       price                lte  1000000
QUALITY_MEETS_MINIMUM     derivedQualityScore  gte  70
DELIVERY_WITHIN_LIMIT     deliveryDays         lte  30
MIN_EXPERIENCE_YEARS      experienceYears      gte  3
NOT_BLACKLISTED           vendorBlacklisted    isFalse
```

**Every enabled rule is evaluated — the engine never stops at the first failure.** A vendor failing three rules is told all three:

```
Vendor B — REJECTED
Price exceeds maximum budget
   Bid price: Rs 12,00,000    Maximum: Rs 10,00,000
Delivery exceeds permitted limit
   Vendor: 45 days            Maximum: 30 days
```

---

## 4. Layer 2 — Scoring criteria

Criteria are **configuration, not hardcoded**. The engine has no knowledge of "price" or "quality" — it loops over whatever the tender declares.

Each criterion:
```
{ key, label, direction: lower|higher, weight (integer %), unit, valueSource }
```

`valueSource` tells the engine where to read the number:
- `BID_FIELD` — priceMinor, deliveryDays
- `VENDOR_FIELD` — experienceYears
- `DERIVED_QUALITY` — the computed quality aggregate
- `TECHNICAL_VALUE` — any technical attribute the tender declared

**Weights are integers and must sum to exactly 100.** A tender cannot be published otherwise.

### Default configuration

| Criterion | Direction | Weight | Source |
|---|---|---|---|
| Price | lower is better | 40% | bid price |
| Quality | higher is better | 30% | derived from technical claims |
| Delivery | lower is better | 20% | delivery days |
| Experience | higher is better | 10% | vendor profile |

### Proof the engine is generic — a 6-criterion tender

| Criterion | Direction | Weight |
|---|---|---|
| Commercial Bid Price | lower | 30% |
| Quality Score | higher | 20% |
| Delivery Schedule | lower | 15% |
| **Warranty Period** | higher | 15% |
| **SLA Response Time** | lower | 10% |
| Vendor Track Record | higher | 10% |

This tender runs with **zero changes to any engine file** — pure configuration. That is the architectural claim the project makes.

---

## 5. How quality is calculated

Vendors do **not** type a quality score. They declare **structured factual claims** against technical criteria the tender declared in advance, and the engine aggregates them deterministically.

Each technical criterion carries points; all points sum to 100.

```
boolean    earned = value === true ? points : 0
numeric    t = clamp((value - min) / (max - min), 0, 1)
           earned = points * (direction === higher ? t : 1 - t)
enum       earned = points * option.fraction
checklist  earned = points * (fraction of ticked items)

derivedQualityScore = sum of earned      -->  always lands in [0, 100]
```

Example configuration:
```
warrantyMonths   numeric, higher, 12-60 months               25 points
isoCertified     boolean                                     15 points
supportTier      enum: basic .3 / standard .7 / premium 1.0  20 points
specCompliance   checklist, 8 items x 0.125                  40 points
```

**Critically: this aggregation is deterministic, but its inputs are NOT verified.** See section 9.

---

## 6. Normalization — why raw values cannot be multiplied by weights

Price is in rupees, delivery in days, experience in years, quality in points. Multiplying raw values by weights would be meaningless. Every criterion is first normalized to a 0–100 scale relative to the **cohort of eligible bids**.

Method used: **RATIO** (linear scale transformation).

```
Lower is better:    normalized = (cohort_min / value) * 100
Higher is better:   normalized = (value / cohort_max) * 100
```

The best bid on a criterion scores 100; others score proportionally.

### Degenerate cases, handled explicitly

| Situation | Behaviour |
|---|---|
| All bids equal on a criterion (max === min) | **All score 100** — the criterion carries no discriminating information |
| deliveryDays = 0 or price = 0 | **Rejected at input validation** — would divide by zero |
| All vendors have 0 experience | Caught by the max === min guard, no NaN |
| Only one eligible bid | Scores 100 on everything; the UI **labels it non-comparative** |

### Final aggregation

```
finalScore = sum over criteria of ( normalizedScore * weight / 100 )
```

Summation follows the frozen criteria order, so floating-point accumulation is identical every run. Scores are stored at full precision and rounded to 2 decimals **only for display** — otherwise the breakdown would not visibly sum to the total.

---

## 7. Worked example

A vendor bidding Rs 8,00,000, quality 85, delivery 20 days, experience 8 years.
Cohort: cheapest bid Rs 7,40,000, best quality 100, fastest delivery 15 days, most experience 10 years.
Weights 40/30/20/10.

| Criterion | Raw | Normalized | Weight | Weighted |
|---|---|---|---|---|
| Price | Rs 8,00,000 | 740000/800000 x 100 = **92.50** | 40% | 37.00 |
| Quality | 85 | 85/100 x 100 = **85.00** | 30% | 25.50 |
| Delivery | 20 days | 15/20 x 100 = **75.00** | 20% | 15.00 |
| Experience | 8 years | 8/10 x 100 = **80.00** | 10% | 8.00 |
| | | | | **85.50 / 100** |

**Note this vendor is best at nothing** — not cheapest, not highest quality, not fastest, not most experienced — yet ranks #1. That is correct compensatory behaviour: it is the best *overall balance* given the department's declared priorities, and the eligibility layer already guaranteed it cleared every mandatory threshold.

---

## 8. Ranking and tie-breaking

Eligible bids are sorted by descending final score. Ties are broken by a **deterministic six-level cascade**:

```
1. finalScore           DESC
2. price                ASC   (cheaper wins)
3. derivedQualityScore  DESC
4. deliveryDays         ASC
5. submittedAt          ASC   (earlier wins)
6. bidId                ASC   (guarantees a total order)
```

Level 6 makes an unresolved tie mathematically impossible. When a tie is broken below level 1, the UI states which criterion resolved it.

---

## 9. Data provenance — the honest limitation

Quality and technical attributes are **submitted by the party that benefits from them**. AGPS does not verify vendor claims, and it says so everywhere.

Every vendor-supplied value carries:
```
source:             SELF_REPORTED | DOCUMENT_SUPPORTED | ADMIN_ENTERED
verificationStatus: UNVERIFIED | PENDING_VERIFICATION | VERIFIED | DISPUTED
```

**In this build, every value is SELF_REPORTED / UNVERIFIED. No code path can set VERIFIED.** The UI shows a neutral-grey badge — `[ VENDOR-REPORTED - UNVERIFIED ]` — wherever such data appears, and every results screen carries a disclosure block.

Supporting documents are recorded as **metadata only** (filename, type, size). No file is uploaded, stored, or examined. Attaching a document sets DOCUMENT_SUPPORTED but **leaves the value UNVERIFIED** — declaring a document is not verification.

**Why this matters:** structuring input as factual claims means a false claim becomes a *falsifiable, attributable, audit-logged statement* rather than an unfalsifiable opinion. That is the honest, achievable improvement — and the system claims no more than that.

---

## 10. Determinism — same inputs always produce the same result

Guaranteed by five mechanisms:

1. **Configuration snapshot** — when a tender is published, its rules, criteria, weights and normalization method are frozen into an immutable snapshot. The engine reads *only* the snapshot, never live tender fields.
2. **Config hash** — SHA-256 over key-sorted canonical JSON of that snapshot, displayed in the UI and stored with every evaluation.
3. **Total ordering** — the tie-break cascade ends in a unique key.
4. **Fixed accumulation order** — summation follows the frozen array order.
5. **Pure engines** — no database access, no Date.now(), no randomness inside scoring or eligibility code.

### Graduated configuration locking

| State | Condition | Configuration |
|---|---|---|
| UNLOCKED | Draft | Fully editable |
| SOFT_LOCKED | Published, **zero bids** | Editable, but every change is versioned and audit-logged |
| HARD_LOCKED | **First bid received** | Immutable forever |

The principle: **no bidder is ever judged by rules that changed after they committed.** A material change after bids exist requires cancelling and reissuing the tender under a new code.

---

## 11. Tender lifecycle

```
DRAFT -> PUBLISHED -> BIDDING_OPEN -> BIDDING_CLOSED -> FINANCIAL_OPEN
      -> UNDER_EVALUATION -> EVALUATED -> WINNER_SELECTED -> CLOSED

Terminal exits:  CANCELLED  (withdrawn)
                 FAILED     (zero eligible vendors, offers re-tender)
```

Transitions are enforced by a single declarative map, not scattered checks.

### Two-envelope sealing

Following GFR 2017 Rule 173, **bid prices are hidden from everyone — including the admin — until the tender reaches FINANCIAL_OPEN.** Technical merit is assessed before anyone sees the money. Unsealing writes an audit event recording who opened them and when.

---

## 12. Winner recommendation and override

The top-ranked bid is presented as a **"SYSTEM RECOMMENDATION — not a legal award"**. The admin makes the actual decision:

- **Confirming rank #1** — one click.
- **Choosing a different vendor** — allowed, but requires a **mandatory written justification**, stored and displayed permanently alongside the award, with the score gap shown.

Allowing an audited override *strengthens* transparency rather than weakening it. Real procurement authorities can deviate; forcing the reason onto the record is the point.

---

## 13. Explainability

Every decision is explained from actual data — never from templates that assert unverified claims:

```
Why is Vendor A recommended?

Eligibility: Passed all 5 mandatory rules

Competitive position (2 eligible bids)
  Price       Rs 8,00,000  rank 2 of 2  normalized 92.50  contributed 37.00
  Quality     85/100       rank 1 of 2  normalized 85.00  contributed 25.50  [VENDOR-REPORTED]
  Delivery    20 days      rank 2 of 2  normalized 75.00  contributed 15.00
  Experience  8 years      rank 1 of 2  normalized 80.00  contributed  8.00

Final score 85.50 / 100 - highest among eligible bids
Margin over rank #2: 2.80 - Decisive criterion: quality

Config hash a3f9...c21e - Engine v1.0.0 - Method SAW - Normalization RATIO
```

---

## 14. Sensitivity analysis

Because weights are configuration, the system can answer "what if the department had prioritised differently?"

- **Weight simulation** — re-rank the same bids under hypothetical weights. Strictly read-only; never writes an evaluation.
- **Rank stability** — does the winner change? Kendall's tau between rankings.
- **Winner breakeven** — closed form: *"Vendor A remains the recommendation until the price weight exceeds 47%, at which point Vendor E overtakes it."*

The demonstration tender pair proves the point: **identical bids, weights 40/30/20/10 versus 20/50/20/10, different winners** (Tata Advanced Systems vs Infosys Public Services). Ranking is driven by transparent declared configuration, not hidden logic.

---

## 15. Audit trail

Every significant action is logged: tender created, published, config revised, bids opened, evaluation run, vendor rejected, winner confirmed or overridden.

The log is **append-only** (enforced at the database layer) and **hash-chained** — each entry stores the SHA-256 of the previous, so any modification breaks the chain. A "Verify audit chain" action recomputes it and reports the first broken entry.

**Stated honestly:** this is tamper-*evident*, not tamper-proof. Someone with full database write access could recompute an entire chain. It raises the cost of undetected tampering; it does not prevent tampering. Deliberately **not** blockchain — a hash chain gives most of the property for about fifteen lines.

---

## 16. Roles

| Role | Can do |
|---|---|
| **ADMIN** | Full lifecycle, configure rules and weights, run evaluation, confirm award |
| **VENDOR** | Register, maintain profile, view published tenders, submit and revise own bids, see own results and own rejection reasons |
| **AUDITOR** | **Read-only across everything**, including the full audit log and chain verification |

A vendor can **never** read another vendor's bid, at any stage. Enforced by scoping the database query itself — `findOne({ _id, vendor: userId })` — not by hiding it in the UI.

---

## 17. Technical architecture

```
frontend/   React 18, TypeScript, Vite, Tailwind, TanStack Query
shared/     TypeScript types imported by BOTH sides - one contract
server/     Node.js, Express, Mongoose, Zod
  engines/  <- THE PURE ZONE
            qualityEngine, eligibilityEngine, criterionResolver,
            normalization/ratio, scoringEngine, ranking/saw, tieBreak
```

**The engines import nothing from the database, Express, or Mongoose** — enforced by an ESLint rule that fails the build on violation. They are pure functions: same inputs, same output, testable in milliseconds without any infrastructure.

This is what makes the procurement algorithm independently describable in a research paper, separate from the web application around it.

**The frontend contains no procurement logic.** It renders backend output; it never computes a score, rank, normalization, or rejection reason.

**66 automated tests**, covering the golden worked example (must reproduce exactly 85.50), degenerate normalization cases, tie-break determinism, configuration locking, provenance defaults, price sealing, cross-vendor access protection, and audit chain tamper detection.

---

## 18. Deliberately excluded

Machine learning, AI, LLMs, blockchain, a rule expression DSL (whitelist instead), real file storage, TOPSIS or any second MCDM method, MINMAX normalization, and any verification workflow.

The architecture leaves clean extension seams for a second ranking method and for claim verification — the interfaces exist, the implementations deliberately do not.

---

## 19. Good questions to ask about this project

- Why use SAW rather than TOPSIS or AHP, and what would change?
- Why ratio normalization instead of min–max, and how would rankings differ?
- How does the system defend the claim that evaluation is deterministic?
- Why is quality derived from structured claims rather than entered directly?
- What are the honest limitations, and how should they be stated in a research paper?
- How would weight sensitivity analysis be presented as an experimental result?
- Why does a vendor who is best at no single criterion win the worked example?
- What would it take to add independent verification of vendor claims?
