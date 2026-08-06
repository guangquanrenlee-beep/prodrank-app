"""
Seed embeddings for all ai_shopping_queries rows (text-embedding-3-small).
Usage: cd backend && python scripts/seed_embeddings.py
"""

import asyncio
import sys

sys.path.insert(0, ".")

from dotenv import load_dotenv

load_dotenv()

from app.services.db import DB
from app.services.match_engine import MatchEngine


async def main():
    db = DB()
    engine = MatchEngine()

    rows = db.client.table("ai_shopping_queries").select("id,query").limit(2000).execute().data or []
    # Only embed rows missing an embedding
    have = db.client.table("ai_shopping_queries").select("id").not_.is_("embedding", None).limit(2000).execute().data or []
    have_ids = {r["id"] for r in have}
    todo = [r for r in rows if r["id"] not in have_ids]
    print(f"Total {len(rows)}, already embedded {len(rows) - len(todo)}, to embed {len(todo)}")

    if not todo:
        print("Nothing to do.")
        return

    texts = [r["query"] for r in todo]
    vecs = await engine.embed_batch(texts)
    print(f"Embedded {len(vecs)} queries")

    for row, vec in zip(todo, vecs):
        try:
            db.client.table("ai_shopping_queries").update({"embedding": vec}).eq("id", row["id"]).execute()
        except Exception as e:
            print(f"  fail {row['id'][:8]}: {str(e)[:60]}")

    print("Done.")


if __name__ == "__main__":
    asyncio.run(main())
