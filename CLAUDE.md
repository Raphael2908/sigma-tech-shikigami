Project Structure
TINYFISH/
├── db/
│   └── schema.sql
├── graph/
│   ├── __init__.py
│   ├── store.py          # SQLite read/write
│   └── models.py         # Node dataclass
├── layers/
│   ├── __init__.py
│   ├── layer0_seed.py    # OpenAI skeleton + goal generation
│   ├── layer1_canary.py  # Main page hash check
│   ├── layer2_extract.py # Parallel TinyFish fan-out
│   ├── layer3_diff.py    # OpenAI semantic diff
│   └── layer4_form.py    # Form filling + confidence scoring
├── clients/
│   ├── tinyfish.py       # TinyFish API wrapper
│   └── openai_client.py  # OpenAI wrapper
├── run.py                # Main orchestration entry point
├── config.py             # API keys, constants
└── sample_form.json      # Hardcoded test form for MVP

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

store.py functions to implement:

upsert_node(node: Node) -> None
get_node(url: str) -> Node | None
get_nodes_by_form_fields(fields: list[str]) -> list[Node]
save_version(node_id: int, hash: str, json: str) -> None
get_meta(key: str) -> str | None
set_meta(key: str, value: str) -> None

Test: Write a quick test_db.py that inserts a dummy node, reads it back, and saves a version.

Phase 2 — TinyFish Client
Goal: Wrapper around TinyFish API. Two modes: SSE (single) and async batch.
Tell Claude Code:

"Build a TinyFish client in clients/tinyfish.py. It needs two methods: run_single (SSE, awaits completion) and run_batch (submits N async tasks, polls until all complete). Use httpx for async HTTP."

Interface to implement:
pythonclass TinyFishClient:
    async def run_single(
        self, url: str, goal: str, browser_profile: str = "default"
    ) -> dict  # returns parsed result JSON

    async def run_batch(
        self, tasks: list[dict]  # each: {url, goal, browser_profile}
    ) -> list[dict]  # results in same order as tasks
Key details for Claude Code:

SSE endpoint: POST https://agent.tinyfish.ai/v1/automation/run-sse
Async endpoint: POST https://agent.tinyfish.ai/v1/automation/run-async
Poll for completion on async — check status until all run_ids return COMPLETE or FAILED
On FAILED: return {"error": "failed", "url": url} — don't raise, let layer 2 handle it
Auth header: Authorization: Bearer {TINYFISH_API_KEY}

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
Test: Run seeding on sample_form.json, confirm nodes appear in DB with correct goals.

Phase 4 — Layer 1: Canary Check
Goal: Hash the MAS homepage, compare against stored value, flag if changed.
Tell Claude Code:

"Build layer1_canary.py. Fetch the MAS main page using TinyFish (goal: return the top-level navigation links as JSON). Hash the result. Compare against stored hash in graph_meta. Return: {status: 'stable' | 'changed', should_block: False}. Canary never blocks a run — it only flags."

Key points:

Always returns and allows the run to proceed
If changed: log a warning, queue maintenance (for MVP just print "MAINTENANCE NEEDED")
Store hash under key "canary_hash" in graph_meta


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

Environment Setup
Tell Claude Code to create this at the start:
python# config.py
import os

TINYFISH_API_KEY = os.environ["TINYFISH_API_KEY"]
OPENAI_API_KEY = os.environ["OPENAI_API_KEY"]
DB_PATH = "regflow.db"
OPENAI_MODEL = "gpt-4o"
MAS_SEED_URL = "https://www.mas.gov.sg/regulation"
```

**Dependencies** (`requirements.txt`):
```
httpx
openai
aiosqlite
asyncio
python-dotenv
