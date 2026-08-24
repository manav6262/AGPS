# AGPS — Build Prompt

**Paste this into Antigravity. `SPEC.md` must be in the repository root before you start.**

---

## Your role

You are a senior full-stack engineer building **AGPS (Automated Government Procurement System)**, a B.Tech final-year prototype demonstrating **deterministic, rule-based, explainable** government tender evaluation.

**`SPEC.md` in the repository root is the normative specification.** Read it completely before writing any code. This document tells you *how to execute*; `SPEC.md` tells you *what is correct*. Where they differ, `SPEC.md` wins.

---

## Non-negotiable rules

Violating any of these means the work is rejected regardless of how much was built.

1. **NO machine learning, LLM, generative AI, chatbot, or predictive model** anywhere in the evaluation path. The decision engine is deterministic arithmetic and explicit rules. This is the project's defining constraint.
2. **NO blockchain. NO Docker. NO TOPSIS. NO MINMAX normalization.** These are deliberately deferred — see `SPEC.md` §28.
3. **NO fake functionality.** No non-functional buttons, no hardcoded winners, no mock API responses, no placeholder data presented as real, no client-side score calculation. If a thing is not built, say so; do not simulate it.
4. **Every displayed number comes from the backend**, computed from stored data.
5. **Never claim something works without running it.** If tests fail, report the failure with output. If you skipped a step, say so.
6. **Stop at every phase gate** and report before continuing. Do not build ahead.

---

## Start with the backend — specifically, with the engines

**Order: `shared/` types → pure engines → backend → frontend.**

Do **not** start with the frontend. Reasons, in priority order:

1. **The engines are the project.** The eligibility and scoring logic is what the research paper is about. The UI is how it is demonstrated.
2. **The engines are pure functions** — they need no database, no server, no React. They can be fully written and fully tested before any infrastructure exists. This is the fastest path to proving the core is correct.
3. **The frontend cannot be built correctly without API contracts.** Building UI first guarantees rework.
4. **Risk asymmetry.** A working backend with a plain UI still demonstrates the thesis and passes the viva. A polished UI with no working engine demonstrates nothing.

Define `shared/types/` first so both sides compile against one contract.

---

## Phase plan

**Complete phases in order. Stop and report at each gate.**

### Phase 1 — Pure engines *(no database, no server, no React)*

Create the repo, TypeScript config, and `shared/types/`. Then implement `server/src/engines/`:

```
qualityEngine.ts        derived quality from declared technical claims   SPEC §9
eligibilityEngine.ts    rule screening, returns ALL failures             SPEC §10
criterionResolver.ts    ValueSource → number                             SPEC §7.3
normalization/
  index.ts              strategy registry
  ratio.ts              the ONLY implementation                          SPEC §11.1
scoringEngine.ts        weighted aggregation                             SPEC §11.3
ranking/
  index.ts              strategy registry
  saw.ts                the ONLY implementation                          SPEC §12.5
tieBreak.ts             six-level deterministic cascade                  SPEC §11.4
```

**Hard constraint:** no file under `engines/` may import from `models/`, `express`, or `mongoose`. Add an ESLint `no-restricted-imports` rule enforcing it, and make sure the rule actually fires when violated (test it deliberately once).

Write unit tests 1–20 from `SPEC.md` §22. They must run with no database and complete in under one second.

**Gate:** all 20 tests pass, including the golden vector reproducing exactly `85.50`. Report results, then stop.

### Phase 2 — Persistence foundations

Mongoose models (§8) · `Provenance` embedded type · **key-sorted canonical JSON serializer** · `configHash` · `TenderConfigSnapshot` with the three lock states (§6) · audit log with per-tender hash chain and append-only `pre` hooks (§16).

**Gate:** chain verification detects a manually mutated entry. Report, stop.

### Phase 3 — Auth and security

JWT (15 min access + httpOnly refresh cookie) · bcrypt cost 12 · role middleware · rate limiting · helmet · CORS allowlist · Zod `.strict()` on every route (§17).

**Gate:** tests 32, 33, 35 pass. Report, stop.

### Phase 4 — Tenders and the graduated lock

Tender CRUD · declarative transition map (§14.2) · publish validation (weights sum to exactly 100, integers) · the three-state config lock with the **atomic `firstBidAt` guard inside the update filter** (§6.4).

**Gate:** tests 21, 21b, 22, 22b, 22c, 24c pass. Report, stop.

### Phase 5 — Vendors and bids

Vendor profiles · bid submission with per-field provenance · revisions (`isLatest`) · two-envelope price sealing (§14.3) · evidence metadata only, no file storage (§5.6).

**Gate:** tests 25, 26, 29, 34, 37 pass. Report, stop.

### Phase 6 — Evaluation service

Wire the Phase 1 engines to persistence. `evaluationService` receives a `TenderConfigSnapshot`, **never a `Tender`**. Idempotent runs with `runNumber`. One `Evaluation` document per run.

**Gate:** tests 23, 24, 24b, 31 pass; two identical runs produce identical `configHash` and rankings. Report, stop.

### Phase 7 — Award and explainability

Recommendation → admin confirm, or override with mandatory justification (≥ 30 chars) · decision-explanation payloads generated **from data only**, never from templates asserting unverified facts (§15.3).

### Phase 8 — Seed and integration tests

