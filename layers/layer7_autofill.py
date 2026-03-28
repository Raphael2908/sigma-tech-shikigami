import logging

from clients.tinyfish import TinyFishClient

logger = logging.getLogger(__name__)

AUTOFILL_GOAL_TEMPLATE = """\
You are an automation agent completing a full BizFile+ general lodgement submission.

Complete the following steps in order:

--- STEP 1: Landing page (index.html) ---
1. On the BizFile+ homepage, find and click the "General Lodgement" link in the \
Popular services section under "Register". It is an orange-coloured link with an arrow.

--- STEP 2: Intermediary page (intermediary.html) ---
2. Scroll down to the dropdown labelled "Please select general lodgement type to proceed".
3. In the dropdown, select "Update registered qualified individual information" \
(it is under the "Approved liquidator" category).
4. Click the "Retrieve information" button (it will become active after selecting).

--- STEP 3: Form page (form.html) ---
5. In the "Email address" field, type: {email}
6. In the "Description of lodgement" textarea, type exactly: {description}
7. In the "Date of document" field, clear any existing value and type: {date}
8. For the "Attach form" upload zone, download the PDF from this URL: {pdf_url}
   Then upload it using the file input in the attach form section.
9. Click the "Review and confirm" button.

--- STEP 4: Review page (review.html) ---
10. Verify that the review page shows the information you entered.
11. Tick the declaration checkbox (the checkbox next to "I, Lim Ming-Yang, Raphael, declare that:").
12. Click the "Submit" button.

IMPORTANT:
- Wait for each page to fully load before interacting with it.
- The description field has a 200 character limit — do not exceed it.
- Wait for each field to be filled before moving to the next.
- You must tick the declaration checkbox before clicking Submit, otherwise submission will fail.
- The final success page will show a reference number — that confirms the submission is complete.
"""


def build_autofill_goal(
    form_output: dict,
    pdf_url: str,
    email: str = "jerometeoh@gmail.com",
    date: str = "28 Mar 2026",
) -> str:
    """Construct a concrete TinyFish goal from pipeline output.

    Args:
        form_output: The full output dict from fill_form() (layer4).
        pdf_url: GitHub raw URL for the filled PDF.
        email: Email address to fill in the form.
        date: Date of document value.

    Returns:
        A natural-language goal string for TinyFish.
    """
    # Extract lodgement description from the form output
    description = ""
    for field in form_output.get("fields", []):
        if field["field_id"] == "lodgement_description" and field.get("value"):
            value = field["value"]
            description = value if isinstance(value, str) else str(value)
            break

    if not description:
        description = "Withdrawal from Being Approved Liquidators"

    # Truncate to 200 chars for the BizFile+ field limit
    description = description[:200]

    goal = AUTOFILL_GOAL_TEMPLATE.format(
        email=email,
        description=description,
        date=date,
        pdf_url=pdf_url,
    )

    logger.info("Built autofill goal (%d chars)", len(goal))
    return goal


async def run_autofill(form_url: str, form_output: dict, pdf_url: str) -> dict:
    """Run the TinyFish agent to fill the mock BizFile+ portal.

    Args:
        form_url: URL of the locally-served form.html (e.g. http://localhost:8080/form.html).
        form_output: The full output dict from fill_form() (layer4).
        pdf_url: GitHub raw URL for the filled PDF.

    Returns:
        TinyFish result dict.
    """
    goal = build_autofill_goal(form_output, pdf_url)
    client = TinyFishClient()
    result = await client.run_single(url=form_url, goal=goal, browser_profile="stealth")

    if result.get("error"):
        logger.error("TinyFish autofill failed: %s", result)
    else:
        logger.info("TinyFish autofill completed successfully")

    return result
