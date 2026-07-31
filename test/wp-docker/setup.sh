#!/bin/sh
# One-time WordPress test store setup (runs inside the wpcli container)
set -e

echo "== Installing WordPress..."
wp core install \
  --url="http://localhost:8081" \
  --title="ProdRank Test Store" \
  --admin_user="admin" \
  --admin_password="admin" \
  --admin_email="admin@example.com" \
  --skip-email 2>/dev/null || echo "(WordPress already installed, skipping)"

echo "== Installing + activating WooCommerce..."
wp plugin install woocommerce --activate 2>/dev/null || true

echo "== Activating ProdRank plugin..."
wp plugin activate prodrank-ai-seo 2>/dev/null || echo "(plugin already active)"

echo "== Importing WooCommerce sample products (~25 products)..."
wp wc tool run install_sample_data --user=1 2>/dev/null || echo "(sample data skipped)"

echo "== Setting pretty permalinks..."
wp rewrite structure '/%postname%/' --hard 2>/dev/null || true

echo ""
echo "=========================================="
echo "  DONE — Test store ready!"
echo "  Store:   http://localhost:8081"
echo "  Admin:   http://localhost:8081/wp-admin  (admin / admin)"
echo "  Plugin:  WooCommerce -> ProdRank SEO"
echo "=========================================="
