"""
Email Service — Resend integration for weekly reports and alerts.
Resend SDK: pip install resend
"""

import os
from datetime import datetime, timezone
from typing import Any


class EmailService:
    """Send transactional emails via Resend."""

    def __init__(self, api_key: str = ""):
        self.api_key = api_key or os.getenv("RESEND_API_KEY", "")
        self.from_email = "ProdRank <hello@prodrank.app>"

    async def _send(self, to: str, subject: str, html: str) -> bool:
        """Send an email via Resend REST API."""
        if not self.api_key:
            print("[Email] RESEND_API_KEY not set — skipping")
            return False

        import httpx
        try:
            resp = httpx.post(
                "https://api.resend.com/emails",
                headers={
                    "Authorization": f"Bearer {self.api_key}",
                    "Content-Type": "application/json",
                },
                json={
                    "from": self.from_email,
                    "to": [to],
                    "subject": subject,
                    "html": html,
                },
                timeout=15,
            )
            if resp.status_code in (200, 201):
                print(f"[Email] Sent '{subject}' to {to}")
                return True
            print(f"[Email] Failed: {resp.status_code} {resp.text[:200]}")
            return False
        except Exception as e:
            print(f"[Email] Error: {e}")
            return False

    async def send_weekly_report(
        self,
        to: str,
        domain: str,
        current_score: int,
        previous_score: int | None,
        breakdown: dict,
        alerts: list[str],
        competitors: list[dict] | None = None,
    ) -> bool:
        """Generate and send the weekly AI Visibility report."""
        change = current_score - previous_score if previous_score else 0
        trend_icon = "▲" if change > 0 else "▼" if change < 0 else "—"
        trend_color = "#10b981" if change >= 0 else "#ef4444"

        # Build dimension rows
        dims_html = ""
        if breakdown:
            for key, val in breakdown.items():
                s = val.get("score", 0) if isinstance(val, dict) else val
                color = "#10b981" if s >= 70 else "#f59e0b" if s >= 40 else "#ef4444"
                dims_html += f"""
                <tr>
                    <td style="padding:8px 12px;border-bottom:1px solid #27272a;text-transform:capitalize">{key.replace('_',' ')}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #27272a;text-align:right">
                        <span style="display:inline-block;width:{max(s,5)}px;height:8px;background:{color};border-radius:4px;vertical-align:middle;margin-right:8px"></span>
                        <strong style="color:{color}">{s}</strong><span style="color:#71717a">/100</span>
                    </td>
                </tr>"""

        # Competitor table
        comp_html = ""
        if competitors:
            comp_html = """
            <h2 style="font-size:18px;margin:30px 0 12px;color:#e4e4e7">⚔️ Competitor Watch</h2>
            <table style="width:100%;border-collapse:collapse">
                <tr style="background:#18181b;color:#a1a1aa;font-size:13px">
                    <th style="text-align:left;padding:8px 12px">Site</th>
                    <th style="text-align:center;padding:8px 12px">Score</th>
                    <th style="text-align:center;padding:8px 12px">Schema</th>
                </tr>"""
            for c in competitors[:5]:
                score = c.get("estimated_score", 0)
                sc = "#10b981" if score >= 70 else "#f59e0b" if score >= 40 else "#ef4444"
                comp_html += f"""
                <tr>
                    <td style="padding:8px 12px;border-bottom:1px solid #27272a">{c.get('name','?')}<br><span style="font-size:12px;color:#71717a">{c.get('domain','')}</span></td>
                    <td style="padding:8px 12px;border-bottom:1px solid #27272a;text-align:center;font-weight:bold;color:{sc}">{score}</td>
                    <td style="padding:8px 12px;border-bottom:1px solid #27272a;text-align:center">{'✅' if c.get('has_software_schema') else '❌'}</td>
                </tr>"""
            comp_html += "</table>"

        # Alerts
        alerts_html = ""
        if alerts:
            alerts_html = '<div style="margin:20px 0;padding:16px;background:#450a0a;border:1px solid #7f1d1d;border-radius:8px">'
            alerts_html += '<h3 style="margin:0 0 8px;color:#fca5a5;font-size:15px">⚠️ Alerts</h3>'
            for a in alerts:
                alerts_html += f'<p style="margin:4px 0;color:#fecaca;font-size:14px">• {a}</p>'
            alerts_html += '</div>'

        html = f"""<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="background:#09090b;color:#d4d4d8;font-family:-apple-system,BlinkMacSystemFont,sans-serif;padding:30px;max-width:600px;margin:0 auto">

    <div style="text-align:center;padding:30px 0">
        <h1 style="color:#10b981;margin:0;font-size:28px">ProdRank</h1>
        <p style="color:#71717a;font-size:14px">Weekly AI Visibility Report — {datetime.now().strftime('%B %d, %Y')}</p>
    </div>

    <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:30px;margin-bottom:20px;text-align:center">
        <p style="color:#a1a1aa;font-size:13px;margin:0 0 8px">{domain}</p>
        <div style="font-size:64px;font-weight:800;color:{trend_color};line-height:1">{current_score}</div>
        <div style="font-size:16px;color:{trend_color};margin-top:4px">{trend_icon} {abs(change)} from last report</div>
    </div>

    <div style="background:#18181b;border:1px solid #27272a;border-radius:12px;padding:24px">
        <h2 style="font-size:18px;margin:0 0 16px;color:#e4e4e7">📊 Score Breakdown</h2>
        <table style="width:100%;border-collapse:collapse">
            {dims_html}
        </table>
    </div>

    {comp_html}
    {alerts_html}

    <div style="margin:30px 0;padding:20px;background:#022c22;border:1px solid #065f46;border-radius:12px">
        <h3 style="margin:0 0 8px;color:#34d399">💡 This Week's Top Action</h3>
        <p style="color:#a7f3d0;font-size:14px;margin:0">Run an Analyze scan from your dashboard to refresh your score and compare against competitors. Small Schema fixes can add 10+ points in a week.</p>
        <a href="https://prodrank.app/dashboard" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#10b981;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Open Dashboard →</a>
    </div>

    <p style="color:#52525b;font-size:12px;text-align:center;margin-top:30px">
        You're receiving this because you enabled weekly reports in your ProdRank settings.<br>
        <a href="https://prodrank.app/settings" style="color:#71717a">Manage email preferences</a>
    </p>

</body></html>"""

        return await self._send(to, f"[ProdRank] Weekly Report: {domain} — {current_score} pts {trend_icon}", html)

    async def send_score_drop_alert(
        self, to: str, domain: str, current_score: int, previous_score: int, drop_by: int
    ) -> bool:
        """Alert when score drops significantly."""
        html = f"""<!DOCTYPE html>
<html><body style="background:#09090b;color:#d4d4d8;font-family:-apple-system,sans-serif;padding:30px;max-width:500px;margin:0 auto">
    <div style="background:#450a0a;border:1px solid #7f1d1d;border-radius:12px;padding:24px">
        <h2 style="color:#fca5a5;margin:0 0 8px">⚠️ Score Drop Alert</h2>
        <p style="color:#fecaca;font-size:15px"><strong>{domain}</strong> dropped from <strong>{previous_score}</strong> to <strong>{current_score}</strong> (▼{drop_by} pts)</p>
        <p style="color:#fca5a5;font-size:13px">This could be due to a competitor improving or changes in AI training data. We recommend running a fresh scan to identify the cause.</p>
        <a href="https://prodrank.app/dashboard" style="display:inline-block;margin-top:12px;padding:10px 24px;background:#ef4444;color:#fff;text-decoration:none;border-radius:8px;font-weight:600">Check Dashboard →</a>
    </div>
</body></html>"""
        return await self._send(to, f"⚠️ {domain} AI score dropped {drop_by} pts", html)


# Singleton
email_service = EmailService()
