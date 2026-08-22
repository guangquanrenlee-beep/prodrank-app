# ProdRank — AI Agent Commerce SEO

监控和优化产品在 ChatGPT / Gemini / Claude / Grok 等 AI 中的可见性。商家通过 Shopify App / WordPress 插件接入，SaaS 侧生成 GEO 内容（描述/FAQ/JSON-LD）并追踪 AI 推荐、收录与排名。

> 本文档是**完整运维手册**：新窗口/新人读完即可独立操作。密钥明文不进 repo——完整值在服务器 `98.159.111.217:/opt/prodrank/.env` 与 Claude 持久记忆（`prodrank-supabase-deploy`、`ofox-api-spend-rule`）。

---

## 一、架构总览

```
商家浏览器 → https://prodrank.app (前端)
                  │
                  ▼
         https://api.prodrank.app (API，Cloudflare 域名，源站 = 生产机 98.159.111.217)
                  │  nginx 容器(:80/443, SSL) → backend 容器(:8000)
                  ▼
   ┌──────────────┼──────────────────┐
   ▼              ▼                  ▼
Supabase(PostgreSQL)   DeepSeek API (LLM)   shop.prodrank.app (WordPress 测试店,
(业务数据)            (内容生成/聚类)         带 ProdRank 插件, 供插件链路测试)
```

| 组件 | 技术 | 部署位置 |
|---|---|---|
| 前端 | Next.js 16（`output: export` 静态导出） | **Cloudflare Pages**（push GitHub main 自动构建） |
| 后端 | FastAPI + uvicorn，Docker 容器 | **98.159.111.217**（`/opt/prodrank` git repo，容器 `prodrank` :8000，`prodrank-nginx` 反代 80/443 → backend:8000） |
| 数据库 | Supabase (PostgreSQL) | 云（`backend/.env` 有 service key） |
| LLM | DeepSeek（默认）/ ofox Gemini（仅限特定功能，见"LLM 铁律"） | API 调用，无自建 |
| 商家端 | Shopify Theme Extension（Liquid）+ WordPress 插件（PHP） | `shopify-app/`、`wordpress-plugin/` |
| 测试电商站 | WordPress + WooCommerce | **72.11.140.241**（宝塔 nginx + php8.3-fpm + MySQL） |

---

## 二、服务器拓扑（2026-08-17 定版）

### 生产机：98.159.111.217（直连 SSH，无跳板）
- `root / 6EVas&3&@I&o`（记忆里的运维密码文件）
- hostname `877767`，Ubuntu 22.04，2GB RAM（**内存紧张**）
- `/opt/prodrank` = 后端 git repo（含 `docker-compose.yml`，服务名 `backend` + `nginx`）
- 容器：`prodrank`（backend, :8000）、`prodrank-nginx`（80/443 SSL 反代 backend:8000）
- 同一台还跑着**对账工具** `dianshangjizhang` 容器（无关，勿动）
- 数据卷：named volumes `question_data` → `/app/data`、`question_tasks` → `/app/tasks`

### 退役机：72.11.140.241（2026-08-17 已清空 prodrank）
- 只跑**测试电商站**（宝塔 nginx + MySQL，`shop.prodrank.app`）
- prodrank 容器/镜像/volumes/vhost 已全删（vhost 备份在 `/root/vhost-bak/`）
- `docker ps -a` 应为空；`/opt/prodrank` 目录还留在磁盘（GitHub 有备份，可删）
- **访问需经生产机跳板**（GFW）：paramiko jump-through 写法见 `C:\Users\36177\check_shop_site.py`
- 宝塔 nginx reload 必须用 `/etc/init.d/nginx reload`（`nginx -s reload` 会找错 PID 文件报错）

### 网络注意
- 本机（墙内）访问 `.app` 域名间歇超时是 GFW，不是服务挂了；判定服务状态用服务器侧 curl

---

## 三、部署流程

### 前端（自动）
```bash
cd D:\site\prodrank\frontend && npm run build   # 本地验证可构建
cd D:\site\prodrank && git add -A && git commit -m "..." && git push origin main
# → Cloudflare Pages 自动构建（约 1-3 分钟），线上 = prodrank.pages.dev / prodrank.app
```

