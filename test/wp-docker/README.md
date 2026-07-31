# ProdRank WordPress 插件 — 本地测试站

零成本本地电商站：WordPress + WooCommerce + 25个示例商品 + ProdRank 插件，一键启动。

## 使用方法

```bash
# 1. 启动 Docker Desktop（必须先启动！）

# 2. 启动测试站
cd D:/site/prodrank/test/wp-docker
docker compose up -d

# 3. 等 setup.sh 跑完（第一次约 1-2 分钟，含下载 WooCommerce）
docker compose logs -f wpcli
# 看到 "DONE — Test store ready!" 即可

# 4. 打开测试站
#    前台: http://localhost:8081
#    后台: http://localhost:8081/wp-admin   (admin / admin)
```

## 验证清单

| 检查项 | 方法 | 预期结果 |
|---|---|---|
| 插件激活成功 | 后台 → 插件 | ProdRank 已激活，无致命错误 |
| 前台不白屏 | 打开首页 | `is_plugin_active` 修复生效的关键验证 |
| 全站 Schema | 首页查看源代码，搜索 `ld+json` | 2 个块：Organization + WebSite |
| 产品 Schema | 打开任意产品页（如 `/product/woo-ninja/`）查看源码 | 4 个块：Organization + Product + FAQPage + WebSite |
| FAQ 生成 | 产品页检查 FAQ 块内容 | 自动生成的 3 条 FAQ（退换/物流/是什么） |
| 管理页面 | 后台 → WooCommerce → ProdRank SEO | 显示商品总数 + Schema 覆盖率 % |
| 兼容性 | 后台装个 Yoast SEO 再刷新前台 | 无冲突、不重复注入 |

## 产品页 URL

示例商品（WooCommerce 官方示例数据）：
- `http://localhost:8081/product/woo-ninja/`
- `http://localhost:8081/product/woo-album/`
- `http://localhost:8081/product/woo-login/`

## 常用命令

```bash
# 查看插件日志（调试用）
docker compose logs -f wp

# 改插件代码后立即生效（挂载是实时的，无需重启）
# 只需清空 WP 缓存即可验证

# 停止测试站
docker compose down

# 彻底重置（清空数据库和文件）
docker compose down -v
```

## 快速验证 Schema（命令行）

```bash
# 首页应有 2 个 JSON-LD 块
curl -s http://localhost:8081/ | grep -c 'application/ld+json'

# 产品页应有 4 个 JSON-LD 块
curl -s http://localhost:8081/product/woo-ninja/ | grep -c 'application/ld+json'
```
