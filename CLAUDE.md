# ProdRank

AI Agent Commerce SEO — 监控和优化产品在 ChatGPT/Gemini/Claude/Grok 中的可见性。商家通过 Shopify App / WordPress 插件接入，SaaS 侧生成 GEO 内容并追踪 AI 推荐。

## 编码基本规则（改代码前必读）

- 弹窗：点击内容区绝不关（只有点遮罩本身+未拖动）；请求必须有超时；loading 必须能复位；输入/连接状态持久化不丢
- 域名解析保留端口（URL.hostname 是坑）；服务器间请求 follow_redirects；uuid 列传 NULL 不传空串；async 上下文绝不 new_event_loop
- 数据不编造（API 拿不到标未检测到，AI 缺字段返回 missing）；花钱端点必须鉴权+限速；密钥只进 .env；LLM 调用兜底+重试
- 内容边界见 `docs/product-content-boundaries.md`；导航放模块不放功能（自动任务不进菜单）；dashboard 内容只增不减；Cons 永不生成；生成前先扫描

## 怎么跑起来

```bash
# 后端（本地，:8000）
cd backend && python -m uvicorn app.main:app --port 8000
# 连 mock Shopify 测试：SHOPIFY_API_BASE=http://127.0.0.1:8443
# 测试用 DeepSeek：DEEPSEEK_API_KEY=sk-xxx（.env 已配）

# 前端（:3000）
cd frontend && npm run dev

# 本地测试站（WordPress + WooCommerce，:8081）
cd test/wp-docker && docker compose up -d   # 首次需启动 Docker Desktop

# Mock Shopify（:8443，测 Shopify 链路）
cd test && python mock_shopify.py
```

> **完整运维手册见 `README.md`**（服务器拓扑/部署流程/密钥清单/自动任务开关/已知坑）。以下为编码规则摘要。

## 技术栈

- 后端：FastAPI（Python 3.12）+ Supabase（PostgreSQL）+ DeepSeek（内容生成，ofox 仅限 Analyze 对比槽与图片视觉）+ **文件式任务队列**（`backend/tasks/`，无 Redis）
- 前端：Next.js 16（output: export 静态部署 → Cloudflare Pages）
- 商家端：Shopify Theme Extension（Liquid）+ WordPress 插件（PHP，post meta 存储）
- 部署：前端 push GitHub main → Cloudflare Pages 自动；后端**手动** `python C:\Users\36177\deploy_prod.py`（直连生产机 98.159.111.217，无 cron）

## 目录与约定

- `backend/app/api/` — FastAPI 路由；`services/` — 业务逻辑（llm.py 是统一 LLM 工厂）
- 内容生成遵循 `services/knowledge_templates.py` 四层模板（Identity/Knowledge/Decision/Trust），AI 缺失字段绝不编造，返回 missing 清单
- 内容边界：`docs/product-content-boundaries.md`（只改描述[opt-in]/模块/JSON-LD，禁碰主题/导航/图片）
- 配额：`services/usage.py` 配额链（OWNER_USER_IDS 或 subscriptions.plan → free 3/pro 50/growth 200/agency 500/unlimited）；owner 店 shop.prodrank.app 已解锁 unlimited
- 数据库迁移：`database/migrations/`，改表后需在 Supabase SQL Editor 手动执行
- 数据资产（问题库）只进 `/admin/data`（X-Admin-Key），用户不可见

## 当前状态与下一步

- 已完成：双平台接入、AI Studio（URL→品类→生成→审核→发布）、批量模板、月度配额、真实问题采集器、AI 提及监控、DeepSeek 切换、Shopify App Store 上架材料与合规代码（OAuth HMAC/state 验证、GDPR 三条 webhook、API 2026-07）
- Shopify 上架（B 策略：Free to install，高级功能站外 Paddle 订阅）：材料在 `docs/shopify-app-store-listing.md`，清单在 `docs/shopify-app-store-checklist.md`，GDPR 说明在 `docs/gdpr-compliance.md`；Partner Dashboard 待办（webhook 订阅、redirect URL、图标截图）
- 已评估放弃：AI 趋势雷达（属性占比统计）——输出→行动闭环弱，不如 5/7 值钱（2026-08 决策）
- 待办：Shopify Partner 账号（大陆区受限，需 VPN/海外）；wordpress.org 提交上架（材料已备齐，`docs/wordpress-org-submission-checklist.md`）；知识图谱可视化页；数据反哺生成（品类高频词注入 FAQ）；测试脚本 `test/test_shopify_appstore.py` 覆盖 OAuth 安全与 GDPR
