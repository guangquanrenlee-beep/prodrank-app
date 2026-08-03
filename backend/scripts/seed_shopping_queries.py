"""
Seed AI Shopping Query Engine with ~130 structured shopping queries.
Usage: cd backend && python scripts/seed_shopping_queries.py

Requires: Migration 021 already run in Supabase SQL Editor.
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone
from typing import Any

sys.path.insert(0, ".")

from dotenv import load_dotenv

load_dotenv()

from supabase import create_client
from app.services.llm import get_content_client

# ── All queries organized by category + intent ──

QUERIES: list[dict[str, str]] = [
    # ═══ I. FASHION ═══
    # -- Recommendation --
    {"category": "fashion", "intent": "recommend", "query": "Recommend a men's T-shirt under $100"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend a cotton T-shirt suitable for summer"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend a good-quality oversized T-shirt"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend a jacket suitable for travel"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend a hoodie suitable for autumn"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend women's clothing suitable for commuting"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend a sweater that doesn't pill easily"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend a coat suitable for winter"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend a dress suitable for a date"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend pants suitable for the office"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend workout clothes suitable for fitness"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend jeans for short girls"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend a hoodie for tall guys"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend a skirt for plus-size women"},
    {"category": "fashion", "intent": "recommend", "query": "Recommend an outer jacket suitable for rainy days"},
    # -- Comparison --
    {"category": "fashion", "intent": "compare", "query": "Nike vs Uniqlo – which brand has better T-shirt quality?"},
    {"category": "fashion", "intent": "compare", "query": "Which brand's hoodie is the most durable?"},
    {"category": "fashion", "intent": "compare", "query": "Which brand is best for everyday wear?"},
    {"category": "fashion", "intent": "compare", "query": "Which brand offers the best value for money?"},
    {"category": "fashion", "intent": "compare", "query": "Which brand is best for students?"},
    # -- Scenario --
    {"category": "fashion", "intent": "scenario", "query": "What outerwear should I bring for a trip to Japan?"},
    {"category": "fashion", "intent": "scenario", "query": "What should I wear in Iceland?"},
    {"category": "fashion", "intent": "scenario", "query": "What should I wear to Disneyland in summer?"},
    {"category": "fashion", "intent": "scenario", "query": "What should I wear for a business trip?"},
    {"category": "fashion", "intent": "scenario", "query": "What is the most comfortable outfit to wear on a plane?"},
    # -- Attribute --
    {"category": "fashion", "intent": "attribute", "query": "Which T-shirt is the most breathable?"},
    {"category": "fashion", "intent": "attribute", "query": "Which jacket is the most waterproof?"},
    {"category": "fashion", "intent": "attribute", "query": "Which down jacket is the lightest?"},
    {"category": "fashion", "intent": "attribute", "query": "Which clothing item doesn't pill?"},
    {"category": "fashion", "intent": "attribute", "query": "Which is the easiest to clean?"},
    {"category": "fashion", "intent": "attribute", "query": "Which is the most durable?"},
    # -- Audience --
    {"category": "fashion", "intent": "audience", "query": "Jacket for a 40-year-old man"},
    {"category": "fashion", "intent": "audience", "query": "T-shirt for college students"},
    {"category": "fashion", "intent": "audience", "query": "Dress for pregnant women"},
    {"category": "fashion", "intent": "audience", "query": "Jeans for plus-size women"},
    {"category": "fashion", "intent": "audience", "query": "Shorts for running"},

    # ═══ II. ELECTRONICS ═══
    # -- Recommendation --
    {"category": "electronics", "intent": "recommend", "query": "Recommend a laptop under $500"},
    {"category": "electronics", "intent": "recommend", "query": "Recommend the best wireless earbuds"},
    {"category": "electronics", "intent": "recommend", "query": "Recommend a tablet for students"},
    {"category": "electronics", "intent": "recommend", "query": "Recommend the best gaming mouse"},
    {"category": "electronics", "intent": "recommend", "query": "Recommend the best mechanical keyboard"},
    {"category": "electronics", "intent": "recommend", "query": "Recommend the best camera for video shooting"},
    {"category": "electronics", "intent": "recommend", "query": "Recommend a phone with the longest battery life"},
    {"category": "electronics", "intent": "recommend", "query": "Recommend a computer with AI features"},
    {"category": "electronics", "intent": "recommend", "query": "Recommend the best monitor for office work"},
    {"category": "electronics", "intent": "recommend", "query": "Recommend the most worthwhile smartwatch"},
    # -- Comparison --
    {"category": "electronics", "intent": "compare", "query": "MacBook or Surface – which is better for office work?"},
    {"category": "electronics", "intent": "compare", "query": "iPhone or Samsung – which is more worth buying?"},
    {"category": "electronics", "intent": "compare", "query": "Sony or Bose – which headphones are better?"},
    {"category": "electronics", "intent": "compare", "query": "Which brand has the best after-sales service?"},
    {"category": "electronics", "intent": "compare", "query": "Which is the most durable?"},
    # -- Scenario --
    {"category": "electronics", "intent": "scenario", "query": "Computer suitable for remote work"},
    {"category": "electronics", "intent": "scenario", "query": "Best camera for travel"},
    {"category": "electronics", "intent": "scenario", "query": "Best laptop for video editing"},
    {"category": "electronics", "intent": "scenario", "query": "Best computer for students"},
    {"category": "electronics", "intent": "scenario", "query": "Best headphones for game streaming"},

    # ═══ III. BEAUTY ═══
    # -- Recommendation --
    {"category": "beauty", "intent": "recommend", "query": "Recommend a face cream for sensitive skin"},
    {"category": "beauty", "intent": "recommend", "query": "Recommend the best sunscreen"},
    {"category": "beauty", "intent": "recommend", "query": "Recommend a facial cleanser for oily skin"},
    {"category": "beauty", "intent": "recommend", "query": "Recommend a serum for dry skin"},
    {"category": "beauty", "intent": "recommend", "query": "Recommend the best-smelling perfume"},
    {"category": "beauty", "intent": "recommend", "query": "Recommend the best anti-aging serum"},
    {"category": "beauty", "intent": "recommend", "query": "Recommend skincare products for men"},
    {"category": "beauty", "intent": "recommend", "query": "Recommend skincare products suitable for pregnant women"},
    # -- Comparison --
    {"category": "beauty", "intent": "compare", "query": "CeraVe or La Roche-Posay – which is better?"},
    {"category": "beauty", "intent": "compare", "query": "Which brand is best for sensitive skin?"},
    {"category": "beauty", "intent": "compare", "query": "Which sunscreen is the best?"},
    {"category": "beauty", "intent": "compare", "query": "Which is the most worth buying?"},
    # -- Scenario --
    {"category": "beauty", "intent": "scenario", "query": "What skincare should I use in summer?"},
    {"category": "beauty", "intent": "scenario", "query": "What sunscreen should I bring to the beach?"},
    {"category": "beauty", "intent": "scenario", "query": "What moisturizer works best in winter?"},
    {"category": "beauty", "intent": "scenario", "query": "What skincare should I use after staying up late?"},

    # ═══ IV. HOME ═══
    # -- Recommendation --
    {"category": "home", "intent": "recommend", "query": "Recommend the best office chair"},
    {"category": "home", "intent": "recommend", "query": "Recommend the most comfortable mattress"},
    {"category": "home", "intent": "recommend", "query": "Recommend a sofa suitable for small apartments"},
    {"category": "home", "intent": "recommend", "query": "Recommend the best air fryer"},
    {"category": "home", "intent": "recommend", "query": "Recommend the quietest air purifier"},
    {"category": "home", "intent": "recommend", "query": "Recommend the most energy-efficient washing machine"},
    {"category": "home", "intent": "recommend", "query": "Recommend furniture suitable for rental apartments"},
    {"category": "home", "intent": "recommend", "query": "Recommend the most worthwhile coffee machine"},
    # -- Scenario --
    {"category": "home", "intent": "scenario", "query": "What furniture should I buy for a new home renovation?"},
    {"category": "home", "intent": "scenario", "query": "How to choose a dining table for a small apartment?"},
    {"category": "home", "intent": "scenario", "query": "What sofa should I buy if I have pets at home?"},
    {"category": "home", "intent": "scenario", "query": "What carpet should I buy if I have kids at home?"},

    # ═══ V. FOOD ═══
    # -- Recommendation --
    {"category": "food", "intent": "recommend", "query": "Recommend the healthiest snacks"},
    {"category": "food", "intent": "recommend", "query": "Recommend the best coffee beans"},
    {"category": "food", "intent": "recommend", "query": "Recommend high-protein snacks"},
    {"category": "food", "intent": "recommend", "query": "Recommend low-sugar snacks"},
    {"category": "food", "intent": "recommend", "query": "Recommend foods suitable for weight loss"},
    {"category": "food", "intent": "recommend", "query": "Recommend protein powder for fitness"},
    {"category": "food", "intent": "recommend", "query": "Recommend the best olive oil"},
    {"category": "food", "intent": "recommend", "query": "Recommend snacks suitable for kids"},
    # -- Scenario --
    {"category": "food", "intent": "scenario", "query": "What should I eat during weight loss?"},
    {"category": "food", "intent": "scenario", "query": "What is the healthiest breakfast?"},
    {"category": "food", "intent": "scenario", "query": "What snacks should I bring for a long drive?"},
    {"category": "food", "intent": "scenario", "query": "What food should I bring for hiking?"},

    # ═══ VI. SPORTS ═══
    # -- Recommendation --
    {"category": "sports", "intent": "recommend", "query": "Recommend the best running shoes"},
    {"category": "sports", "intent": "recommend", "query": "Recommend the best hiking shoes"},
    {"category": "sports", "intent": "recommend", "query": "Recommend the best equipment for fitness beginners"},
    {"category": "sports", "intent": "recommend", "query": "Recommend the best yoga mat"},
    {"category": "sports", "intent": "recommend", "query": "Recommend a tent suitable for camping"},
    {"category": "sports", "intent": "recommend", "query": "Recommend the best cycling helmet"},
    {"category": "sports", "intent": "recommend", "query": "Recommend the best hiking jacket"},
    {"category": "sports", "intent": "recommend", "query": "Recommend a backpack suitable for hiking"},
    # -- Scenario --
    {"category": "sports", "intent": "scenario", "query": "What gear should I bring for hiking in Alaska?"},
    {"category": "sports", "intent": "scenario", "query": "What do I need to buy for marathon training?"},
    {"category": "sports", "intent": "scenario", "query": "What do I need to prepare for beginner camping?"},
    {"category": "sports", "intent": "scenario", "query": "What shoes should I wear for running in the rain?"},

    # ═══ VII. PET ═══
    {"category": "pet", "intent": "recommend", "query": "Recommend the best dog food"},
    {"category": "pet", "intent": "recommend", "query": "Recommend dog food for senior dogs"},
    {"category": "pet", "intent": "recommend", "query": "Recommend cat litter for cats"},
    {"category": "pet", "intent": "recommend", "query": "Recommend an automatic feeder"},
    {"category": "pet", "intent": "recommend", "query": "Recommend a pet water fountain"},
    {"category": "pet", "intent": "recommend", "query": "Recommend a dog bed for large breeds"},
    {"category": "pet", "intent": "recommend", "query": "Recommend a pet brush that doesn't shed hair"},
    {"category": "pet", "intent": "recommend", "query": "Recommend the best pet toys"},

    # ═══ VIII. JEWELRY ═══
    {"category": "jewelry", "intent": "recommend", "query": "Recommend a necklace for a girlfriend"},
    {"category": "jewelry", "intent": "recommend", "query": "Recommend a wedding ring"},
    {"category": "jewelry", "intent": "recommend", "query": "Recommend a birthday gift"},
    {"category": "jewelry", "intent": "recommend", "query": "Recommend affordable luxury earrings"},
    {"category": "jewelry", "intent": "recommend", "query": "Recommend a bracelet for daily wear"},
    {"category": "jewelry", "intent": "recommend", "query": "Recommend jewelry suitable for mothers"},
    {"category": "jewelry", "intent": "recommend", "query": "Recommend a necklace under $100"},
    {"category": "jewelry", "intent": "recommend", "query": "Recommend accessories suitable for daily commuting"},

    # ═══ IX. BABY ═══
    {"category": "baby", "intent": "recommend", "query": "Recommend a baby stroller"},
    {"category": "baby", "intent": "recommend", "query": "Recommend a child car seat"},
    {"category": "baby", "intent": "recommend", "query": "Recommend a baby bottle"},
    {"category": "baby", "intent": "recommend", "query": "Recommend a baby high chair"},
    {"category": "baby", "intent": "recommend", "query": "Recommend a baby monitor"},
    {"category": "baby", "intent": "recommend", "query": "Recommend a gift for a newborn"},
    {"category": "baby", "intent": "recommend", "query": "Recommend the best diapers"},
    {"category": "baby", "intent": "recommend", "query": "Recommend the best baby wipes"},

    # ═══ X. AUTO ═══
    {"category": "auto", "intent": "recommend", "query": "Recommend the best dashcam"},
    {"category": "auto", "intent": "recommend", "query": "Recommend a car phone mount"},
    {"category": "auto", "intent": "recommend", "query": "Recommend a car vacuum cleaner"},
    {"category": "auto", "intent": "recommend", "query": "Recommend a roof box suitable for camping"},
    {"category": "auto", "intent": "recommend", "query": "Recommend a car charger"},
    {"category": "auto", "intent": "recommend", "query": "Recommend a car emergency power supply"},
    {"category": "auto", "intent": "recommend", "query": "Recommend floor mats for SUVs"},
    {"category": "auto", "intent": "recommend", "query": "Recommend the best car air freshener"},

    # ═══ XI. NATURAL LANGUAGE (mapped to best-fit category) ═══
    {"category": "fashion", "intent": "recommend", "query": "I have a budget of $100. Recommend a T-shirt suitable for summer travel."},
    {"category": "fashion", "intent": "recommend", "query": "I want to buy a high-quality jacket that can last over three years."},
    {"category": "sports", "intent": "recommend", "query": "I don't care about the brand – I just want the best value running shoes."},
    {"category": "sports", "intent": "attribute", "query": "I sweat easily. Recommend a breathable sports top."},
    {"category": "beauty", "intent": "recommend", "query": "I have sensitive skin. Recommend a fragrance-free moisturizer."},
    {"category": "home", "intent": "recommend", "query": "I sit for 10 hours a day. Recommend a truly comfortable office chair."},
    {"category": "sports", "intent": "scenario", "query": "I travel frequently. Recommend a lightweight yet durable backpack."},
    {"category": "jewelry", "intent": "scenario", "query": "I want to buy a birthday gift for my girlfriend. Budget is $150. Any recommendations?"},
    {"category": "sports", "intent": "scenario", "query": "I want to start camping. What equipment do I need to buy?"},
    {"category": "fashion", "intent": "compare", "query": "If I could only choose one brand, which one would you recommend the most? And why?"},
]

CATEGORY_MAP = {
    "fashion": "Fashion & Apparel",
    "electronics": "Electronics",
    "beauty": "Beauty & Skincare",
    "home": "Home & Furniture",
    "food": "Food & Grocery",
    "sports": "Sports & Outdoors",
    "pet": "Pet Supplies",
    "jewelry": "Jewelry & Accessories",
    "baby": "Baby & Maternity",
    "auto": "Automotive",
}

EXTRACTION_PROMPT = """Analyze each AI shopping query below. For every query, extract structured metadata.
Return ONLY valid JSON — a JSON array of objects, one per query, with these keys:

