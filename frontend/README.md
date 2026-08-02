# ProdRank Frontend

Next.js 16（App Router，`output: export` 静态导出）→ 部署到 Cloudflare Pages。

## 开发

```bash
npm install
npm run dev          # http://localhost:3000
```

API 请求自动路由：本地走 `http://localhost:8000`（layout.tsx 的 fetch 拦截脚本按 hostname 判断），生产走 `https://api.prodrank.app`。

## 构建与部署

```bash
npm run build        # 生成 out/
```

- 生产部署：push 到 GitHub main → Cloudflare Pages Git 集成自动构建（build command 在 Cloudflare 侧配置）
- 手动部署（备用）：`npx wrangler pages deploy out --project-name=prodrank`

## 关键页面

- `/studio` — AI Content Studio（粘贴产品 URL → 生成 → 审核 → 发布），核心页面
- `/install` — Shopify OAuth 安装 + WordPress 插件下载
- `/monitoring` — AI 排名 + 提及统计
- `/admin/data` — 私有数据面板（X-Admin-Key，仅所有者）
- `/settings` — WooCommerce 插件 token 连接

## 约定

- 弹窗遮罩关闭用 mousedown/mouseup 坐标对比（拖动选择不误关）
- API 调用统一走 fetch 拦截（layout.tsx），页面代码只写相对 `/api/...` 路径
