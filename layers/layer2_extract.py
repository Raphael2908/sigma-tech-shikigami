import json
import logging
from dataclasses import dataclass
from datetime import datetime, timezone

from clients.tinyfish import TinyFishClient
from graph import init_db, upsert_node, get_node, save_version, hash_json
from graph.models import Node

logger = logging.getLogger(__name__)

BATCH_SIZE = 100  # TinyFish API limit per batch


@dataclass
class ExtractionResult:
    node: Node
    current_json: dict
    current_hash: str
    status: str        # "unchanged" | "changed" | "error_404" | "error_other"
    prior_hash: str | None


async def parallel_extract(nodes: list[Node], db_path: str | None = None) -> list[ExtractionResult]:
    """Fan out TinyFish across all nodes, hash and triage results.

    Updates DB for every node: content_hash, last_extracted_json, last_extracted_at.
    Calls save_version for every successful extraction.
    """
    if not nodes:
        return []

    await init_db(db_path)
    client = TinyFishClient()

    # Build batch tasks
    tasks = [
        {"url": node.url, "goal": node.extraction_goal or "", "browser_profile": "stealth"}
        for node in nodes
    ]

    # Submit in chunks of BATCH_SIZE
    raw_results = []
    for i in range(0, len(tasks), BATCH_SIZE):
        chunk = tasks[i:i + BATCH_SIZE]
        try:
            chunk_results = await client.run_batch(chunk)
            raw_results.extend(chunk_results)
        except Exception as e:
            logger.error("run_batch failed for chunk %d-%d: %s", i, i + len(chunk), e)
            raw_results.extend([{"error": "failed", "url": t["url"]} for t in chunk])

    # Triage each result
    results = []
    now = datetime.now(timezone.utc).isoformat()

    for node, raw in zip(nodes, raw_results):
        prior_hash = node.content_hash

        if "error" in raw:
            # Error: don't overwrite content_hash or last_extracted_json
            result = ExtractionResult(
                node=node, current_json={}, current_hash="",
                status="error_other", prior_hash=prior_hash,
            )
            # Only update last_extracted_at
            node.last_extracted_at = now
            await upsert_node(node, db_path)
        else:
            current_hash = hash_json(raw)
            json_str = json.dumps(raw, sort_keys=True)

            if prior_hash is None or prior_hash != current_hash:
                status = "changed"
            else:
                status = "unchanged"

            result = ExtractionResult(
                node=node, current_json=raw, current_hash=current_hash,
                status=status, prior_hash=prior_hash,
            )

            # Update node in DB
            node.content_hash = current_hash
            node.last_extracted_json = json_str
            node.last_extracted_at = now
            await upsert_node(node, db_path)

            # Save version history — need node.id
            db_node = await get_node(node.url, db_path)
            if db_node and db_node.id is not None:
                await save_version(db_node.id, current_hash, json_str, db_path)

        results.append(result)

    logger.info(
        "Extraction complete: %d total, %d changed, %d unchanged, %d errors",
        len(results),
        sum(1 for r in results if r.status == "changed"),
        sum(1 for r in results if r.status == "unchanged"),
        sum(1 for r in results if r.status.startswith("error")),
    )
    return results