- price_range: null or one of "0-25", "25-50", "50-100", "100-500", "500-1000", "1000+"
- occasion: null or one of "daily", "travel", "office", "date", "gym", "beach", "party", "outdoor", "commuting"
- audience: null or one of "men", "women", "unisex", "kids", "students", "plus-size", "seniors", "pregnant"
- attributes: array of strings — key product attributes mentioned (e.g. ["cotton","oversized","breathable","waterproof"]). Max 5.
- season: null or one of "spring", "summer", "autumn", "winter", "all"
- difficulty: "easy" | "medium" | "hard" — how difficult this query is for a brand to rank for, based on specificity and competition level

Rules:
- Only extract what is EXPLICITLY stated or strongly implied by the query. Do not guess.
- If the query doesn't mention price, price_range is null.
- If no specific audience is mentioned, audience is null.
- For comparison queries, difficulty is usually "hard".
- For broad recommendation queries without modifiers, difficulty is usually "hard".
- For specific niche queries with clear constraints, difficulty is usually "easy".

Queries to analyze:
{queries_json}

Return JSON array: [{{"price_range":..., "occasion":..., "audience":..., "attributes":..., "season":..., "difficulty":...}}, ...]"""


async def enrich_queries(queries: list[dict]) -> list[dict]:
    """Use DeepSeek to extract structured metadata for all queries in one batch."""
    client, model = get_content_client()

    # Build a numbered list for the prompt
    queries_json = json.dumps(
        [{"id": i, "query": q["query"], "category": q["category"], "intent": q["intent"]}
         for i, q in enumerate(queries)],
        indent=2,
    )

    response = await client.chat.completions.create(
        model=model,
        temperature=0.1,
        messages=[
            {"role": "system", "content": "You are a structured data extractor. Return only valid JSON, no commentary."},
            {"role": "user", "content": EXTRACTION_PROMPT.format(queries_json=queries_json)},
        ],
    )

    raw = response.choices[0].message.content.strip()
    # Strip markdown fences if present
    if raw.startswith("```"):
        raw = raw.split("\n", 1)[1]
        if raw.endswith("```"):
            raw = raw[:-3].strip()
        elif raw.endswith("```\n"):
            raw = raw[:-4].strip()

    try:
        enriched = json.loads(raw)
    except json.JSONDecodeError:
        print(f"Failed to parse DeepSeek response. Raw (first 500 chars):\n{raw[:500]}")
        raise

    if len(enriched) != len(queries):
        print(f"WARNING: got {len(enriched)} results for {len(queries)} queries — length mismatch, best-effort merge")

    # Merge extracted fields back into original queries
    for i, q in enumerate(queries):
        ext = enriched[i] if i < len(enriched) else {}
        q["price_range"] = ext.get("price_range")
        q["occasion"] = ext.get("occasion")
        q["audience"] = ext.get("audience")
        q["attributes"] = ext.get("attributes", [])
        q["season"] = ext.get("season")
        q["difficulty"] = ext.get("difficulty", "medium")
        q["language"] = "en"
        q["country"] = "us"
        q["source"] = "manual"

    return queries


def insert_to_db(queries: list[dict]) -> int:
    """Insert enriched queries into ai_shopping_queries via Supabase REST API."""
    url = os.getenv("SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_KEY")
    client = create_client(url, key)

    inserted = 0
    skipped = 0
    now = datetime.now(timezone.utc).isoformat()

    for q in queries:
        row = {
            "category": q["category"],
            "query": q["query"],
            "intent": q["intent"],
            "price_range": q.get("price_range"),
            "occasion": q.get("occasion"),
            "audience": q.get("audience"),
            "attributes": json.dumps(q.get("attributes", [])),
            "season": q.get("season"),
            "language": q.get("language", "en"),
            "country": q.get("country", "us"),
            "difficulty": q.get("difficulty", "medium"),
            "frequency": 0,
            "source": "manual",
            "created_at": now,
            "updated_at": now,
        }
        try:
            # Upsert on (category, query) unique constraint
            result = client.table("ai_shopping_queries").upsert(
                row, on_conflict="category,query"
            ).execute()
            inserted += 1
        except Exception as e:
            # Table might not exist yet
            if "does not exist" in str(e) or "PGRST205" in str(e):
                print(f"\nERROR: Table ai_shopping_queries doesn't exist yet.")
                print("Run migration 021 in Supabase SQL Editor first:")
                print("  database/migrations/021_ai_shopping_queries.sql")
                return 0
            print(f"  SKIP: {q['query'][:60]}... — {e}")
            skipped += 1

    print(f"\nInserted: {inserted}, Skipped: {skipped}")
    return inserted


async def main():
    print(f"Total queries defined: {len(QUERIES)}")

    # Show category distribution
    from collections import Counter
    cats = Counter(q["category"] for q in QUERIES)
    intents = Counter(q["intent"] for q in QUERIES)
    print(f"Categories: {dict(cats)}")
    print(f"Intents: {dict(intents)}")

    # Step 1: Enrich with DeepSeek
    print("\n--- Step 1: Enriching with DeepSeek ---")
    try:
        enriched = await enrich_queries(QUERIES)
        print(f"Enriched {len(enriched)} queries")
    except Exception as e:
        print(f"DeepSeek enrichment failed: {e}")
        print("Continuing with basic fields only...")
        enriched = QUERIES
        for q in enriched:
            q.setdefault("price_range")
            q.setdefault("occasion")
            q.setdefault("audience")
            q.setdefault("attributes", [])
            q.setdefault("season")
            q.setdefault("difficulty", "medium")
            q.setdefault("language", "en")
            q.setdefault("country", "us")
            q.setdefault("source", "manual")

    # Save enriched data to JSON (backup)
    out_path = "scripts/ai_shopping_queries_enriched.json"
    with open(out_path, "w", encoding="utf-8") as f:
        json.dump(enriched, f, ensure_ascii=False, indent=2)
    print(f"Saved enriched data to {out_path}")

    # Show a few examples
    print("\n--- Sample enriched queries ---")
    for q in enriched[:5]:
        print(f"  [{q['category']}] {q['query'][:70]}")
        print(f"    intent={q['intent']} price={q.get('price_range')} occasion={q.get('occasion')} "
              f"audience={q.get('audience')} season={q.get('season')} "
              f"attrs={q.get('attributes')} difficulty={q.get('difficulty')}")

    # Step 2: Insert into database
    print("\n--- Step 2: Inserting into database ---")
    count = insert_to_db(enriched)

    if count > 0:
        print(f"\nDone! {count} queries inserted into ai_shopping_queries.")
    else:
        print("\nInsertion skipped. Run migration 021 first, then re-run this script.")


if __name__ == "__main__":
    asyncio.run(main())
