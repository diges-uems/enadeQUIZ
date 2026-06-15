#!/bin/bash
while true; do
  if ! pgrep -f "next-server" > /dev/null 2>&1; then
    echo "[$(date)] Starting Next.js..." >> /home/z/my-project/restart.log
    cd /home/z/my-project
    NODE_OPTIONS="--max-old-space-size=256" npx next dev -p 3000 >> /home/z/my-project/dev.log 2>&1 &
    sleep 8
  fi
  sleep 5
done
