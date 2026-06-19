#!/bin/bash
# Watchdog — keeps the Next.js dev server alive
# Checks every 5s; restarts if the process is gone.
cd /home/z/my-project

while true; do
  if ! pgrep -f "next dev" > /dev/null 2>&1 && ! pgrep -f "next-server" > /dev/null 2>&1; then
    echo "[$(date)] Next.js not running — starting..." >> /home/z/my-project/restart.log
    cd /home/z/my-project
    nohup ./node_modules/.bin/next dev -p 3000 >> /home/z/my-project/dev.log 2>&1 &
    disown $! 2>/dev/null
    sleep 8
  fi
  sleep 5
done
