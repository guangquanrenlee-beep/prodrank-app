# Shopify App Store 提交清单

> 提交地址：https://partners.shopify.com/ → Apps → 你的 App → Distribution → App Store listing
> 前置条件：Shopify Partner 账号（大陆注册受限，需海外身份/公司或 VPN 辅助）

## 代码与功能（已全部完成 ✅）

| 要求 | 状态 | 位置 |
|---|---|---|
| 稳定 API 版本（非 unstable/已弃用） | ✅ | `services/shopify_service.py` — `SHOPIFY_API_VERSION = "2026-07"`，全后端统一 |
| OAuth HMAC 验证 | ✅ | `api/shopify.py` `/callback` — 验证所有 query param 的 HMAC |
| OAuth state/CSRF 防护 | ✅ | `/install` 持久化 state nonce → `/callback` 验证后清除（需 migration 015） |
| OAuth timestamp 防重放 | ✅ | 回调超过 1 小时拒绝 |
| 商家拒绝授权优雅处理 | ✅ | 302 回 `/settings?error=denied` 显示提示 |
| 安装成功引导回前端 | ✅ | 302 → `/settings?shop=X&installed=1` 绿色横幅 + 引导去 AI Studio |
| GDPR: customers/data_request | ✅ | `api/shopify_webhook.py` — 我们无客户数据，返回空 + 审计日志 |
| GDPR: customers/redact | ✅ | 同上，确认无数据可删 |
| GDPR: shop/redact | ✅ | `db.delete_shop_data()` 级联清除 products/drafts/usage/site |
| Webhook HMAC 验证 | ✅ | 所有 webhook（含 GDPR）验证 `X-Shopify-Hmac-Sha256` |
| 应用可完整走通安装 → 引导 | ✅ | mock 环境验证过 install 链路，真实 Dev Store 待有 Partner 账号后测 |

## Partner Dashboard 配置（待你操作 ⏳）

1. **OAuth redirect URL**：Apps → App setup → `Allowed redirection URL(s)` 填
   `https://api.prodrank.app/api/shopify/callback`
2. **Webhooks 注册**：Apps → App setup → Webhooks → Subscribe（URL 前缀 `https://api.prodrank.app/api/shopify/webhook`）：
   - `products/update`、`products/create`
   - `inventory_levels/update`
   - `themes/publish`
   - `app/uninstalled`
   - `customers/data_request`（GDPR 强制）
   - `customers/redact`（GDPR 强制）
   - `shop/redact`（GDPR 强制）
3. **API 版本**：App setup → API access → 确认使用 2026-07（对齐代码）
4. **回调测试**：真实 Dev Store 走一遍 install → authorize → callback → 302 回前端

## 列表材料（已备齐 ✅，见 `docs/shopify-app-store-listing.md`）

| 材料 | 状态 |
|---|---|
| App 名称（ProdRank — AI Commerce SEO） | ✅ 文档就绪 |
| 短描述 / 长描述 | ✅ 文档就绪 |
| 分类（Marketing → SEO） | ✅ |
| 支持邮箱 support@prodrank.app | ✅ |
| 隐私政策 https://prodrank.app/privacy | ✅ 已扩展 GDPR 内容 |
| 服务条款 https://prodrank.app/terms | ✅ |
| App 图标 1024×1024 | ⏳ 需制作（规格在 listing 文档） |
| 截图 ×5（1200×900） | ⏳ 需从本地环境截取（清单见 listing 文档） |

## 提交前自检（Shopify 官方要求对照）

- [ ] 应用是**公共应用**（Public app），非自定义应用
- [ ] 在**开发商店**完整测试安装流程（OAuth + webhook + 功能）
- [ ] 隐私政策 URL 在 Partner Dashboard 填了
- [ ] 三个 GDPR webhook 已订阅
- [ ] 图标和截图已上传
- [ ] 描述不包含外部收费链接（B 策略：Free to install，升级引导 prodrank.app）
- [ ] 支持渠道（邮箱）在列表可见
- [ ] 未使用 unstable API 版本
- [ ] 后台无敏感日志/密钥泄露

## 审核后处理

- 审核状态：Draft → Submitted → Under review → Published / Suspended
- 被拒后按邮件修改，回复后重新提交
- 通过后：**建议立即安排 Shopify Billing**（若未来想在 App 内收费，否则 B 策略保持）

## 审核时长

提交后通常 1-3 周（人工审核 + 可能要求视频演示）。
