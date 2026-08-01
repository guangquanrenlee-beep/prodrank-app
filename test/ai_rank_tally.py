"""Live AI ranking test for Tally Assistant — reuses prodrank's AIQueryService."""
import asyncio, sys, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))

from app.services.ai_query import AIQueryService

KEYWORD = "AI bookkeeping tools for freelancers"
PRODUCT = "Tally Assistant"

async def main():
    svc = AIQueryService()
    prompt = (
        f"Rank the top 8 best {KEYWORD} in 2026. "
        "For each, give: [Rank]. Product Name — one key feature. "
        f"Tell me where {PRODUCT} ranks in this list. "
        "If it's not in the top 8, say so."
    )
    results = await asyncio.gather(
        svc._query_model("chatgpt-proxy", svc.model_chatgpt, prompt),
        svc._query_model("gemini-proxy", svc.model_gemini, prompt),
        svc._query_model("claude-proxy", svc.model_claude, prompt),
        svc._query_model("grok-proxy", svc.model_grok, prompt),
        return_exceptions=True,
    )
    for r in results:
        if isinstance(r, Exception):
            print(f"ERROR: {r}")
            continue
        print("=" * 60)
        print(f"[{r.ai_agent}] rank={r.rank} mentioned={r.total_mentioned} sentiment={r.sentiment}")
        print(r.raw_response[:1200])
        print()

asyncio.run(main())
