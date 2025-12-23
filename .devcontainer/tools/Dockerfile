FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bullseye

USER root

# Install Playwright system dependencies
RUN npx -y playwright install-deps chromium webkit

USER node

RUN curl -fsSL https://claude.ai/install.sh | bash
