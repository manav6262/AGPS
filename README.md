# AGPS — Automated Government Procurement System & Evaluation Engine

An enterprise-grade, verifiable government e-procurement platform and mathematical evaluation engine designed to eliminate discretion, bias, and opacity in public procurement tenders.

AGPS implements transparent **Simple Additive Weighting (SAW)** multi-criteria scoring, immutable **SHA-256 cryptographic audit chains**, **graduated configuration locking**, **two-envelope price sealing**, and server-side **sensitivity & breakeven analysis**.

---

## Key Architectural Principles

1. **Pure Mathematical Evaluation Engine (`server/src/engines/`)**:
   - Zero I/O, zero database queries, and zero non-deterministic calls (`Date.now()`, `Math.random()`) inside the scoring pipeline.
   - Float64 ratio normalization with multi-tier tie-breaking using lexicographical UTF-16 code-unit determinism.

2. **Graduated Lock State & Frozen Snapshot**:
   - `UNLOCKED` (Draft) $\to$ `SOFT_LOCKED` (Published / Revision increment) $\to$ `HARD_LOCKED` (Atomic seal on first submitted bid).
   - All evaluations evaluate against a frozen, canonical `TenderConfigSnapshot` identified by a SHA-256 `configHash`.

3. **Two-Envelope Bid Sealing (SPEC §17.4)**:
   - Commercial quotes (`priceMinor`) are excluded by default model projection (`select: false`) and sealed until formal `FINANCIAL_OPEN` transition.

4. **Cryptographic SHA-256 Audit Trail**:
   - Append-only hash chain linking each lifecycle event: $H_i = \text{SHA256}(H_{i-1} \parallel \text{seq} \parallel \text{action} \parallel \text{timestamp} \parallel \text{payload})$.

5. **Server-Side Sensitivity & Breakeven Analysis**:
   - Strictly read-only simulation endpoints (`POST /api/tenders/:id/simulate` and `GET /api/tenders/:id/breakeven`) that evaluate live weight elasticity and calculate the exact single-parameter delta ($\Delta P$, $\Delta D$, $\Delta Q$) required for non-winning bids to beat the winner.

---

## Getting Started

### Prerequisites
- **Node.js**: v20+ or v22+
- **MongoDB**: Local MongoDB instance (`mongodb://127.0.0.1:27017/agps`) or MongoDB Atlas URI

### Quickstart Setup

Clone the repository and install all workspace dependencies:

```bash
npm install
```

Configure your server environment variables:

```bash
cp server/.env.example server/.env
```

*(Edit `server/.env` if using a custom MongoDB connection string or custom JWT secrets).*

Populate the database with initial users, proof tenders, and verified audit chains:

```bash
npm run seed
```

Start both the backend server (`http://localhost:5000`) and frontend portal (`http://localhost:5173`) concurrently:

```bash
npm run dev
```

---

## Standard Root Commands

| Command | Description |
| :--- | :--- |
| `npm run dev` | Starts both backend server and frontend development portal concurrently |
| `npm run build` | Builds `@agps/shared`, `@agps/server`, and `@agps/frontend` production bundles |
| `npm run seed` | Seeds MongoDB with initial users, 5 lifecycle tenders, and 2 thesis proof tenders |
| `npm run test` | Executes the complete 66-test integration and unit test suite via Vitest |
| `npm run lint` | Runs ESLint across the server codebase |

---

## Pre-Configured Demo Accounts

| Role | Name | Email | Password |
| :--- | :--- | :--- | :--- |
| **Admin** | Rajesh Kumar (Chief Procurement Officer) | `admin@agps.gov.in` | `AdminPassword123!` |
| **Auditor** | Suresh Sharma (Principal Auditor, CAG) | `auditor@cag.gov.in` | `AuditorPassword123!` |
| **Vendor 1** | Tata Advanced Systems | `vendor1@tatacomm.in` | `VendorPassword123!` |
| **Vendor 2** | Infosys Public Services | `vendor2@infosys.in` | `VendorPassword123!` |
| **Vendor 3** | L&T Technology Services | `vendor3@lnttech.in` | `VendorPassword123!` |
| **Vendor 4** | Wipro Infrastructure | `vendor4@wipro.in` | `VendorPassword123!` |
| **Vendor 5** | Bharat Electronics Ltd | `vendor5@bel.co.in` | `VendorPassword123!` |

