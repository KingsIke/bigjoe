#!/usr/bin/env bash
set -o errexit

npm install

# Ensure Puppeteer cache directory exists
PUPPETEER_CACHE_DIR=/opt/render/.cache/puppeteer
mkdir -p $PUPPETEER_CACHE_DIR

# Install Chrome for Puppeteer
npx puppeteer browsers install chrome

# Cache management for Render's build cache
if [[ ! -d $PUPPETEER_CACHE_DIR ]]; then
    echo "...Copying Puppeteer Cache from Build Cache"
    cp -R /opt/render/project/src/.cache/puppeteer/chrome/ $PUPPETEER_CACHE_DIR
else
    echo "...Storing Puppeteer Cache in Build Cache"
    cp -R $PUPPETEER_CACHE_DIR /opt/render/project/src/.cache/puppeteer/chrome/
fi