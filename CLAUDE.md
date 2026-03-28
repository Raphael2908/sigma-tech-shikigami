Project Structure
TINYFISH/
├── db/
│   └── schema.sql
├── graph/
│   ├── __init__.py       # Re-exports Node + all store functions
│   ├── store.py          # Async SQLite read/write (aiosqlite)
│   └── models.py         # Node dataclass
├── layers/
│   ├── __init__.py
│   ├── layer0_seed.py    # OpenAI skeleton + goal generation
│   ├── layer1_canary.py  # Main page hash check
│   ├── layer2_extract.py # Parallel TinyFish fan-out
│   ├── layer3_diff.py    # OpenAI semantic diff
│   └── layer4_form.py    # Form filling + confidence scoring
├── clients/
│   ├── __init__.py       # Re-exports TinyFishClient
│   ├── tinyfish.py       # TinyFish API wrapper (httpx async)
│   └── openai_client.py  # OpenAI wrapper (chat_json)
├── tests/
│   ├── test_db.py        # Phase 1 tests
│   ├── test_tinyfish.py  # Phase 2 tests
│   └── test_seed.py      # Phase 3 tests
├── run.py                # Main orchestration entry point
├── config.py             # API keys, constants (dotenv)
├── sample_form.json      # Hardcoded test form for MVP
├── .env                  # API keys (not committed)
└── .gitignore

Phase 1 — Database & Models
Goal: SQLite schema up and readable/writable. No external calls yet.
Tell Claude Code:

"Create the SQLite schema and a store.py with functions to insert, update, and query nodes. Also create the Node dataclass in models.py."

