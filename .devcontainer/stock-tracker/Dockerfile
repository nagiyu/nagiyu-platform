FROM mcr.microsoft.com/devcontainers/javascript-node:26-bookworm

USER node

RUN curl -fsSL https://claude.ai/install.sh | bash

RUN npx playwright install --with-deps chromium
