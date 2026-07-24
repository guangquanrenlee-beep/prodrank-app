#!/bin/bash
# ProdRank VPS update script
# Usage: bash update.sh
cd /opt/prodrank/code && git pull && pkill -f start.py && nohup /opt/prodrank/venv/bin/python3 /opt/prodrank/code/backend/start.py > /dev/null 2>&1 &
echo "Updated. PID: $!"
