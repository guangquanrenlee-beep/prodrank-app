# Shopify App Store 列表材料

> 提交地址：https://partners.shopify.com/ → Apps → 你的 App → Distribution → App Store listing

## 基本信息

| 项 | 内容 |
|---|---|
| App 名称 | **ProdRank — AI Commerce SEO** |
| 分类 | Marketing → SEO |
| 支持邮箱 | support@prodrank.app |
| 隐私政策 URL | https://prodrank.app/privacy |
| 服务条款 URL | https://prodrank.app/terms |
| App 图标 | 1024×1024 PNG（下方规格） |
| App 状态 | Free to install（核心功能免费，高级功能在 prodrank.app 订阅） |

## 短描述（≤80 字符）

> **Make your products show up when AI recommends.**
> Auto-inject Schema + FAQ that ChatGPT, Gemini, Claude & Grok understand.

（80 字符内，突出"AI 推荐可见性"价值点）

## 长描述（App Store listing 描述）

```text
ProdRank is the AI Commerce SEO app that makes your products visible in AI recommendations.

As shoppers increasingly ask ChatGPT, Gemini, Claude and Grok "what's the best X?", your store needs to be the answer. ProdRank automatically:

✅ Injects complete Product Schema (JSON-LD) on every product page — the structured data AI engines read
✅ Generates AI-optimized FAQ content that gets cited by AI assistants
✅ Adds Organization & WebSite Schema for stronger brand recognition
✅ Audits your store's AI visibility with a 0-100 score
✅ Tracks AI rankings across ChatGPT, Gemini, Claude & Grok
✅ Monitors mentions of your products in AI responses

How it works:
1. Install the app and connect your store
2. ProdRank audits your product pages automatically
3. Review AI-generated content in the AI Studio, then publish with one click
4. Watch your AI visibility score and rankings improve

Your product data stays yours. We never sell data. No customer data is processed or stored.

Free to install — includes AI content generation every month. Premium plans available at prodrank.app for unlimited products and advanced analytics.

Questions? Contact support@prodrank.app — we typically respond within 24 hours.
```

## 关键词标签

```
ai seo, seo, ai visibility, generative engine optimization, geo, schema, structured data, faq, chatgpt, ai agents
```

## 截图（已生成 ✅，2400×1800 高清 = 1200×900 的 2x）

输出目录：`docs/appstore-assets/`（源文件 `test/screenshots/appstore/*.html`，重新生成跑 `node test/screenshots/shots-appstore.js`）

| # | 文件 | 画面 | 内容要点 |
|---|---|---|---|
| 1 | `screenshot-1.png` | AI Studio 主界面 | 输入产品 URL → 品类识别 → 四层内容生成（Identity/Knowledge/Decision/Trust） |
| 2 | `screenshot-2.png` | Schema 审核视图 | 显示的 JSON-LD + 缺失字段提示（missing 清单 → Fill manually） |
| 3 | `screenshot-3.png` | 批量生成面板 | 品类模板 + 占位符 + 一键应用到全店（243 产品仅 5 次 AI 调用） |
| 4 | `screenshot-4.png` | AI 排名监控 | ChatGPT/Gemini/Claude/Grok 排名 + 趋势图 + 提及统计 |
| 5 | `screenshot-5.png` | 安装后产品页效果 | 产品页的 FAQ 模块 + Schema 验证横幅 |

## App 图标（已生成 ✅）

- `docs/appstore-assets/app-icon-1024.png` — 1024×1024 PNG，无圆角（Shopify 自动裁切）
- 设计：深色阴影 + emerald 渐变圆角方块，白色上升柱状图 + 箭头（排名上升语义）

## 嵌入类型

**非嵌入（外部页面）**——安装后跳转 prodrank.app。因此不需要 App Bridge、不需要 frame-ancestors CSP。审核员安装后会被引导到 Web 前端完成引导流程。
