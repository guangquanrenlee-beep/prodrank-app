# GDPR 合规说明

## 角色界定

- **数据控制者（Controller）**：账号信息（邮箱、订阅）、站内使用数据
- **数据处理者（Processor）**：商家店铺的产品数据、AI 生成内容（受商家指示处理）

## 我们存储的数据

| 数据 | 表 | 备注 |
|---|---|---|
| 账号邮箱 | auth.users / email_preferences | Supabase Auth |
| 商店连接（token、shop 域名） | sites | OAuth access_token |
| 产品数据 | products | Shopify Admin API 同步 |
| AI 生成内容（版本化） | content_drafts | 每字段多版本 |
| 使用配额 | usage_tracking | shop+month 粒度 |
| AI 排名/提及 | ai_responses / citations | 关键词级 |

**我们不存储：客户订单、客户个人信息、支付信息。** 因此 `customers/data_request` 和 `customers/redact` 无数据可返回/清除——仅确认 + 审计日志。

## Shopify 强制 Webhook（已实现 ✅）

代码：`backend/app/api/shopify_webhook.py`（全部经 HMAC 验证）

| Topic | 行为 |
|---|---|
| `customers/data_request` | 200 空响应 + `[gdpr]` 审计日志（无客户数据） |
| `customers/redact` | 200 确认 + 审计日志 |
| `shop/redact` | `db.delete_shop_data(shop)` 级联清除全部店铺数据 |

## 删除链路（shop/redact）

```
shop/redact 到达
  → db.delete_shop_data(shop)
    → content_drafts   WHERE shop = X（无 FK，显式删）
    → usage_tracking   WHERE shop = X（无 FK，显式删）
    → sites            WHERE domain = X（FK 级联）
      → products（CASCADE）
        → ai_responses → citations（CASCADE）
        → verifications / optimizations（CASCADE）
  → 始终返回 200（每步 best-effort，失败不影响 ack）
```

Shopify 要求 webhook 24 小时内处理完成——本实现是同步即时删除。

## 手动删除（用户发起）

隐私政策承诺 30 天内处理 support@prodrank.app 的删除请求。Shopify 商家走 shop/redact 自动删；站内账号删除暂未提供自助入口（待办），走邮箱申请。

## 子处理器列表

| 子处理器 | 用途 | 数据位置 |
|---|---|---|
| Supabase | 数据库（PostgreSQL + Auth） | US East |
| DeepSeek API | AI 内容生成 | — |
| Resend | 事务邮件 | — |
| Paddle | 支付处理（不接触卡号） | — |
| Cloudflare | CDN / DDoS | — |
| Shopify | 平台本身（Admin API / OAuth） | — |

列表变更时需同步更新 `/privacy` 页面第 9 节。

## 相关文件

- Webhook 实现：`backend/app/api/shopify_webhook.py`
- 删除方法：`backend/app/services/db.py` → `delete_shop_data()`
- 隐私政策：`frontend/src/app/privacy/page.tsx`（第 7-9 节为 Shopify/GDPR 内容）
- 合规清单：`docs/shopify-app-store-checklist.md`
