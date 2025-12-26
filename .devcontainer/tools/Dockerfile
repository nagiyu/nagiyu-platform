FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bullseye

USER node

# Install Playwright browsers
RUN npm exec --workspace tools -- playwright install --with-deps chromium webkit

RUN curl -fsSL https://claude.ai/install.sh | bash
