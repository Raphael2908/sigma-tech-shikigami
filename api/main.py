import asyncio
import json
import logging
import pathlib
import sys

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# Ensure project root is importable
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from graph import get_meta, get_nodes_by_form_fields, init_db
from layers.layer0_seed import seed_graph
from layers.layer1_canary import check_canary
from layers.layer2_extract import parallel_extract
from layers.layer3_diff import semantic_diff
from layers.layer4_form import fill_form
from layers.layer5_pdf_fill import fill_pdf
from layers.layer6_upload import upload_to_github
from layers.layer7_autofill import run_autofill
from run import _build_frontend_payload, emit_frontend_payload

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)

app = FastAPI(title="TinyFish Compliance API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FORM_PATH = str(ROOT / "sample_form.json")
PDF_SRC = str(ROOT / "data" / "CSP_Update registered qualified individual information.pdf")
PDF_DST = str(ROOT / "data" / "filled" / "CSP_Update_filled.pdf")


# ── Startup ──────────────────────────────────────────────────────
@app.on_event("startup")
async def startup():
    await init_db()


# ── Models ───────────────────────────────────────────────────────
class PipelineRequest(BaseModel):
    form_path: str = "sample_form.json"


# ── Endpoints ────────────────────────────────────────────────────

@app.get("/api/health")
async def health():
    return {"status": "ok"}


@app.get("/api/payload")
async def get_payload():
    """Return the current frontend payload (last pipeline run)."""
    payload_path = ROOT / "data" / "frontend_payload.json"
    if not payload_path.exists():
        raise HTTPException(404, "No payload yet — run the pipeline first")
    return json.loads(payload_path.read_text(encoding="utf-8"))


@app.post("/api/pipeline/run")
async def run_pipeline(req: PipelineRequest = PipelineRequest()):
    """Run the full compliance pipeline synchronously. Returns the payload."""
    form_path = str(ROOT / req.form_path)
    if not pathlib.Path(form_path).exists():
        raise HTTPException(404, f"Form not found: {req.form_path}")

    form = json.loads(pathlib.Path(form_path).read_text(encoding="utf-8"))
    form_id = form["form_id"]

    # Seed
    if not await get_meta(f"seeded:{form_id}"):
        await seed_graph(form_path)

    # Canary
    canary = await check_canary()

    # Extract
    field_ids = [f["field_id"] for f in form["fields"]]
    nodes = await get_nodes_by_form_fields(field_ids)
    extraction_results = await parallel_extract(nodes)

    # Diff
    changed = [r for r in extraction_results if r.status == "changed"]
    diff_results = await semantic_diff(changed) if changed else []

    # Fill form
    pipeline_output = fill_form(form, extraction_results, diff_results)

    # PDF fill + upload + autofill
    filled_pdf_path = await fill_pdf(PDF_SRC, pipeline_output["fields"], PDF_DST)
    pdf_url = await upload_to_github(filled_pdf_path)
    autofill_result = await run_autofill(
        "http://localhost:3000/portal/form", pipeline_output, pdf_url,
    )
    pipeline_output["autofill"] = autofill_result

    # Build and emit frontend payload
    frontend_payload = _build_frontend_payload(
        form, canary, extraction_results, diff_results, pipeline_output,
    )
    emit_frontend_payload(frontend_payload)

    return frontend_payload


@app.post("/api/pipeline/stream")
async def stream_pipeline(req: PipelineRequest = PipelineRequest()):
    """Run the pipeline with SSE progress events."""

    async def event_generator():
        form_path = str(ROOT / req.form_path)
        form = json.loads(pathlib.Path(form_path).read_text(encoding="utf-8"))
        form_id = form["form_id"]

        yield {"event": "progress", "data": json.dumps({"step": "init", "message": "Initializing database"})}

        # Seed
        if not await get_meta(f"seeded:{form_id}"):
            yield {"event": "progress", "data": json.dumps({"step": "seed", "message": "Seeding knowledge graph"})}
            await seed_graph(form_path)
        yield {"event": "progress", "data": json.dumps({"step": "seed", "message": "Graph ready"})}

        # Canary
        yield {"event": "progress", "data": json.dumps({"step": "canary", "message": "Running canary check"})}
        canary = await check_canary()
        yield {"event": "progress", "data": json.dumps({"step": "canary", "message": f"Canary: {canary['status']}"})}

        # Extract
        yield {"event": "progress", "data": json.dumps({"step": "extract", "message": "Extracting from ACRA website"})}
        field_ids = [f["field_id"] for f in form["fields"]]
        nodes = await get_nodes_by_form_fields(field_ids)
        extraction_results = await parallel_extract(nodes)
        yield {"event": "progress", "data": json.dumps({"step": "extract", "message": f"Extracted {len(extraction_results)} nodes"})}

        # Diff
        changed = [r for r in extraction_results if r.status == "changed"]
        if changed:
            yield {"event": "progress", "data": json.dumps({"step": "diff", "message": f"Diffing {len(changed)} changed nodes"})}
            diff_results = await semantic_diff(changed)
        else:
            diff_results = []
        yield {"event": "progress", "data": json.dumps({"step": "diff", "message": "Diff complete"})}

        # Fill
        yield {"event": "progress", "data": json.dumps({"step": "fill", "message": "Filling form fields"})}
        pipeline_output = fill_form(form, extraction_results, diff_results)

        # PDF
        yield {"event": "progress", "data": json.dumps({"step": "pdf", "message": "Filling PDF form"})}
        filled_pdf_path = await fill_pdf(PDF_SRC, pipeline_output["fields"], PDF_DST)

        yield {"event": "progress", "data": json.dumps({"step": "upload", "message": "Uploading PDF to GitHub"})}
        pdf_url = await upload_to_github(filled_pdf_path)

        yield {"event": "progress", "data": json.dumps({"step": "autofill", "message": "TinyFish autofilling portal"})}
        autofill_result = await run_autofill(
            "http://localhost:3000/portal/form", pipeline_output, pdf_url,
        )
        pipeline_output["autofill"] = autofill_result

        # Build payload
        frontend_payload = _build_frontend_payload(
            form, canary, extraction_results, diff_results, pipeline_output,
        )
        emit_frontend_payload(frontend_payload)

        yield {"event": "complete", "data": json.dumps(frontend_payload)}

    return EventSourceResponse(event_generator())


@app.get("/api/form-definition")
async def get_form_definition():
    """Return the sample form definition."""
    form_path = ROOT / "sample_form.json"
    return json.loads(form_path.read_text(encoding="utf-8"))
