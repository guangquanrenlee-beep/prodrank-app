# ProdRank 开发交接文档（2026-08-03）

> 新窗口开发前先读 `CLAUDE.md`（自动加载）+ 本文件（完整信息）。

## 1. 项目定位

AI Agent Commerce SEO（GEO）SaaS——优化商品在 ChatGPT/Gemini/Claude/Grok 推荐中的可见性。商家通过 Shopify App / WordPress 插件接入，SaaS 侧生成 GEO 内容、注入 Schema、追踪 AI 推荐与引用。

## 2. 架构

```
浏览器 → prodrank.app（Cloudflare Pages，Next.js 16 静态导出）
        → api.prodrank.app（Cloudflare 代理 → VPS Docker nginx → FastAPI :8000）
数据库：Supabase（PostgreSQL，service key 直连，无 ORM）
AI：DeepSeek 官方 API（内容生成主力）+ ofox 聚合 API（真问 ChatGPT/Gemini 模拟，不稳定→有熔断）
商家端：WordPress 插件（PHP，post meta 存储）+ Shopify App（OAuth + Admin API）
```

## 3. 本地跑起来

```bash
# 后端（backend/，.env 有 Supabase/DEEPSEEK/OPENAI key）
cd backend && python -m uvicorn app.main:app --port 8000

# 前端
cd frontend && npm run dev        # :3000，fetch 拦截自动指向 localhost:8000

# WordPress 测试站（50 商品，admin/admin）
cd test/wp-docker && docker compose up -d   # :8081
# 连接：localhost:3000/settings → 域名 http://localhost:8081/ + token zJvfecPRrrVnO9AZHpvP5vZ51g9gq63k
```

## 4. 部署（全自动，push 即部署）

- 后端：git push → VPS cron（每分钟 git pull && docker compose up -d --build）
- 前端：git push → Cloudflare Pages Git 集成
- 本地 .env 不入 git（VPS 有独立 .env）

## 5. 目录结构

- `backend/app/api/` — FastAPI 路由（28 个模块）
- `backend/app/services/` — 业务逻辑（llm.py 统一 LLM 工厂；usage.py 配额；health_check/competitor_watch/citation_watch/regression_monitor/insights/weekly_report 自动任务）
- `backend/app/services/knowledge_templates.py` — 11 品类 × 子品类四层模板（Identity/Knowledge/Decision/Trust）
- `backend/app/services/shopify_ai.py` — 生成核心（detect_category → generate_fields）
- `frontend/src/app/` — 页面（studio=AI Optimization 核心页；dashboard；products；monitoring；health；competitors；cite；knowledge-coverage；settings）
- `wordpress-plugin/` — WP 插件（includes/class-prodrank-*.php；zip 在根 + frontend/public/downloads/）
- `database/migrations/` — SQL（改表后需在 Supabase SQL Editor 手动跑）
- `test/` — mock_shopify.py（:8443）、测试脚本、截图脚本

## 6. 核心功能（全部已实现并部署）

| 功能 | 位置 | 说明 |
|---|---|---|
| AI Optimization（Studio） | /studio | URL→Resolve→Scan→Generate→审核→Publish→Verify |
| 批量模板 | studio 下方 | Scan catalog→分组→Generate template（占位符）→Apply |
| 扫描前置 | /api/scan | 字段 found/fuzzy/missing，只生成缺失+模糊 |
| Products 页 | /products | 真实 Schema 缺失检测（schema_present）+ 品类字段 |
| 每日体检 | scheduler | health_snapshots 快照 + diff → 告警 |
| Alerts | webhook+体检 | 描述缩短/Schema 消失/主题更新 → Fix 链接 |
| 竞品监控 | /competitors | 每日快照 + diff（FAQ/Schema/价格） |
| 引用监控 | /cite + /api/citations/trend | AI 引用域名分布（Wirecutter 38%…） |
| 回归监控 | /api/regression/run | 丢失推荐 → DeepSeek 归因 → 告警 |
| AI Insights | dashboard | 每日 1 次总结简报 |
| 周报 | /api/reports/weekly | 周一邮件（SQL 聚合+LLM 润色+Resend） |
| 问题库 | admin/data | 四源采集（Google Suggest/Reddit/YouTube/FAQ）+ LLM 聚类 |
| FAQ 反哺 | shopify_ai | 生成 FAQ 注入品类真实问题 |
| 多站/配额 | usage.py | free1站3次/pro1站50/growth3站200/agency10站500；OWNER_USER_IDS 无限 |

