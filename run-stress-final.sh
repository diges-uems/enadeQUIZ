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
    break
  fi
done
trap "kill $SOCKET_PID $STRESS_PID 2>/dev/null" EXIT

# Reset session first to clear votes
curl -s -X POST http://localhost:3000/api/session/67QAFO/reset > /dev/null

# Get a fresh question
QID=$(curl -s http://localhost:3000/api/session/67QAFO | python3 -c "import json,sys; print(json.load(sys.stdin)['questions'][1]['id'])")
echo "Question ID: $QID"

cat > /tmp/activate.ts <<'EOF'
import { io } from 'socket.io-client'
const SESSION = '67QAFO'
const QUESTION_ID = process.argv[2]
const PRESENTER_KEY = 'presenter-default-key-2025'
const presenter = io('http://localhost:3003', { path: '/', transports: ['websocket'], forceNew: true, timeout: 5000 })
let activated = false
presenter.on('connect', () => {
  presenter.emit('join-session', { sessionCode: SESSION, role: 'presenter', presenterKey: PRESENTER_KEY })
})
presenter.on('session-state', () => {
  if (!activated) {
    activated = true
    presenter.emit('activate-question', { sessionCode: SESSION, questionId: QUESTION_ID }, (ack: any) => {
      console.log('activate ack:', JSON.stringify(ack))
      setTimeout(() => { presenter.disconnect(); process.exit(0) }, 400)
    })
    setTimeout(() => { presenter.disconnect(); process.exit(0) }, 3000)
  }
})
presenter.on('connect_error', (e: any) => { console.log('err:', e.message); process.exit(1) })
setTimeout(() => { process.exit(1) }, 10000)
EOF
cd /home/z/my-project && bun run /tmp/activate.ts "$QID"

echo ""
echo "===== HEAVY LOAD: 2000 students ====="
curl -s -X POST http://localhost:3004/ \
  -H 'Content-Type: application/json' \
  -d "{\"sessionCode\":\"67QAFO\",\"questionId\":\"$QID\",\"correctAnswer\":\"A\",\"studentCount\":2000,\"scenario\":\"normal\"}" \
  --max-time 120 | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'Connected: {d[\"connected\"]}/{d[\"totalStudents\"]}')
print(f'Voted: {d[\"voted\"]}  Rejected: {d[\"rejectedVotes\"]}  Failed: {d[\"failed\"]}')
print(f'Duration: {(d[\"durationMs\"]/1000):.2f}s  Votes/sec: {d[\"votesPerSecond\"]}')
print(f'Peak concurrent: {d[\"peakConcurrentConnections\"]}')
print(f'Avg response: {d[\"avgResponseTimeMs\"]}ms  Memory: {d[\"memoryRssMb\"]}MB')
print(f'Vote dist: A={d[\"voteDistribution\"][\"A\"]} B={d[\"voteDistribution\"][\"B\"]} C={d[\"voteDistribution\"][\"C\"]} D={d[\"voteDistribution\"][\"D\"]} E={d[\"voteDistribution\"][\"E\"]}')
print(f'Errors: {len(d[\"errors\"])}')
if d['errors']:
    for e in d['errors'][:3]: print(f'  - {e}')
"

echo ""
echo "===== LONG-LIVED: 200 students, 3 questions, 30s ====="
# Activate Q1
cd /home/z/my-project && bun run /tmp/activate.ts "$QID" 2>&1 | head -1
curl -s -X POST http://localhost:3004/ \
  -H 'Content-Type: application/json' \
  -d "{\"sessionCode\":\"67QAFO\",\"questionId\":\"$QID\",\"correctAnswer\":\"A\",\"studentCount\":200,\"scenario\":\"long-lived\"}" \
  --max-time 90 | python3 -c "
import json, sys
d = json.load(sys.stdin)
print(f'Connected: {d[\"connected\"]}  Voted: {d[\"voted\"]}  Failed: {d[\"failed\"]}')
print(f'Duration: {(d[\"durationMs\"]/1000):.2f}s  Peak: {d[\"peakConcurrentConnections\"]}  Mem: {d[\"memoryRssMb\"]}MB')
print(f'Errors: {len(d[\"errors\"])}')
"

echo ""
echo "===== STRESS TEST COMPLETE ====="
