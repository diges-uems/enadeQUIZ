#!/bin/bash
cd /home/z/my-project
while true; do
  NODE_OPTIONS="--max-old-space-size=256" npx next dev -p 3000 2>&1
  echo "=== Server died, restarting in 3s ===" >> /home/z/my-project/restart.log
  sleep 3
done