### 后端（手动部署生产机）
```bash
python C:\Users\36177\deploy_prod.py
```
脚本逻辑：`git pull origin main` → **无变更只 `docker compose up -d`；有变更才 `--build backend`**（2GB 内存，避免无谓 pip install）→ 轮询 `/docs` 至 200。

**铁律：先 commit + push 再部署**——否则 git pull 显示 "Already up to date"，改了等于没改。

### 验证脚本（本机 C:\Users\36177\）
| 脚本 | 用途 |
|---|---|
| `deploy_prod.py` | 部署后端到生产机（直连） |
| `verify_prod.py` | 配额 + detect_category 抽查 + https 检查 |
| `diag_generate.py` | 诊断 Generate Draft 超时（日志/插件可达性/generate 计时） |
| `purge_old_machine.py` / `check_shop_site.py` | 旧机器清理/巡检（跳板写法范例） |

---

## 四、环境变量与密钥（生产机 /opt/prodrank/.env）

| 变量 | 用途 |
|---|---|
| `SUPABASE_URL` / `SUPABASE_SERVICE_KEY` | Supabase 直查（service key 绕过 RLS） |
| `DEEPSEEK_API_KEY` | 内容生成/聚类（**当前余额不足 → 402，需充值才恢复 collect**） |
| `OPENAI_API_KEY` / `OPENAI_BASE_URL` | 图片视觉（gpt-4o，仅知识库上传图） |
| `SHOPIFY_CLIENT_ID/SECRET` | Shopify App OAuth |
| `ADMIN_KEY` | 管理端 X-Admin-Key |
| `OWNER_USER_IDS` | owner uuid（**默认值是过期 uuid，勿用**，真实 owner 见记忆） |
| `AUTO_DAILY_JOBS` | **自动每日任务总开关（默认 0=关）**，设 `1` 恢复 |
| `AUTO_RANK_TRACKING` / `AUTO_CITATION_WATCH` | 两个 ofox 大户任务独立开关（需总开关=1 才生效） |
| `YOUTUBE_API_KEY`、Reddit client id/secret | 问题采集数据源（缺失则跳过该源，不失败） |

完整明文值：服务器 `.env` / 桌面"pytty登陆密码"文件 / Claude 记忆。

### LLM 铁律（用户明令）
1. **只有 "Analyze 对比分析" 的 gemini 槽**（ai_parser.py，真实 Gemini vs ChatGPT 对比）允许走 **ofox** API
2. 其他一切内容任务 → **DeepSeek**（`llm.py get_content_client`）
3. 例外：**图片视觉**（gpt-4o，knowledge-base 上传图时）——DeepSeek 无视觉
4. rank 查询保持手动；自动任务默认全停（见下）

---

## 五、自动任务与调度

- 调度器 `backend/app/services/scheduler.py`，由 `main.py` 的 `_background_worker` 每 **30 分钟**触发一次 `run_pending()`
- 任务队列是**文件式**（`/app/tasks/*.json`，无 Redis）；任务类型见 `task_queue.py::_execute`
- **`AUTO_DAILY_JOBS=0`（默认）时**：所有自动每日任务不 enqueue，队列残留自动任务被标 failed 丢弃；手动任务（scan 等）不受影响
- 自动任务清单：`collect_questions`（问题采集+LLM 聚类）、`daily_health_check`、`competitor_watch`、`regression_monitor`、`trend_snapshot`、`daily_insights`、`trend_alerts`、`weekly_report`、`rank_check`、`citation_watch`
- **历史坑**：collect_questions 每天凌晨跑但 DeepSeek **402 余额不足** → 聚类全败 → 每天重复上百次无效调用（已修：402 快速中止 + 总开关）
- 状态文件 `daily_jobs.json`（/app/data）：`last_collect` 曾因漏写盘卡在 08-08（已修）
- 手动采集不受影响：`POST /api/data/collect`（admin/data 页按钮）

---

## 六、数据库与配额

