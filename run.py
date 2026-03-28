import asyncio
import json
import logging
import pathlib
import sys

from graph import init_db, get_meta, get_nodes_by_form_fields
from layers.layer0_seed import seed_graph
from layers.layer1_canary import check_canary
from layers.layer2_extract import parallel_extract
from layers.layer3_diff import semantic_diff
from layers.layer4_form import fill_form

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(name)s %(levelname)s %(message)s",
)
logger = logging.getLogger(__name__)


async def run_compliance(form_path: str) -> dict:
    """Run the full compliance pipeline: seed → canary → extract → diff → fill."""
    form = json.loads(pathlib.Path(form_path).read_text())
    form_id = form["form_id"]

    await init_db()

    # Seed if first run
    if not await get_meta(f"seeded:{form_id}"):
        logger.info("First run for form %s — seeding graph", form_id)
        await seed_graph(form_path)
    else:
        logger.info("Graph already seeded for form %s", form_id)

    # Canary check
    canary = await check_canary()
    logger.info("Canary result: %s", canary["status"])

    # Get relevant nodes
    field_ids = [f["field_id"] for f in form["fields"]]
    nodes = await get_nodes_by_form_fields(field_ids)
    logger.info("Found %d nodes for %d form fields", len(nodes), len(field_ids))

    if not nodes:
        logger.warning("No nodes found — form output will be empty")

    # Parallel extraction
    extraction_results = await parallel_extract(nodes)

    # Semantic diff on changed nodes
    changed = [r for r in extraction_results if r.status == "changed"]
    diff_results = await semantic_diff(changed) if changed else []

    # Form fill
    output = fill_form(form, extraction_results, diff_results)

    print(json.dumps(output, indent=2))
    return output


if __name__ == "__main__":
    form_path = sys.argv[1] if len(sys.argv) > 1 else "sample_form.json"
    asyncio.run(run_compliance(form_path))
