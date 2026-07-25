#!/bin/bash
# ProdRank Docker Setup — run once on VPS, then never SSH again
set -e

echo "=== Installing Docker ==="
apt update && apt install -y docker.io docker-compose-v2 git curl
systemctl enable docker --now

echo "=== Generating SSH key for GitHub Actions ==="
mkdir -p /root/.ssh
ssh-keygen -t ed25519 -f /root/.ssh/github_actions -N "" -q
echo ""
echo "=== COPY THIS PRIVATE KEY TO GITHUB SECRETS (VPS_SSH_KEY) ==="
cat /root/.ssh/github_actions
echo ""
echo "=== ADD THIS PUBLIC KEY to /root/.ssh/authorized_keys ==="
cat /root/.ssh/github_actions.pub >> /root/.ssh/authorized_keys
chmod 600 /root/.ssh/authorized_keys

echo ""
echo "=== Setup directory ==="
mkdir -p /opt/prodrank
cd /opt/prodrank
echo "OPENAI_API_KEY=sk-of-CTDFzYxIjKVQEvpXbklAxMXLAPgDyzLSRNLYxUjGWLzMopdTRIvgblzuDsckhFUm" > .env
echo "OPENAI_BASE_URL=https://api.ofox.ai/v1" >> .env
echo "SUPABASE_URL=https://reqacknemyxnyqzkvrpe.supabase.co" >> .env
echo "SUPABASE_ANON_KEY=sb_publishable_yr6jYKYiMfTqTcaYZfzLhg_Rb-NYk4n" >> .env
echo "SUPABASE_SERVICE_KEY=sb_secret_CnEkK4jWT4JauVa5ySA-LA_vJoJgtfS" >> .env
echo "SHOPIFY_CLIENT_ID=68693bd65e752d8ba73f896e37709114" >> .env
echo "SHOPIFY_CLIENT_SECRET=6c4b649bf1e2c0296f30bc5d9d1f4606" >> .env

echo ""
echo "=== Done! ==="
echo "Now copy the SSH private key above and add it to GitHub Secrets as VPS_SSH_KEY"
echo "Also add secrets: VPS_HOST=YOUR_IP, VPS_USER=root"
echo "Then just 'git push' to deploy. No more SSH."
