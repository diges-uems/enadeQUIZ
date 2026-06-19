#!/bin/bash
# Double-fork daemon — survives parent shell cleanup
cd /home/z/my-project

# Kill any existing
pkill -f "next dev" 2>/dev/null
sleep 1

rm -f dev.log

# Double-fork: parent exits, child reparents to init, grandchild is the server
(
  # First fork
  setsid bash -c '
    cd /home/z/my-project
    # Second fork — the actual server
    ./node_modules/.bin/next dev -p 3000 > dev.log 2>&1 &
    NEXT_PID=$!
    echo $NEXT_PID > /tmp/next-dev.pid
    # Watchdog: restart if dies
    while true; do
      if ! kill -0 $NEXT_PID 2>/dev/null; then
        ./node_modules/.bin/next dev -p 3000 >> dev.log 2>&1 &
        NEXT_PID=$!
        echo $NEXT_PID > /tmp/next-dev.pid
        echo "[$(date)] Restarted: $NEXT_PID" >> restart.log
      fi
      sleep 5
    done
  ' >/dev/null 2>&1 < /dev/null &
  # First fork exits immediately
) 2>/dev/null

# Also start mini-services with double-fork
(
  setsid bash -c 'cd /home/z/my-project/mini-services/enade-quiz && exec bun --hot index.ts' >/tmp/socket.log 2>&1 </dev/null &
) 2>/dev/null
(
  setsid bash -c 'cd /home/z/my-project/mini-services/stress-test && exec bun --hot index.ts' >/tmp/stress.log 2>&1 </dev/null &
) 2>/dev/null

echo "Daemon started"
sleep 8
echo "=== Status ==="
curl -s -o /dev/null -w "Port 3000: HTTP %{http_code}\n" http://127.0.0.1:3000/ 2>&1
pgrep -af "next dev" 2>&1 | head -2
pgrep -af "bun.*index" 2>&1 | head -2
