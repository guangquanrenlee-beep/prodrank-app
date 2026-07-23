#!/bin/bash
# ProdRank VPS Install — run as root
# Copy-paste this entire script into your VPS terminal

set -e

echo "=== Installing dependencies ==="
apt update && apt install -y python3 python3-pip python3-venv nginx git

echo "=== Setting up ProdRank backend ==="
mkdir -p /opt/prodrank
cd /opt/prodrank
python3 -m venv venv
source venv/bin/activate

echo "=== Cloning project ==="
git clone https://github.com/guangquanrenlee-beep/prodrank.git code
cd code/backend
pip install -r requirements.txt
pip install uvicorn

echo "=== Creating .env file ==="
cat > .env << 'ENVEOF'
OPENAI_API_KEY=sk-of-CTDFzYxIjKVQEvpXbklAxMXLAPgDyzLSRNLYxUjGWLzMopdTRIvgblzuDsckhFUm
OPENAI_BASE_URL=https://api.ofox.ai/v1
SUPABASE_URL=https://reqacknemyxnyqzkvrpe.supabase.co
SUPABASE_ANON_KEY=sb_publishable_yr6jYKYiMfTqTcaYZfzLhg_Rb-NYk4n
SUPABASE_SERVICE_KEY=sb_secret_CnEkK4jWT4JauVa5ySA-LA_vJoJgtfS
SHOPIFY_CLIENT_ID=68693bd65e752d8ba73f896e37709114
SHOPIFY_CLIENT_SECRET=6c4b649bf1e2c0296f30bc5d9d1f4606
DEBUG=false
SECRET_KEY=change-me-to-a-random-string-in-production
ENVEOF

echo "=== Creating systemd service ==="
cat > /etc/systemd/system/prodrank.service << 'SVC'
[Unit]
Description=ProdRank API
After=network.target

[Service]
User=root
WorkingDirectory=/opt/prodrank/code/backend
ExecStart=/opt/prodrank/venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
SVC

echo "=== Setting up Nginx reverse proxy ==="
cat > /etc/nginx/sites-available/prodrank << 'NGX'
server {
    listen 80;
    server_name _;

    location / {
        proxy_pass http://127.0.0.1:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_read_timeout 300s;
        proxy_connect_timeout 60s;
    }
}
NGX

ln -sf /etc/nginx/sites-available/prodrank /etc/nginx/sites-enabled/
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx

echo "=== Starting service ==="
systemctl daemon-reload
systemctl enable prodrank
systemctl start prodrank

sleep 3
echo ""
echo "=== Done! ==="
echo "Your backend is at: http://$(curl -s ifconfig.me)"
echo "Check status: systemctl status prodrank"
echo "View logs: journalctl -u prodrank -f"
