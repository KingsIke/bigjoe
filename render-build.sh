#!/usr/bin/env bash
set -o errexit

export PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer

# Install deps
npm install

# Install Chrome explicitly
npx puppeteer browsers install chrome