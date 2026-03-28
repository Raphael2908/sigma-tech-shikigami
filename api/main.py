import asyncio
import json
import logging
import pathlib
import sys

from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from sse_starlette.sse import EventSourceResponse

# Ensure project root is importable
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))

from graph import get_meta, get_nodes_by_form_fields, init_db
from layers.layer0_seed import seed_graph
from layers.layer1_canary import check_canary
from layers.layer2_extract import parallel_extract, sequential_extract_stream
from layers.layer3_diff import semantic_diff
from layers.layer4_form import fill_form
from layers.layer5_pdf_fill import fill_pdf
from layers.layer6_upload import upload_to_github
from layers.layer7_autofill import run_autofill
from run import _build_frontend_payload, emit_frontend_payload
from layers.layer2_extract import ExtractionResult

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
        "https://mock-website-delta.vercel.app/", pipeline_output, pdf_url,
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
            "https://mock-website-delta.vercel.app/", pipeline_output, pdf_url,
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


# ── New endpoints: Upload, Stream-Browse, Consolidate ───────────

UPLOAD_DIR = ROOT / "data" / "uploads"


@app.post("/api/upload")
async def upload_pdf(files: list[UploadFile] = File(...)):
    """Accept PDF uploads, save locally, upload to GitHub, extract fields."""
    from clients.openai_client import chat_json
    from layers.layer6_upload import upload_to_github

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

    uploads = []
    extracted_fields = []

    for f in files:
        # Save locally
        local_path = UPLOAD_DIR / f.filename
        content = await f.read()
        local_path.write_bytes(content)

        # Upload to GitHub
        try:
            github_url = await upload_to_github(
                str(local_path), f"data/uploads/{f.filename}"
            )
            status = "Uploaded to GitHub"
        except Exception as e:
            logger.error("GitHub upload failed for %s: %s", f.filename, e)
            github_url = ""
            status = "Saved locally (GitHub upload failed)"

        # Extract field summaries from PDF via OpenAI
        description = "Processing..."
        try:
            from pypdf import PdfReader
            reader = PdfReader(str(local_path))
            text = "\n".join(page.extract_text() or "" for page in reader.pages[:5])
            if text.strip():
                result = await chat_json(
                    "You are a compliance analyst. Extract key form fields from this PDF text. "
                    "Return JSON: {\"fields\": [{\"field_id\": str, \"value\": str, \"description\": str}]}",
                    f"PDF filename: {f.filename}\n\nText content:\n{text[:4000]}",
                )
                fields = result.get("fields", [])
                extracted_fields.extend(fields)
                description = f"Extracted {len(fields)} fields"
            else:
                description = "No text content found (scanned PDF?)"
        except Exception as e:
            logger.error("Field extraction failed for %s: %s", f.filename, e)
            description = f"Extraction error: {str(e)[:80]}"

        uploads.append([f.filename, status, description])

    return {"uploads": uploads, "extracted_fields": extracted_fields}


@app.get("/api/pipeline/stream-browse")
async def stream_browse(form_path: str = Query(default="sample_form.json")):
    """SSE endpoint for TinyFish live browsing + extraction + diff."""

    async def event_generator():
        try:
            fp = str(ROOT / form_path)
            form = json.loads(pathlib.Path(fp).read_text(encoding="utf-8"))
            form_id = form["form_id"]

            yield {"event": "progress", "data": json.dumps({"step": "init", "message": "Initializing..."})}

            # Seed if needed
            try:
                if not await get_meta(f"seeded:{form_id}"):
                    yield {"event": "progress", "data": json.dumps({"step": "seed", "message": "Seeding knowledge graph..."})}
                    await seed_graph(fp)
                yield {"event": "progress", "data": json.dumps({"step": "seed", "message": "Graph ready"})}
            except Exception as e:
                logger.error("Seed failed: %s", e)
                yield {"event": "progress", "data": json.dumps({"step": "seed", "message": f"Seed error: {str(e)[:100]}"})}

            # Skip canary in browse mode — extraction detects changes directly
            canary_status = "skipped"
            yield {"event": "progress", "data": json.dumps({"step": "canary", "message": "Canary skipped (extraction will detect changes)"})}

            # Sequential extraction with SSE forwarding
            field_ids = [f["field_id"] for f in form["fields"]]
            nodes = await get_nodes_by_form_fields(field_ids)
            extraction_results = []

            yield {"event": "progress", "data": json.dumps({"step": "extract", "message": f"Found {len(nodes)} nodes to extract"})}

            try:
                async for evt in sequential_extract_stream(nodes):
                    evt_type = evt.get("type", "")
                    if evt_type == "streaming_url":
                        yield {"event": "streaming_url", "data": json.dumps({"url": evt["url"]})}
                    elif evt_type == "progress":
                        yield {"event": "progress", "data": json.dumps({
                            "step": "extract", "message": evt.get("message", ""),
                            "node_url": evt.get("node_url", ""),
                        })}
                    elif evt_type == "node_complete":
                        yield {"event": "progress", "data": json.dumps({
                            "step": "extract",
                            "message": f"Node {evt.get('node_url', '')} → {evt.get('status', '')}",
                        })}
                    elif evt_type == "extract_done":
                        extraction_results = evt["results"]
            except Exception as e:
                logger.error("Extraction failed: %s", e)
                yield {"event": "progress", "data": json.dumps({"step": "extract", "message": f"Extraction error: {str(e)[:100]}"})}

            # Diff
            diff_results = []
            try:
                changed = [r for r in extraction_results if r.status == "changed"]
                if changed:
                    yield {"event": "progress", "data": json.dumps({"step": "diff", "message": f"Diffing {len(changed)} changed nodes..."})}
                    diff_results = await semantic_diff(changed)
            except Exception as e:
                logger.error("Diff failed: %s", e)
                yield {"event": "progress", "data": json.dumps({"step": "diff", "message": f"Diff error: {str(e)[:100]}"})}

            # Build changes array for frontend
            changes = []
            for dr in diff_results:
                kind = "warn" if dr.change_type == "material" else "info"
                changes.append({
                    "kind": kind,
                    "title": dr.change_description[:80],
                    "desc": dr.change_description,
                    "meta": f"Node diff | {dr.change_type}",
                })
            if canary_status == "changed":
                changes.append({
                    "kind": "info",
                    "title": "Top-level navigation drift detected",
                    "desc": "Canary noticed site-structure drift.",
                    "meta": "Canary status | changed",
                })

            yield {"event": "complete", "data": json.dumps({
                "changes": changes,
                "canary_status": canary_status,
                "extraction_count": len(extraction_results),
            })}

        except Exception as e:
            logger.error("stream-browse fatal error: %s", e)
            yield {"event": "error", "data": json.dumps({"message": str(e)})}

    return EventSourceResponse(event_generator())