Schema — db/schema.sql:
sqlCREATE TABLE nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    parent_url TEXT,
    extraction_goal TEXT,
    depth_from_seed INTEGER,
    section_type TEXT,  -- circular | guideline | notice | FAQ
    relevant_form_fields TEXT,  -- JSON array stored as string
    content_hash TEXT,
    last_extracted_json TEXT,   -- JSON stored as string
    last_extracted_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE node_versions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER REFERENCES nodes(id),
    content_hash TEXT,
    extracted_json TEXT,
    extracted_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE graph_meta (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

store.py functions (all async, all accept optional db_path parameter):

init_db(db_path?) -> None                                    # Creates tables from schema.sql
upsert_node(node: Node, db_path?) -> None                    # INSERT ON CONFLICT(url) DO UPDATE (preserves id)
get_node(url: str, db_path?) -> Node | None
get_nodes_by_form_fields(fields: list[str], db_path?) -> list[Node]  # Python-side JSON filtering
save_version(node_id: int, hash: str, json_str: str, db_path?) -> None
get_meta(key: str, db_path?) -> str | None
set_meta(key: str, value: str, db_path?) -> None

Test: Write a quick test_db.py that inserts a dummy node, reads it back, and saves a version.

Phase 2 — TinyFish Client
Goal: Wrapper around TinyFish API. Two modes: SSE (single) and async batch.
Tell Claude Code:

"Build a TinyFish client in clients/tinyfish.py. It needs two methods: run_single (SSE, awaits completion) and run_batch (submits N async tasks, polls until all complete). Use httpx for async HTTP."

Interface (implemented):
pythonclass TinyFishClient:
    async def run_single(
        self, url: str, goal: str, browser_profile: str = "stealth"
    ) -> dict  # returns parsed result JSON via SSE

    async def run_batch(
        self, tasks: list[dict]  # each: {url, goal, browser_profile}
    ) -> list[dict]  # results in same order as tasks, via /run-batch + polling
Key details (CORRECTED from original spec — verified against OpenAPI docs):

Auth header: X-API-Key (NOT Authorization: Bearer)
browser_profile: "lite" | "stealth" (NOT "default")
SSE endpoint: POST /v1/automation/run-sse — used by run_single
Batch endpoint: POST /v1/automation/run-batch — used by run_batch (submits up to 100 runs)
Poll endpoint: GET /v1/runs/{id} — status: PENDING|RUNNING|COMPLETED|FAILED|CANCELLED
Sync endpoint: POST /v1/automation/run — available but not used (run-sse preferred for progress)
On FAILED: return {"error": "failed", "url": url} — don't raise, let layer 2 handle it
Full API reference: .claude/rules/tinyfish_api.md

Test: Run a single TinyFish call against a real MAS page before proceeding.

Phase 3 — Layer 0: Graph Seeding
Goal: Given a raw form (JSON), produce the OpenAI skeleton and write nodes to the graph.
Tell Claude Code:

"Build layer0_seed.py. It takes a form definition JSON, calls OpenAI to produce a navigation skeleton and extraction goals, then writes those as nodes into the graph via store.py. This should only run once per form type."

Sample form definition (sample_form.json) — hardcode this for MVP:
json{
  "form_id": "MAS_AML_MVP",
  "form_name": "AML/CFT Compliance Basics",
  "fields": [
    {
      "field_id": "min_paid_up_capital",
      "description": "Minimum paid-up capital requirement for a CMS licensee"
    },
    {
      "field_id": "reporting_threshold",
      "description": "Transaction reporting threshold for AML purposes in SGD"
    },
    {
      "field_id": "beneficial_ownership_threshold",
      "description": "Percentage threshold for beneficial ownership disclosure"
    }
  ]
}
```

**OpenAI prompt for seeding** — tell Claude Code to use this structure:
```
You are a regulatory compliance assistant. Given this MAS compliance form,
produce a JSON with:
1. seed_url: the MAS URL to start navigation from
2. For each field, a target URL on mas.gov.sg and a plain English extraction goal

Return ONLY valid JSON, no markdown, no preamble.

Form: {form_json}

Return format:
{
  "seed_url": "https://www.mas.gov.sg/regulation",
  "nodes": [
    {
      "field_id": "...",
      "url": "...",
      "extraction_goal": "Find ... Return JSON: { value, currency, source_url, effective_date }"
    }
  ]
}
After OpenAI responds: write each node to SQLite with relevant_form_fields = [field_id].
Idempotency: Uses graph_meta key "seeded:{form_id}" — skips if already seeded.
Seed node written at depth_from_seed=0, field nodes at depth_from_seed=1 with parent_url=seed_url.
OpenAI client: clients/openai_client.py exposes chat_json(system_prompt, user_content) -> dict (reused by layer3_diff).
Test: Run seeding on sample_form.json, confirm nodes appear in DB with correct goals.

Phase 4 — Layer 1: Canary Check
Goal: Hash the MAS homepage, compare against stored value, flag if changed.
Tell Claude Code:

"Build layer1_canary.py. Fetch the MAS main page using TinyFish (goal: return the top-level navigation links as JSON). Hash the result. Compare against stored hash in graph_meta. Return: {status: 'stable' | 'changed', should_block: False}. Canary never blocks a run — it only flags."

Key points:

Always returns and allows the run to proceed
If changed: log a warning, queue maintenance (for MVP just print "MAINTENANCE NEEDED")
Store hash under key "canary_hash" in graph_meta

Implementation notes:
- check_canary(db_path?) -> {"status": "stable"|"changed", "should_block": False}
- First run (no stored hash): returns "stable" and stores baseline — no false alarm
- On TinyFish fetch error: returns "changed" but does NOT update stored hash
- hash_json() utility lives in graph/utils.py (reused by layer2_extract)
- Re-exported from graph/__init__.py


Phase 5 — Layer 2: Parallel Extraction
Goal: Fan out TinyFish across all relevant nodes, hash triage results.
Tell Claude Code:

"Build layer2_extract.py. Given a list of nodes, submit all to TinyFish in parallel using run_batch. For each result, compute SHA-256 of the returned JSON. Compare against stored content_hash. Return a structured triage result per node."

Return structure per node:
python@dataclass
class ExtractionResult:
    node: Node
    current_json: dict
    current_hash: str
    status: str  # "unchanged" | "changed" | "error_404" | "error_other"
    prior_hash: str | None
Hash logic:
pythonimport hashlib, json
def hash_json(data: dict) -> str:
    return hashlib.sha256(
        json.dumps(data, sort_keys=True).encode()
    ).hexdigest()
```

**After triage:** update `last_extracted_json`, `content_hash`, `last_extracted_at` in DB for every node regardless of change status.

**Test:** Run against the seeded nodes. Confirm results come back and hashes are stored.

Implementation notes:
- parallel_extract(nodes, db_path?) -> list[ExtractionResult]
- ExtractionResult dataclass lives in layer2_extract.py (transient, not in models.py)
- Batches chunked at 100 (TinyFish API limit)
- On error: updates only last_extracted_at, preserves content_hash and last_extracted_json
- On success: updates all 3 fields + calls save_version for audit trail
- All errors classified as "error_other" — 404 detection deferred to Phase 9
- hash_json reused from graph/utils.py

---

## Phase 6 — Layer 3: Semantic Diff

**Goal:** For changed nodes, call OpenAI to determine if the change is material.

Tell Claude Code:
> "Build layer3_diff.py. Takes a list of ExtractionResult where status='changed'. For each, calls OpenAI with the prior and current JSON. Returns a DiffResult per node."

**OpenAI prompt** — tell Claude Code to use this:
```
Compare these two regulatory extracts for field '{field_id}'.

Prior: {prior_json}
Current: {current_json}

Did the regulatory requirement change?
Return ONLY valid JSON:
{
  "changed": true | false,
  "change_type": "material" | "cosmetic" | "ambiguous",
  "change_description": "plain English description"
}
Return structure:
python@dataclass
class DiffResult:
    node: Node
    changed: bool
    change_type: str  # material | cosmetic | ambiguous
    change_description: str
    current_json: dict
```

Implementation notes:
- semantic_diff(changed_results, db_path?) -> list[DiffResult]
- Prior JSON retrieved from node_versions via new get_prior_version(node_id, db_path?) in store.py (ORDER BY id DESC OFFSET 1)
- First-time extractions (prior_hash=None): returns synthetic "material" DiffResult, skips OpenAI call
- Diffs run in parallel via asyncio.gather with return_exceptions=True
- On OpenAI failure: falls back to change_type="ambiguous" (conservative, surfaces for review)
- DiffResult dataclass lives in layer3_diff.py (transient, same pattern as ExtractionResult)
- Mocking note: must patch diff_module.chat_json not openai_module.chat_json (import-by-name binding)

---

## Phase 7 — Layer 4: Form Filling

**Goal:** Combine all results into a CSP-ready form output.

Tell Claude Code:
> "Build layer4_form.py. Takes ExtractionResults and DiffResults, maps them to form fields, applies confidence classification, and returns a filled form JSON."

**Confidence rules:**
```
hash unchanged        → confidence: "high",            review: False
diff: material        → confidence: "review_required",  review: True
diff: ambiguous       → confidence: "review_required",  review: True
diff: cosmetic        → confidence: "high",             review: False
status: error_404     → confidence: "missing",          review: True
no node for field     → confidence: "missing",          review: True

Phase 8 — Orchestration
Goal: Wire all layers into a single run.py entry point.
Tell Claude Code:

"Build run.py. It should: check if the graph is seeded (if not, run layer 0), run the canary, query relevant nodes for the form, run parallel extraction, run semantic diff on changed nodes, run form filling, print the final output JSON."

run.py flow:
pythonasync def run_compliance(form_path: str):
    form = load_form(form_path)

    # Seed if first run
    if not nodes_exist_for_form(form):
        await seed_graph(form)

    # Canary
    canary = await check_canary()

    # Get relevant nodes
    nodes = get_nodes_by_form_fields(form.field_ids)

    # Parallel extraction
    extraction_results = await parallel_extract(nodes)

    # Semantic diff on changed
    changed = [r for r in extraction_results if r.status == "changed"]
    diff_results = await semantic_diff(changed)

    # Form fill
    output = fill_form(form, extraction_results, diff_results)

    print(json.dumps(output, indent=2))

Phase 9 — Local Repair (404 handling)
Goal: Add 404 repair to layer 2 after the main fan-out.
Tell Claude Code:

"Add a repair_404 function to layer2_extract.py. For any ExtractionResult with status='error_404', call TinyFish on the parent_url with goal: 'Find where {field description} has moved. Return the new URL and its content as JSON.' Update the node's URL in the graph and re-run extraction."

This is additive — add it after everything else works.

Environment Setup (implemented):
python# config.py
import os
from dotenv import load_dotenv
load_dotenv()

TINYFISH_API_KEY = os.environ["TINYFISH_API_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
DB_PATH = "regflow.db"
OPENAI_MODEL = "gpt-4o"
MAS_SEED_URL = "https://www.mas.gov.sg/regulation"
```

**Dependencies** (`requirements.txt`):
```
aiosqlite
python-dotenv
httpx
openai
```
Note: asyncio is stdlib, not a pip package — removed from requirements.

**Architectural Decisions Log:**
- All store.py functions are async (aiosqlite) with optional db_path param for testability
- upsert_node uses ON CONFLICT(url) DO UPDATE to preserve row IDs
- get_nodes_by_form_fields uses Python-side JSON filtering (not json_each) for SQLite compatibility
- schema.sql uses IF NOT EXISTS for idempotent init_db()
- TinyFish auth is X-API-Key header, browser_profile is "lite"|"stealth"
- run_batch uses /run-batch + GET /runs/{id} polling (5s interval, 300s timeout)
- OpenAI chat_json() strips markdown fences, uses temperature=0, lazy singleton client
- Tests use separate test_regflow.db with cleanup in finally block
- hash_json(data) in graph/utils.py — SHA-256 of json.dumps(sort_keys=True), shared by canary + extraction
- Canary first run = "stable" (baseline establishment, not false alarm)
- Canary on fetch error = "changed" but stored hash preserved (no corrupt baseline)
- Tests mock TinyFishClient.run_single via monkeypatch for fast offline testing
- ExtractionResult is a transient dataclass in layer2_extract.py, not in graph/models.py
- Error results: only last_extracted_at updated, content_hash/json preserved (same pattern as canary)
- save_version called for all successful extractions (unchanged + changed) for full audit trail
- Batch chunked at 100 to respect TinyFish API limit
- get_prior_version in store.py uses ORDER BY id DESC OFFSET 1 (id tiebreaker, not timestamp)
- First-time extractions skip OpenAI diff, return synthetic "material" DiffResult
- OpenAI diff failures fall back to "ambiguous" (conservative for human review)
- Monkeypatching import-by-name: patch the consuming module's reference, not the source module
