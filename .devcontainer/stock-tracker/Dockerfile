FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bullseye

USER node

RUN curl -fsSL https://claude.ai/install.sh | bash

RUN npx playwright install --with-deps chromium
