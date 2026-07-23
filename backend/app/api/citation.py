"""Citation Intelligence API — Source influence, citation chains, category reports."""

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.services.citation_intel import CitationEngine

router = APIRouter()
engine = CitationEngine()


class InfluenceRequest(BaseModel):
    category: str = ""


class ChainRequest(BaseModel):
    url: str
    depth: int = 2


class ReportRequest(BaseModel):
    category: str
    keywords: list[str] = []


@router.get("/influence")
async def source_influence(category: str = ""):
    """Get source influence scores for a category (or all if empty)."""
    try:
        results = engine.get_source_influence(category)
        return {
            "category": category or "all",
            "total_sources": len(results),
            "sources": [
                {
                    "domain": r.domain,
                    "influence_score": r.influence_score,
                    "total_citations": r.total_citations,
                    "chatgpt_citations": r.chatgpt_citations,
                    "gemini_citations": r.gemini_citations,
                    "claude_citations": r.claude_citations,
                    "grok_citations": r.grok_citations,
                }
                for r in results[:20]
            ],
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/chain")
async def citation_chain(req: ChainRequest):
    """Trace multi-hop citation chain for a URL."""
    try:
        chain = await engine.trace_citation_chain(req.url, req.depth)
        return {
            "source_url": chain.source_url,
            "source_domain": chain.source_domain,
            "depth": chain.depth,
            "upstream": chain.upstream,
            "downstream": chain.downstream,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/report")
async def category_report(req: ReportRequest):
    """Generate full citation report for a category across all AI agents."""
    try:
        report = await engine.category_report(req.category, req.keywords)
        return {
            "category": report.category,
            "keyword": report.keyword,
            "total_citations": len(report.sources),
            "top_domains": [
                {"domain": d, "citations": c}
                for d, c in report.top_domains
            ],
            "sources": report.sources,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
