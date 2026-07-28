#!/bin/bash
echo "=== Creating keywords ==="
curl -s -X POST http://localhost:8000/api/social/keywords \
  -H "Content-Type: application/json" \
  -H "X-User-Email: 361779519@qq.com" \
  -d '{"brand_name":"ProdRank","industry_keywords":["CRM software","bookkeeping","SaaS tool"],"brand_keywords":["Salesforce","QuickBooks"],"product_keywords":["AI automation","workflow"]}'

echo ""
echo "=== Scanning Reddit ==="
curl -s -X POST http://localhost:8000/api/social/scan \
  -H "Content-Type: application/json" \
  -H "X-User-Email: 361779519@qq.com" \
  --max-time 90 | head -c 2000

echo ""
echo "=== Checking posts ==="
curl -s http://localhost:8000/api/social/posts \
  -H "X-User-Email: 361779519@qq.com" | head -c 1000
