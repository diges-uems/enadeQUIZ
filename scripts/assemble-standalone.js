#!/usr/bin/env node
/**
 * assemble-standalone.js
 * --------------------------------------------------------------------------
 * After `next build` with `output: 'standalone'`, Next.js emits a minimal
 * server bundle at `.next/standalone/` — but it does NOT include:
 *
 *   - public/          (static assets: logos, uploads, robots.txt, …)
 *   - prisma/          (schema.prisma + the SQLite .db file)
 *   - .next/static/    (JS/CSS chunks with content hashes)
 *   - .env             (runtime env vars)
 *
 * This script copies all of them in so `node .next/standalone/server.js`
 * works out of the box. It is idempotent and safe to re-run.
 *
 * Usage:  node scripts/assemble-standalone.js
 *         (invoked automatically by `npm run build:prod`)
 */
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const STANDALONE = path.join(ROOT, '.next', 'standalone')

// ── Helpers ────────────────────────────────────────────────────────────────
function log(msg) {
  console.log(`\x1b[1;34m[assemble]\x1b[0m ${msg}`)
}
function ok(msg) {
  console.log(`\x1b[1;32m[ok]\x1b[0m      ${msg}`)
}
function warn(msg) {
  console.log(`\x1b[1;33m[warn]\x1b[0m    ${msg}`)
}
function err(msg) {
  console.error(`\x1b[1;31m[err]\x1b[0m     ${msg}`)
}

/**
 * Recursively copy a directory (like `cp -rT`).
 * Creates the destination if it doesn't exist; overwrites files.
 */
function copyDir(src, dest) {
  if (!fs.existsSync(src)) {
    warn(`source not found, skipping: ${src}`)
    return false
  }
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const s = path.join(src, entry.name)
    const d = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(s, d)
    } else if (entry.isSymbolicLink()) {
      // Resolve and copy the target to avoid broken symlinks in the bundle.
      const target = fs.readlinkSync(s)
      const resolved = path.resolve(path.dirname(s), target)
      if (fs.existsSync(resolved)) {
        fs.copyFileSync(resolved, d)
      }
    } else {
      fs.copyFileSync(s, d)
    }
  }
  return true
}

// ── Main ───────────────────────────────────────────────────────────────────
log('Assembling standalone bundle…')

if (!fs.existsSync(STANDALONE)) {
  err(`Standalone directory not found: ${STANDALONE}`)
  err('Did you run `next build` first? (output: "standalone" must be set in next.config.ts)')
  process.exit(1)
}

if (!fs.existsSync(path.join(STANDALONE, 'server.js'))) {
  err('server.js not found in standalone bundle — build may have failed.')
  process.exit(1)
}

let copied = 0
let skipped = 0

// 1. .next/static — JS/CSS chunks referenced by the HTML
const staticSrc = path.join(ROOT, '.next', 'static')
const staticDest = path.join(STANDALONE, '.next', 'static')
log('Copying .next/static → standalone/.next/static')
if (copyDir(staticSrc, staticDest)) { ok('.next/static copied'); copied++ } else { skipped++ }

// 2. public/ — logos, uploads, robots.txt, favicon, etc.
const publicSrc = path.join(ROOT, 'public')
const publicDest = path.join(STANDALONE, 'public')
log('Copying public/ → standalone/public')
if (copyDir(publicSrc, publicDest)) { ok('public/ copied'); copied++ } else { skipped++ }

// 3. prisma/ — schema.prisma (required for query engine) + dev.db
const prismaSrc = path.join(ROOT, 'prisma')
const prismaDest = path.join(STANDALONE, 'prisma')
log('Copying prisma/ → standalone/prisma')
if (copyDir(prismaSrc, prismaDest)) { ok('prisma/ copied'); copied++ } else { skipped++ }

// 4. .env — runtime env vars (DATABASE_URL, ADMIN_SECRET_KEY, etc.)
// NOTE: We deliberately REMOVE .env from the standalone bundle, because:
//   - The Z.ai platform's start.sh sets DATABASE_URL via `export DATABASE_URL=...`
//     (defaulting to file:/app/db/custom.db), and a .env file inside the
//     standalone dir would OVERRIDE that env var (Next.js loads .env from CWD).
//   - The .env in the sandbox uses a relative path (file:./db/custom.db) that
//     would resolve to next-service-dist/db/custom.db, which doesn't exist
//     in the production layout (the DB lives at /app/db/custom.db, one level
//     above next-service-dist/).
// Next.js `next build` with output: standalone COPIES .env into the bundle
// automatically. We need to explicitly delete it here so the platform's
// env vars (set via start.sh) take precedence.
const envDest = path.join(STANDALONE, '.env')
if (fs.existsSync(envDest)) {
  fs.unlinkSync(envDest)
  ok('.env REMOVED from standalone (platform injects env vars via start.sh)')
} else {
  warn('.env not in standalone — platform will inject env vars via start.sh')
}
skipped++

// 5. db/ — if a custom DB directory exists at the project root (sandbox uses
//    db/custom.db), copy it so the absolute DATABASE_URL still resolves.
const dbSrc = path.join(ROOT, 'db')
const dbDest = path.join(STANDALONE, 'db')
if (fs.existsSync(dbSrc) && fs.statSync(dbSrc).isDirectory()) {
  log('Copying db/ → standalone/db')
  if (copyDir(dbSrc, dbDest)) { ok('db/ copied'); copied++ }
} else {
  // No db/ dir — that's fine, prisma/dev.db inside prisma/ covers it.
}

// ── Summary ────────────────────────────────────────────────────────────────
log(`Done. ${copied} copied, ${skipped} skipped.`)
log(`Standalone bundle ready at: ${STANDALONE}`)
log('Start it with:  NODE_ENV=production node .next/standalone/server.js')
