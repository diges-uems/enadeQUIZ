#!/bin/bash
# Save 15 ENADE 2025 Administracao Formacao Geral questions to bank, then create session and import
set -e

echo "=== Importing 15 questions to question bank ==="
python3 << 'PYEOF'
import json
import urllib.request

with open('/home/z/my-project/upload/adm_questions.json', 'r') as f:
    questions = json.load(f)

bank_ids = []
for i, q in enumerate(questions, 1):
    data = json.dumps(q).encode('utf-8')
    req = urllib.request.Request(
        'http://localhost:3000/api/question-bank',
        data=data,
        headers={'Content-Type': 'application/json'},
        method='POST'
    )
    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read())
        bank_ids.append(result['id'])
        print(f"  Q{i:02d} saved → {result['id']}")

# Save bank IDs for next step
with open('/home/z/my-project/upload/adm_bank_ids.json', 'w') as f:
    json.dump(bank_ids, f)

print(f"\nAll {len(bank_ids)} questions saved to bank.")
PYEOF

echo ""
echo "=== Creating session for ENADE 2025 Administracao Formacao Geral ==="
python3 << 'PYEOF'
import json
import urllib.request

# Create session
session_data = json.dumps({"title": "ENADE 2025 — Administração (Formação Geral)"}).encode('utf-8')
req = urllib.request.Request(
    'http://localhost:3000/api/session',
    data=session_data,
    headers={'Content-Type': 'application/json'},
    method='POST'
)
with urllib.request.urlopen(req) as resp:
    session = json.loads(resp.read())
    print(f"Session created: code={session['code']}, id={session['id']}")
    print(f"  Title: {session['title']}")

# Import all questions from bank to this session
with open('/home/z/my-project/upload/adm_bank_ids.json', 'r') as f:
    bank_ids = json.load(f)

import_data = json.dumps({
    "sessionCode": session['code'],
    "questionIds": bank_ids,
}).encode('utf-8')

req = urllib.request.Request(
    'http://localhost:3000/api/question-bank/import',
    data=import_data,
    headers={'Content-Type': 'application/json'},
    method='POST'
)
with urllib.request.urlopen(req) as resp:
    result = json.loads(resp.read())
    print(f"\nImported {result['imported']} questions into session {session['code']}")
    print(f"\n=== SESSION CODE: {session['code']} ===")
    print(f"\nYou can access:")
    print(f"  Admin:     /admin")
    print(f"  Votar:     /votar/{session['code']}")
    print(f"  Apresentar: /apresentacao/{session['code']}")

# Save session info
with open('/home/z/my-project/upload/adm_session.json', 'w') as f:
    json.dump({"code": session['code'], "id": session['id'], "title": session['title']}, f, indent=2)
PYEOF
