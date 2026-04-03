FROM ubuntu:24.04

ENV DEBIAN_FRONTEND=noninteractive

# Install Chrome + Xvfb + fonts
RUN apt-get update && apt-get install -y --no-install-recommends \
    wget curl gnupg ca-certificates \
    xvfb socat \
    fonts-liberation fonts-noto-color-emoji \
    libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 \
    libxcomposite1 libxdamage1 libxrandr2 libgbm1 libasound2t64 \
    libpangocairo-1.0-0 libgtk-3-0 libxshmfence1 libx11-xcb1 \
    && wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | gpg --dearmor -o /usr/share/keyrings/google-chrome.gpg \
    && echo "deb [arch=amd64 signed-by=/usr/share/keyrings/google-chrome.gpg] http://dl.google.com/linux/chrome/deb/ stable main" > /etc/apt/sources.list.d/google-chrome.list \
    && apt-get update && apt-get install -y --no-install-recommends google-chrome-stable \
    && apt-get purge -y --auto-remove wget gnupg \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

# Non-root user for Chrome
RUN groupadd -r chrome && useradd -r -g chrome -G audio,video chrome
RUN mkdir -p /data/browser-profile && chown -R chrome:chrome /data

COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

USER chrome

EXPOSE 9222

ENTRYPOINT ["/entrypoint.sh"]