Three tenders (§21): `TND-2026-001` baseline · `TND-2026-002` different weights, same bids, different winner · `TND-2026-003` six criteria including Warranty / Technical Compliance / Maintenance Support, **proving the engine is generic**. Idempotent `npm run seed`.

**Gate:** all 42 tests pass. `TND-2026-003` must evaluate correctly with **zero changes to any engine file** — if it needs one, the architecture is wrong; fix the architecture, not the test. Report, stop.

### Phase 9 — Frontend spine

Auth → tender list → tender detail → bid form → results → decision explanation. Functional before decorative. Provenance badges everywhere vendor data appears (§5.3).

**Gate:** the §29 acceptance test runs end to end through the real UI. Report, stop.

### Phase 10 — Sensitivity, breakeven, dashboard, CSV export
### Phase 11 — UI polish, empty/error states, accessibility
### Phase 12 — README, end-to-end verification, known limitations

**If time runs short, cut from Phase 10 upward. Never cut Phases 1–8.**

---

## Invariants most likely to be got wrong

These are the failure modes to actively guard against.

| # | Invariant | Why it matters |
|---|---|---|
| 1 | **`configHash` uses a key-sorted canonical serializer** | Plain `JSON.stringify` is key-order dependent — identical configs would hash differently and the whole determinism guarantee silently breaks |
| 2 | **The engine reads only a `TenderConfigSnapshot`, never a `Tender`** | Enforce by function signature so reading live config is impossible, not merely discouraged |
| 3 | **Ownership and lock guards live inside the query filter, never in a preceding `if`** | `findOne({_id, vendor: userId})` — not fetch-then-check. Same pattern for `firstBidAt: null` on config edits (§6.4). A pre-check is a race |
| 4 | **Eligibility returns ALL failed rules** | Never short-circuit on the first failure — multi-failure reporting is a demonstrated feature |
| 5 | **`max === min` → every vendor scores 100** | Otherwise `NaN` or division by zero. Also validate `deliveryDays >= 1` and `priceMinor > 0` at input |
| 6 | **Round to 2 decimals at display only** | Rounding during accumulation makes the breakdown fail to sum to the total — visible on the explainability screen |
| 7 | **Weights are integers summing to exactly 100** | Float weights make the publish check pass or fail at random |
| 8 | **Money is integer paise everywhere** | Never float, never float-accumulated. Format with `Intl.NumberFormat('en-IN')` |
| 9 | **No code path sets `verificationStatus: 'VERIFIED'`** | Zod `.strict()` must strip it. Test 26 asserts this |
| 10 | **Never spread `req.body` into a model** | Pass only `.strict().parse()` output — blocks `role: 'ADMIN'`, `eligible: true`, `verificationStatus: 'VERIFIED'` |
| 11 | **Deadline enforcement uses the server clock only** | Never trust a client timestamp |
| 12 | **Tie-break cascade ends in `bidId`** | Guarantees a total order — an unresolved tie would be non-deterministic output in a project whose thesis is determinism |

---

## Conventions

- **TypeScript throughout**, both sides, sharing `shared/types/`.
- Backend: Express · Mongoose · Zod · Vitest + Supertest.
- Frontend: React 18 · Vite · React Router v6 · Tailwind · TanStack Query · Recharts.
- Commands must be `npm run dev`, `npm run seed`, `npm test` in both `server/` and `client/`.
- `.env.example` in both, with every variable documented.
- Comments only where the *why* is non-obvious. The code should read like the surrounding code.
- **No procurement logic in the client.** The frontend renders backend output; it never computes a score, rank, normalization, or rejection reason.

---

## UI direction

A serious government/enterprise tool. Clean, restrained, dense where density helps.

**Required on every data view:** loading, error and empty states, plus confirmation dialogs on publish, cancel, award and close.

**Banned:** gradients, glassmorphism, decorative animation, "AI startup" styling.

**Mandatory:** a neutral-grey provenance badge — `[ VENDOR-REPORTED · UNVERIFIED ]` — wherever vendor-supplied evaluative data appears, and the full disclosure block on every results screen and export. **Never green** — green reads as "verified" at a glance and would undo the disclosure.

---

## Reporting format

At each phase gate, report exactly:

```
PHASE <n> — <COMPLETE | BLOCKED>

Built:        <files created or modified>
Tests:        <passed>/<total>   (paste output of any failure)
Verified:     <what you actually ran, not what you assume works>
Not built:    <anything deferred, and why>
Blocked on:   <decisions you need from me>
```

**If something does not work, say so plainly.** Partial work reported honestly is acceptable. Partial work presented as complete is not.

---

## Do not build

ML / AI / LLM / chatbot / predictive model · blockchain · Docker / K8s / CI · real file upload or storage (metadata only) · email / SMS / push · WebSockets · a rule expression DSL (use the whitelist in `SPEC.md` §10.1) · payments · i18n · microservices · SSR · cryptographic bid sealing · lifecycle cron or scheduler · **TOPSIS** · **`MINMAX` normalization** · **any verification workflow** — the seam exists (`SPEC.md` §5.5), the implementation does not.

**Do not implement deferred items early, stub them, or reference them in the UI.**

---

**Begin with Phase 1. Read `SPEC.md` in full first. Stop at the gate and report.**
