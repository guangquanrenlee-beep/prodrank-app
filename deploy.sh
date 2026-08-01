#!/bin/bash
# ProdRank — 一键部署脚本
# 用法: bash deploy.sh "commit message"
# 效果: commit所有改动 → push GitHub → 自动触发前后端部署

set -e

cd "$(dirname "$0")"

# 检查是否在 git 仓库中
if ! git rev-parse --git-dir > /dev/null 2>&1; then
    echo "❌ 不在 git 仓库中"
    exit 1
fi

# 检查是否有改动
if git diff --quiet && git diff --cached --quiet && [ -z "$(git ls-files --others --exclude-standard)" ]; then
    echo "✅ 工作区干净，无需部署"
    exit 0
fi

MSG="${1:-deploy: $(date '+%Y-%m-%d %H:%M')}"

echo "📦 暂存所有改动..."
git add -A

echo "💬 Commit: $MSG"
git commit -m "$MSG"

echo "🚀 Push to GitHub..."
git push origin main

echo ""
echo "=========================================="
echo "  ✅ 已推送！自动部署进行中："
echo ""
echo "  后端  api.prodrank.app   → VPS cron 自动部署 (~1分钟)"
echo "  前端  prodrank.app       → Cloudflare Pages (~30秒)"
echo "=========================================="
