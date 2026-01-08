FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bullseye

# Install Playwright dependencies as root
USER root

# Install Playwright system dependencies
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    # Chromium dependencies
    libnss3 \
    libnspr4 \
    libatk1.0-0 \
    libatk-bridge2.0-0 \
    libcups2 \
    libdrm2 \
    libdbus-1-3 \
    libxkbcommon0 \
    libatspi2.0-0 \
    libx11-6 \
    libxcomposite1 \
    libxdamage1 \
    libxext6 \
    libxfixes3 \
    libxrandr2 \
    libgbm1 \
    libpango-1.0-0 \
    libcairo2 \
    libasound2 \
    libxshmfence1 \
    # Additional utilities
    && rm -rf /var/lib/apt/lists/*

# Switch back to node user
USER node

# Install Claude CLI
RUN curl -fsSL https://claude.ai/install.sh | bash

# Install Playwright Chromium browser
# Using npx to download the specific version used in the project
RUN npx --yes playwright@1.57.0 install chromium