## 7. 关键业务规则（改代码前必读）

- **内容边界**（docs/product-content-boundaries.md）：只改描述[opt-in]/模块/JSON-LD；禁碰主题/导航/图片/About/Blog
- **弹窗**：点击内容区绝不关（target===currentTarget + 坐标对比）
- 域名保留端口（URL.hostname 是坑）；服务器间 follow_redirects；uuid 列传 NULL 不传空串
- async 上下文绝不 new_event_loop（scheduler 全 await）
- 花钱端点鉴权+限速（run 类、scan）；密钥只进 .env；LLM 兜底+重试
- 导航放模块不放功能；dashboard 内容只增不减；Cons 永不生成；AI 描述默认隐藏
- 生成前先扫描；数据不编造（AI 缺字段→missing 清单）

## 8. 数据库（migration 016-020 已跑）

sites / products(+schema_present/category/knowledge_fields) / content_drafts / usage_tracking / questions / ai_responses / citations / health_snapshots / alerts / competitors / competitor_snapshots / ai_insights / subscriptions(外键指向空 public.users，勿用) / email_preferences / score_snapshots / social_* / marketplace_* / knowledge_base

## 9. 测试环境

- WP 测试站：localhost:8081（50 商品，6 品类，token zJvfecPRrrVnO9AZHpvP5vZ51g9gq63k，Coming Soon 已关）
- 配额清零：`DELETE FROM usage_tracking WHERE shop='localhost:8081';`
- 账户：408221699@qq.com（owner，unlimited 无限配额）
- mock Shopify：test/mock_shopify.py（:8443，token mock_token）

## 10. 已知限制/待办

- Shopify OAuth 未绑账号（user_id=None → 永远 free 配额）——等 Shopify 真实可用时补 JWT 关联
- 回归监控的商店归属是猜测（ai_responses 无 shop 列）
- ofox 网络不稳（引用监控已熔断 DeepSeek 兜底）
- 趋势雷达已决定不做（闭环弱）
- wordpress.org 上架材料已齐（docs/wordpress-org-submission-checklist.md）；Shopify App Store 材料已齐（docs/shopify-app-store-checklist.md），需 Partner 账号（大陆受限）
- 待补优化：Meta 标题/描述生成；SEO 建议清单（alt/面包屑/内链检测汇总）；Knowledge Coverage 页完善

## 11. 常用命令

```bash
# 语法检查
python -c "import ast; ast.parse(open('app/api/xxx.py', encoding='utf-8').read())"
# 重打包插件 zip（改 wordpress-plugin/ 后）
#   Windows: 用 python zipfile 打包 prodrank-ai-seo/ 目录 → 根 zip + frontend/public/downloads/
# 截图重新生成
cd test/screenshots && node shots-appstore.js
# 测试脚本
PYTHONIOENCODING=utf-8 python ../test/test_shopify_appstore.py  # 需在 backend/ 下跑
```

## 12. 注意（经验教训）

- 重启本地后端：`taskkill //F //IM python.exe` 后**在 backend/ 目录**重启（cwd 漂移会 ModuleNotFoundError）
- 改 SQL 迁移：Supabase SQL Editor 手动执行（用户操作），代码先兼容（列缺失时 try/except）
- Supabase 生产库与代码库 schema 可能不一致（subscriptions 外键问题）——以实际报错为准
- 前端 supabase 查询必须 select 包含 id（否则 React key 警告）
