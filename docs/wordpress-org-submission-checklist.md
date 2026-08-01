# WordPress.org 上架清单

> 上架地址：https://wordpress.org/plugins/developers/add-plugin/
> 需要：wordpress.org 账号（免费注册，无信用卡，无区域限制）

## 已准备好的材料

| 材料 | 位置 | 状态 |
|---|---|---|
| 插件代码 | `wordpress-plugin/`（多文件，0.2.0） | ✅ |
| readme.txt | `wordpress-plugin/readme.txt` | ✅ |
| 图标 256x256 | `wordpress-plugin/icon-256x256.png` | ✅ |
| 图标 128x128 | `wordpress-plugin/icon-128x128.png` | ✅ |
| Banner 772x250 | `wordpress-plugin/banner-772x250.png` | ✅（可选） |
| 打包 zip | `prodrank-ai-seo.zip`（标准结构） | ✅ |

## 还需要：3-5 张截图

在本地测试站（http://localhost:8081）截以下画面，存为 1200x900 左右 PNG：

1. **插件后台页面**：WooCommerce → ProdRank SEO（API token + Rendering Rules 界面）
2. **产品页 Schema 输出**：产品页查看源代码，显示 ld+json 块（或浏览器截图 + 代码截图拼一张）
3. **产品页 AI 内容渲染**：插入 `[prodrank_faq]` shortcode 后的产品页外观
4. **Rendering Rules 配置**：后台勾选界面的特写
5. **Schema Coverage 统计**：后台覆盖率表

截图命名建议：`screenshot-1.png` … `screenshot-5.png`，放 `wordpress-plugin/` 目录。

## 提交时填的内容

- **插件 slug**：`prodrank-ai-seo`
- **描述**：从 readme.txt 的 Description 复制
- **审核要点**：在备注里说明"Freemium：核心 Schema 注入免费，AI 生成是 SaaS 增值（prodrank.app），符合 wordpress.org 免费插件指南"

## 审核通过后

- 获得 SVN 仓库（`https://plugins.svn.wordpress.org/prodrank-ai-seo/`）
- 首次推送：把插件文件 + readme.txt + 截图传上去
- 之后每次更新：SVN 提交，用户自动收到更新

## 审核时长

通常 **几天到 2-4 周**（人工审核队列，动态）。期间保持 readme 规范即可。