> **Tip:** You can also click the quick-fill demo buttons on the `/login` page to auto-fill credentials instantly.

---

## Demonstration Proof Tenders

The seed script (`npm run seed`) populates two core proof tenders demonstrating the system's thesis:

1. **Weight-Flip Pair (`TND-2026-FLIP-A` & `TND-2026-FLIP-B`)**:
   - Both tenders evaluate the **exact same bid values** from Tata Advanced Systems and Infosys Public Services.
   - **Configuration A** (Weights: 40% Price, 30% Quality, 20% Delivery, 10% Experience) $\to$ **Winner: Tata Advanced Systems** (Score: `84.68`).
   - **Configuration B** (Weights: 20% Price, 50% Quality, 20% Delivery, 10% Experience) $\to$ **Winner: Infosys Public Services** (Score: `90.53`).
   - Proves mathematically that ranking outcome is driven by transparent configuration, not opaque evaluation logic.

2. **6-Criteria Generic Multi-Source Tender (`TND-2026-003`)**:
   - Evaluates bids across 6 scoring dimensions sourced from commercial bids, vendor profiles, and technical parameters (`TECHNICAL_VALUE` for Warranty and 24/7 SLA Response Time).
   - Proves that the evaluation engine is fully generic and not hardcoded to fixed criteria.

---

## API Reference Overview

### Authentication (`/api/auth`)
- `POST /api/auth/register` — Register new supplier/vendor account.
- `POST /api/auth/login` — Authenticate and receive JWT access token + httpOnly refresh cookie.
- `POST /api/auth/refresh` — Silent refresh token rotation.
- `POST /api/auth/logout` — Invalidate session.
- `GET /api/auth/me` — Current authenticated user profile.

### Procurement Tenders (`/api/tenders`)
- `GET /api/tenders` — List all visible tenders (filterable by status/search).
- `POST /api/tenders` — Create draft tender dossier (`ADMIN` only).
- `GET /api/tenders/:id` — View complete tender details and frozen config snapshot.
- `POST /api/tenders/:id/transition` — Lifecycle transition (`DRAFT` $\to$ `PUBLISHED` $\to$ `BIDDING_OPEN` $\to$ `BIDDING_CLOSED` $\to$ `FINANCIAL_OPEN` $\to$ `EVALUATED` $\to$ `WINNER_SELECTED` $\to$ `CLOSED`).
- `POST /api/tenders/:id/bids` — Submit sealed commercial and technical proposal (`VENDOR` only).
- `POST /api/tenders/:id/evaluate` — Execute pure evaluation pipeline with in-process lock (`ADMIN` only).
- `POST /api/tenders/:id/award/confirm` — Officially confirm SAW Rank #1 winner (`ADMIN` only).
- `POST /api/tenders/:id/award/override` — Authorized human winner override requiring $\ge 10$ char audited justification (`ADMIN` only).
- `POST /api/tenders/:id/close` — Finalize and archive tender dossier (`ADMIN` only).

### Analytical & Sensitivity Toolkit (`/api/tenders`)
- `POST /api/tenders/:id/simulate` — In-memory SAW weight sensitivity simulator (`ADMIN` / `AUDITOR`).
- `GET /api/tenders/:id/breakeven` — Breakeven deltas and critical weight stability bounds (`ADMIN` / `AUDITOR`).
- `GET /api/tenders/:id/explainability` — Transparent criteria breakdown and normalized scoring matrix.
- `GET /api/tenders/:id/compare?bidIds=...` — Side-by-side criteria comparison matrix.
- `GET /api/tenders/:id/report.csv` — Official CSV export with complete provenance disclosure (`ADMIN` / `AUDITOR`).
- `GET /api/dashboard/summary` — Global system counts and active procurement metrics.

---

## License

Government of India / Academic Open Standard. Developed for public procurement research and evaluation transparency.
