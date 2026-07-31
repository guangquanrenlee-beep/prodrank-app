# ProdRank 内容修改边界（Content Modification Boundaries）

> **硬性规则**：明确 ProdRank 能改什么、绝对不能碰什么。所有 App / 插件 / 发布 / 回滚逻辑必须遵守本文件。
> 核心原则：**只做"数据 + 结构化标记"层面，绝不碰商家自由创作的内容和主题源码。**

---

## 一、可以修改 ✅

| # | 类型 | 做法 | Shopify | WooCommerce |
|---|------|------|---------|-------------|
| 1 | **页面内容**（商品描述） | SaaS 生成 → API 直接覆盖描述字段 | Admin API `productsUpdate` | REST `PUT /products/{id}` |
| 2 | **页面模块**（FAQ / Pros / Cons / Comparison / Buying Guide / AI Summary） | Theme Block / Shortcode 渲染 metafield，AI 更新后页面**自动更新** | Theme App Extension Block（读 `prodrank.*` metafield） | Shortcode（`[prodrank_faq]` 等）+ Gutenberg Block |
| 3 | **页面源码**（JSON-LD） | 插件**渲染时动态生成**输出，不是 AI 改源码 | Liquid block → `<head>` | `wp_head` hook 输出 |
| 4 | **AI 内容存储** | 全部 AI 内容存 `prodrank.*` metafield / `_prodrank_*` post meta，与原内容**分离** | Metafields（namespace `prodrank`） | Post Meta |

覆盖的 Schema 类型：Product / Offer / AggregateRating / FAQPage / Breadcrumb / Organization / WebSite / SearchAction / MerchantReturnPolicy / ShippingDetails。

---

## 二、禁止修改 ❌（绝不自动触碰）

- 商家自建页面内容：**About Us、Blog、Homepage、Landing Page**
- **Collection / Collection 列表页**
- **导航菜单**
- **Theme 源码**：CSS、HTML、Liquid、React/JS
- **图片**：不覆盖、不删除、不替换

---

## 三、Theme 策略 ⚠️

- 只允许：**Theme App Extension / Theme Block / App Embed**
- 禁止：修改 Theme 源码——否则商家升级 Theme 时全部冲突

---

## 四、发布规则（⑥ One-click Publish 必须遵守）

1. **商品描述可以覆盖**（类型 1），但**必须由商家在发布时明确选择**（`overwrite_description=true` 才调用 API 写回 body_html）；默认只写 metafield 由 Block 渲染
2. 其他所有内容**只写 metafield / post meta**，由 Block / Shortcode 渲染，绝不写回商家的内容字段
3. JSON-LD **始终由插件动态输出**，不需要也不允许改源码
4. 渲染控制（Rendering Rules）：商家可以单独显示/隐藏每个模块；JSON-LD 不受渲染规则影响，始终输出