- 表：`sites`（店铺）、`subscriptions`（订阅）、`products`、`collections`（问题库）等；迁移 `database/migrations/`，改表需在 Supabase SQL Editor 手动执行
- **直查/直改**：PostgREST（`SUPABASE_URL/rest/v1/...?select=...`），service key 绕过 RLS（示例见记忆 prodrank-supabase-deploy）
- **配额链**：`check_quota(shop)` → `_plan_for_shop(user_id)` → `OWNER_USER_IDS` 或 `subscriptions.plan` → `PLAN_QUOTAS`（free 3 / pro 50 / growth 200 / agency 500 / unlimited 999999）
- **坑**：
  - `OWNER_USER_IDS` 默认值是过期 uuid → owner 自己也被限流（已改真实 owner uuid）
  - 生产库 `subscriptions.user_id` FK 指向**空的 public.users** → 插行报 23503 → 先插 public.users 镜像行（id+email）再插 subscriptions
  - Shopify 建的站 user_id=None（孤儿），前端登录后需重新绑定

---

## 七、已知坑与规则（踩过全记录）

1. **部署顺序**：先 commit+push，再跑 deploy_prod.py
2. **detect_category**：DeepSeek v4-flash 是推理模型，max_tokens 小会被思考吃光 → 空回复静默兜底 generic；现用 max_tokens=200 + 空回复关键词兜底；**子串误匹配**：别用 "led"(enameled)/"brush"(brushed)/"wash"(machine washable) 当关键词；toys→sports 等靠 CATEGORY_ALIASES 映射
3. **Generate Draft 慢**：AI 生成实测 140s+（单字段）→ 前端超时已提到 300s（studio/page.tsx，勿改回 120s）
4. **容器内存**：2GB 机器 `--build`（pip install）可能压死容器；无代码变更不要 rebuild
5. **任务队列**：async 上下文绝不 `new_event_loop`（会静默杀死所有定时任务）
6. **弹窗/表单规则**：点击内容区不关弹窗；请求必须有超时；loading 必须能复位；数据不编造（API 拿不到标"未检测到"，AI 缺字段返回 missing）；花钱端点必须鉴权+限速；密钥只进 .env
7. **内容边界**：只改描述[opt-in]/模块/JSON-LD，禁碰主题/导航/图片；Cons 永不生成；生成前先扫描（docs/product-content-boundaries.md）
8. **配额已解锁**：owner 店 shop.prodrank.app 为 unlimited（subscriptions 行已插）
9. **本机网络**：墙内访问 `.app` 域名不稳定 → 判定用服务器侧 curl

---

## 八、常用操作速查

```bash
# 生产机后端日志（最近 40 行）
docker logs --tail 40 prodrank        # 在 98.159.111.217 上

# 容器内跑 python（调试用，如验证分类）
docker compose exec -T backend python -c "..."

# 重启后端（无代码变更时）
cd /opt/prodrank && docker compose up -d backend

# 健康检查
curl -s https://api.prodrank.app/docs | head    # 200 = 活

# 数据直查（Supabase）
curl -s "$SUPABASE_URL/rest/v1/sites?select=domain,user_id" -H "apikey: $SUPABASE_SERVICE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

---

## 九、目录结构

```
prodrank/
├── backend/            # FastAPI 后端
│   ├── app/main.py     # 入口 + 30 分钟后台 worker
│   ├── app/api/        # 路由（woocommerce_publish.py=生成链路核心）
│   ├── app/services/   # 业务（llm.py=LLM 工厂；scheduler.py=自动任务；usage.py=配额）
│   ├── data/           # daily_jobs.json 等
│   └── tasks/          # 任务队列文件
├── frontend/           # Next.js（静态导出 → CF Pages）
│   └── src/app/        # studio/ 是 AI Studio 页（生成草稿）
├── database/           # schema.sql + migrations/
├── shopify-app/        # Shopify Theme Extension
├── wordpress-plugin/   # WP 插件
├── docs/               # 产品/上架文档
├── test/               # 本地测试站 + mock
├── docker-compose.yml  # 生产后端 compose（backend + nginx 服务）
└── CLAUDE.md           # 开发规则（编码注意点）
```

---

## 十、当前状态（2026-08-23）

- ✅ 双平台接入、AI Studio（URL→品类→生成→审核→发布）、批量模板、真实问题采集器、DeepSeek 切换、无限配额、修复按钮 + 知识缺口→FAQ、迁移生产机 98.159.111.217
- ⏸ 自动每日任务全停（AUTO_DAILY_JOBS=0）；DeepSeek 余额不足（402）——**充值 + .env 设 AUTO_DAILY_JOBS=1 即恢复每日自动收集**
- 📋 待办：Shopify Partner 账号（需海外）、wordpress.org 上架、知识图谱可视化、品类高频词注入 FAQ