class ConsolidateRequest(BaseModel):
    uploaded_files: list[dict] = []
    changes: list[dict] = []
    change_uploads: list[dict] = []


@app.post("/api/consolidate")
async def consolidate(req: ConsolidateRequest):
    """Consolidate all uploaded docs into a filled PDF, streaming reasoning events."""
    from clients.openai_client import chat_json

    async def event_generator():
        # Gather all extracted fields
        all_fields = []
        for uf in req.uploaded_files:
            all_fields.extend(uf.get("fields", []))
        for cu in req.change_uploads:
            all_fields.extend(cu.get("fields", []))

        if not all_fields:
            yield {"event": "progress", "data": json.dumps({"step": "consolidate", "message": "No extracted fields to consolidate."})}
            yield {"event": "complete", "data": json.dumps({"pdf_url": "", "field_count": 0})}
            return

        # Ask OpenAI to reason about field selection
        yield {"event": "progress", "data": json.dumps({"step": "consolidate", "message": "OpenAI reasoning about field values..."})}

        changes_context = json.dumps(req.changes[:10], indent=2) if req.changes else "No changes detected."
        reasoning_prompt = (
            "You are a compliance analyst consolidating form data from multiple documents.\n"
            "For each unique field, decide which value to use based on the documents.\n"
            "Consider: if a change was detected and a revised document uploaded, prefer the revision.\n\n"
            "Return JSON: {\"reasoning\": [{\"field\": str, \"source_doc\": str, \"value\": str, "
            "\"confidence\": \"high\"|\"medium\"|\"low\", \"reason\": str}]}\n\n"
            f"Detected changes:\n{changes_context}\n\n"
            f"All extracted fields:\n{json.dumps(all_fields[:30], indent=2)}"
        )

        try:
            result = await chat_json(
                reasoning_prompt,
                "Consolidate the fields and explain your reasoning for each.",
            )
            reasoning_items = result.get("reasoning", [])
        except Exception as e:
            logger.error("Consolidation reasoning failed: %s", e)
            reasoning_items = [
                {"field": f.get("field_id", "unknown"), "source_doc": "auto", "value": f.get("value", ""),
                 "confidence": "medium", "reason": "Fallback: direct extraction"}
                for f in all_fields[:10]
            ]

        # Stream each reasoning item
        for item in reasoning_items:
            yield {"event": "reasoning", "data": json.dumps(item)}
            await asyncio.sleep(0.3)  # Small delay for visual effect

        # Build field map for PDF filling
        form_fields = [
            {"field_id": item["field"], "value": item["value"], "description": item.get("reason", "")}
            for item in reasoning_items
        ]

        # Fill PDF
        pdf_url = ""
        try:
            filled_path = await fill_pdf(PDF_SRC, form_fields, PDF_DST)
            yield {"event": "progress", "data": json.dumps({"step": "pdf", "message": "PDF filled. Uploading to GitHub..."})}
            pdf_url = await upload_to_github(filled_path)
        except Exception as e:
            logger.error("PDF fill/upload failed: %s", e)
            yield {"event": "progress", "data": json.dumps({"step": "pdf", "message": f"PDF error: {str(e)[:80]}"})}

        yield {"event": "complete", "data": json.dumps({
            "pdf_url": pdf_url,
            "field_count": len(reasoning_items),
        })}

    return EventSourceResponse(event_generator())
