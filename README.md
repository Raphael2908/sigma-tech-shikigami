# Sigma Tech

*A self-healing regulatory knowledge graph that monitors Singapore government websites, detects regulatory changes, and auto-fills compliance forms — so Corporate Service Providers never miss a rule change again.*

**`Python`** | **`TinyFish API`** | **`OpenAI GPT-4o`** | **`FastAPI`** | **`Next.js 16`** | **`SQLite`** | **`11 test suites`**

Built by **Raphael, Darren, Jerome** — TinyFish Hackathon Singapore 2026

---

## The Problem

- **1,500–2,000 CSP firms** in Singapore manually navigate 5+ government agency websites (ACRA, MAS, MOM, IRAS, ICA) for every filing
- **780 hours/year** per firm lost to regulatory monitoring ([Thomson Reuters 2023](https://www.thomsonreuters.com/en-us/posts/investigation-fraud-and-risk/cost-of-compliance-2023/))
- **S$27.45M** in MAS penalties from a single enforcement action (July 2025) ([MAS](https://www.mas.gov.sg/regulation/enforcement/enforcement-actions/2025/mas-takes-regulatory-actions-against-9-financial-institutions-for-aml-related-breaches))
- Enterprise RegTech costs **S$100K+/year** — built for banks, not mid-market CSPs

Sigma Tech closes this gap.

---

## How It Works

OpenAI thinks. TinyFish acts. The knowledge graph remembers.

```
FORM (PDF)
  │
  ▼
┌─────────────────────────────────────────────────────────────────┐
│  0. SEED          OpenAI reads form, generates extraction goals │  ◀ OPENAI
│  │                                                              │
│  ▼                                                              │
│  1. CANARY        TinyFish fetches seed page, SHA-256 baseline  │  ◀ TINYFISH
│  │                                                              │
│  ▼                                                              │
│  2. EXTRACT       Batch extract 100 pages (stealth, parallel)   │  ◀ TINYFISH
│  │                + self-healing 404 repair via parent URLs     │
│  ▼                                                              │
│  3. DIFF          Classify changes: material / cosmetic / ambig │  ◀ OPENAI
│  │                                                              │
│  ▼                                                              │
│  4. SCORE         Confidence per field: high / review / missing  │  ◀ FASTAPI
│  │                                                              │
│  ▼                                                              │
│  5. PDF FILL      Map fields → 45 AcroForm names, pypdf writes  │  ◀ OPENAI
│  │                                                              │
│  ▼                                                              │
│  6. UPLOAD        Filled PDF → GitHub API → raw URL (PDF bridge)│  ◀ GITHUB
│  │                                                              │
│  ▼                                                              │
│  7. AUTOFILL      TinyFish navigates BizFile+, fills form,      │  ◀ TINYFISH
│                   downloads PDF from GitHub, uploads to portal  │
└─────────────────────────────────────────────────────────────────┘
  │
  ▼
COMPLETED FILING — presented for human review with confidence scores
```

| Stage | What Happens | Powered By |
|-------|-------------|------------|
| 0 — Seed | Parse form definition, generate per-field extraction goals, write graph nodes | OpenAI GPT-4o |
| 1 — Canary | Fetch ACRA seed page, hash nav structure, compare against stored baseline | TinyFish (SSE) |
| 2 — Extract | Batch extract up to 100 pages in parallel; auto-repair broken URLs via parent navigation | TinyFish (batch, stealth) |
| 3 — Diff | Classify each change as material, cosmetic, or ambiguous | OpenAI GPT-4o |
| 4 — Score | Assign graduated confidence: `high`, `review_required`, or `missing` per field | FastAPI (internal logic) |
| 5 — PDF Fill | Map abstract field IDs to 45 PDF AcroForm field names, fill with pypdf | OpenAI + pypdf |
| 6 — Upload | Push filled PDF to GitHub via Contents API, return raw URL | GitHub API |
| 7 — Autofill | Navigate mock BizFile+ portal, fill web form fields, download PDF from GitHub URL, upload to portal | TinyFish (SSE, stealth) |

---

## Why This Is Hard

### Self-Healing Knowledge Graph
Government URLs break constantly — pages move, get restructured, return 404. When extraction fails, the system automatically navigates from the parent URL to find where content moved, updates the graph, and re-extracts. No human intervention. Capped at 5 repairs per run to control API costs.

### The GitHub PDF Bridge
TinyFish browser agents run in isolated sessions — they cannot access your filesystem. Our solution: upload the filled PDF to GitHub via the Contents API, producing a raw URL. TinyFish then downloads from that URL during portal autofill. A filesystem limitation becomes a feature: every filled PDF gets a versioned, auditable URL.

### Semantic Diff, Not String Diff
A naive text diff would flag every reformatted paragraph. Instead, OpenAI classifies each change as **material** (affects compliance), **cosmetic** (formatting only), or **ambiguous** (requires human review). This three-tier classification directly drives confidence scoring.

### Graduated Confidence Scoring
Not binary pass/fail. Each of the 45 form fields receives a graduated score: `high` (auto-fill safe), `review_required` (human must verify), or `missing` (extraction failed). Scoring cascades through hash comparison, semantic diff results, and extraction status.

---

## TinyFish Integration Deep Dive

TinyFish is not a bolt-on — it is the backbone. Four distinct integration points across the pipeline:

| Layer | TinyFish Usage | Mode | Details |
|-------|---------------|------|---------|
| 1 — Canary | `run_single` via SSE | stealth | Fetches ACRA seed page, extracts nav links for SHA-256 baseline comparison |
| 2 — Extract | `run_batch` + polling | stealth, parallel | Up to 100 pages per batch, 5s poll interval, 300s timeout |
| 2 — Repair | `run_single` via SSE | stealth | Navigates parent URL to locate moved content, updates graph |
| 7 — Autofill | `run_single` via SSE | stealth | Step-by-step BizFile+ form fill: text fields, date pickers, PDF upload from GitHub URL |

**Client architecture:** Custom async httpx wrapper with SSE stream parsing, batch submission + poll-until-complete pattern, exponential backoff, and 300s timeout. Both `run_single` (SSE streaming) and `run_batch` (poll-based) patterns implemented. Full source: [`clients/tinyfish.py`](clients/tinyfish.py) (187 lines).

---

## Validation

LinkedIn post announcing Sigma Tech at the TinyFish Hackathon received interest from **Daniel Leung FCCA MSID** (Country Manager | Banker | Speaker | Story-Teller):

> *"Would be interesting to hear more especially with our ACCA Singapore leaders Hendrik Jap in this space."*

Real industry interest from a senior ACCA figure — validating product-market fit in the compliance professional community.

---

## Market Opportunity

| Metric | Value |
|--------|-------|
| CSP firms in Singapore | 1,500–2,000 |
| Hours/year spent on regulatory monitoring | 780 |
| MAS penalty (single action, Jul 2025) | S$27.45M |
| Max ACRA fine for register failures | S$25,000 |
| Enterprise RegTech annual cost | S$100K+/year |
| Singapore RegTech CAGR | 16.7% |
| Market size by 2029 | US$386M |
| Mid-market RegTech solutions today | **Zero** |

Sigma Tech is the mid-market RegTech platform that doesn't exist yet.

---

## Tech Stack

| Component | Technology |
|-----------|-----------|
| Pipeline orchestration | Python 3, async/await, 8 layers |
| Web extraction | TinyFish API (SSE + batch, stealth mode) |
| AI reasoning | OpenAI GPT-4o (graph seeding, semantic diff, field mapping) |
| Knowledge graph | SQLite + aiosqlite (versioned nodes, hashes, metadata) |
| PDF form filling | pypdf (45 AcroForm fields) |
| Backend API | FastAPI + SSE streaming (sse-starlette) |
| Frontend | Next.js 16, React 19, TypeScript, Tailwind CSS 4 |
| PDF bridge | GitHub Contents API |

**Scope:** ~1,630 lines Python (pipeline + graph + clients) | ~1,476 lines TypeScript (frontend) | ~428 lines FastAPI | 1,236 lines tests across 11 suites

---

## Quick Start

```bash
# Clone
git clone https://github.com/jeromepaulteoh/Shikigami.git
cd Shikigami

# Python environment
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt

# Environment variables
cp .env.example .env
# Add: TINYFISH_API_KEY=... and OPENAI_API_KEY=...

# Option 1: Full pipeline (CLI)
python run.py sample_form.json

# Option 2: FastAPI backend
cd api && uvicorn main:app --reload

# Option 3: Next.js frontend
cd frontend && npm install && npm run dev

# Option 4: Standalone demo (no server needed)
open Regulator_Demo_Tinyfish.html
```

---

## Project Structure

```
Shikigami/
├── layers/                  # 8-stage async pipeline
│   ├── layer0_seed.py           # OpenAI graph seeding
│   ├── layer1_canary.py         # TinyFish change detection
│   ├── layer2_extract.py        # TinyFish parallel extraction + 404 repair
│   ├── layer3_diff.py           # OpenAI semantic diff
│   ├── layer4_form.py           # Confidence scoring
│   ├── layer5_pdf_fill.py       # pypdf AcroForm (45 fields)
│   ├── layer6_upload.py         # GitHub Contents API
│   └── layer7_autofill.py       # TinyFish portal autofill
├── graph/                   # Versioned knowledge graph (SQLite)
├── clients/                 # TinyFish + OpenAI async wrappers
├── api/                     # FastAPI + SSE streaming
├── frontend/                # Next.js 16 + React 19 + Tailwind
├── tests/                   # 11 test suites (1,236 lines)
├── data/                    # ACRA PDF form, mock BizFile+ pages
├── run.py                   # CLI orchestrator
└── sample_form.json         # Target: ACRA Withdrawal from Approved Liquidators
```

---

## Pre-Existing Code

> All application code in this repository was written during the TinyFish Hackathon on 28 March 2026. The project uses open-source dependencies (pypdf, aiosqlite, FastAPI, Next.js) and external APIs (TinyFish, OpenAI, GitHub) but all application code is original.

---

## Team

- **Raphael** — Pipeline architecture, Python layers, system design
- **Darren** — Frontend, demo design, UX
- **Jerome** — Integration, testing, deployment

---

## Why We Should Win a Spot Prize

| Prize | Why Us |
|-------|--------|
| Deep Sea Architect | 4 TinyFish integration points: canary, batch extract, 404 repair, portal autofill. Custom SSE parser, batch polling, stealth mode throughout. |
| Most Likely Next Unicorn | S$386M market, zero mid-market competitors, validated by ACCA Singapore leadership interest, real regulatory form. |
| Most Likely to Go Viral | An AI agent that fills government forms by downloading PDFs from GitHub. The absurdity is the feature. |
