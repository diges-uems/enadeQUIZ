#!/usr/bin/env bash
set -uo pipefail

cd /home/z/my-project/mini-services/enade-quiz
bun --hot index.ts > log.txt 2>&1 &
SOCKET_PID=$!
cd /home/z/my-project/mini-services/stress-test
bun --hot index.ts > log.txt 2>&1 &
STRESS_PID=$!

for i in {1..15}; do
  sleep 1
  if ss -tln 2>/dev/null | grep -q ":3003" && ss -tln 2>/dev/null | grep -q ":3004"; then
    echo "Both services ready after ${i}s"
    break
  fi
done
trap "kill $SOCKET_PID $STRESS_PID 2>/dev/null" EXIT

QID=$(curl -s http://localhost:3000/api/session/67QAFO | python3 -c "import json,sys; print(json.load(sys.stdin)['questions'][0]['id'])")
echo "Question ID: $QID"

# Fixed activate script: listen for session-state event instead of ack callback
cat > /tmp/activate.ts <<'EOF'
import { io } from 'socket.io-client'
const SESSION = '67QAFO'
const QUESTION_ID = process.argv[2]
const PRESENTER_KEY = 'presenter-default-key-2025'
const presenter = io('http://localhost:3003', { path: '/', transports: ['websocket'], forceNew: true, timeout: 5000 })
let activated = false
presenter.on('connect', () => {
  console.log('  connected, sending join-session...')
  presenter.emit('join-session', { sessionCode: SESSION, role: 'presenter', presenterKey: PRESENTER_KEY })
})
presenter.on('session-state', (data: any) => {
  console.log('  session-state received:', JSON.stringify(data))
  if (!activated) {
    activated = true
    console.log('  sending activate-question...')
    presenter.emit('activate-question', { sessionCode: SESSION, questionId: QUESTION_ID }, (ack: any) => {
      console.log('  activate ack:', JSON.stringify(ack))
      setTimeout(() => { presenter.disconnect(); process.exit(0) }, 500)
    })
    // Fallback in case ack doesn't fire
    setTimeout(() => { console.log('  ack timeout but continuing'); presenter.disconnect(); process.exit(0) }, 3000)
  }
})
presenter.on('presenter-rejected', (d: any) => { console.log('REJECTED:', d); process.exit(1) })
presenter.on('connect_error', (e: any) => { console.log('connect_error:', e.message); process.exit(1) })
setTimeout(() => { console.log('OVERALL TIMEOUT'); process.exit(1) }, 10000)
EOF
echo "Activating question..."
cd /home/z/my-project && bun run /tmp/activate.ts "$QID"

echo ""
echo "===== NORMAL STRESS TEST (1000 students) ====="
curl -s -X POST http://localhost:3004/ \
  -H 'Content-Type: application/json' \
  -d "{\"sessionCode\":\"67QAFO\",\"questionId\":\"$QID\",\"correctAnswer\":\"C\",\"studentCount\":1000,\"scenario\":\"normal\"}" \
  --max-time 120 | python3 -m json.tool

echo ""
echo "===== MIXED STRESS TEST (250 clients: students + attackers + bad-input) ====="
curl -s -X POST http://localhost:3004/ \
  -H 'Content-Type: application/json' \
  -d "{\"sessionCode\":\"67QAFO\",\"questionId\":\"$QID\",\"correctAnswer\":\"C\",\"studentCount\":250,\"scenario\":\"mixed\"}" \
  --max-time 90 | python3 -m json.tool

echo ""
echo "===== DONE ====="
