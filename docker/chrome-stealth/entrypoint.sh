#!/bin/bash
set -e

# Clean stale X lock from previous container restart
rm -f /tmp/.X99-lock

# Start virtual display
Xvfb :99 -screen 0 1920x1080x24 -nolisten tcp -ac &
sleep 2
export DISPLAY=:99

# Chrome binds to 127.0.0.1 despite --remote-debugging-address=0.0.0.0 (Chrome 146+)
# Use port 9223 internally, then socat forwards 0.0.0.0:9222 → 127.0.0.1:9223
socat TCP-LISTEN:9222,bind=0.0.0.0,fork,reuseaddr TCP:127.0.0.1:9223 &

# Launch Chrome in headed mode (renders to Xvfb)
exec google-chrome-stable \
    --no-sandbox \
    --disable-setuid-sandbox \
    --disable-dev-shm-usage \
    --no-first-run \
    --no-default-browser-check \
    --disable-background-networking \
    --disable-default-apps \
    --disable-sync \
    --disable-translate \
    --disable-hang-monitor \
    --disable-prompt-on-repost \
    --disable-features=TranslateUI \
    --remote-debugging-port=9223 \
    --remote-debugging-address=0.0.0.0 \
    --remote-allow-origins=* \
    --user-data-dir=/data/browser-profile \
    --window-size=1920,1080 \
    --lang=fr-FR \
    --accept-lang=fr-FR,fr,en-US,en \
    --start-maximized \
    about:blank
