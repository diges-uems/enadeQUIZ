#!/usr/bin/env bash
set -e
cd /home/z/my-project/mini-services/stress-test
exec bun --hot index.ts
