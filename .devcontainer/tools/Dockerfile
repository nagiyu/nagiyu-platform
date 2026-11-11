FROM mcr.microsoft.com/devcontainers/javascript-node:26-bookworm

USER node

# Install Playwright browsers
RUN npm exec --workspace @nagiyu/tools -- playwright install --with-deps chromium webkit

RUN curl -fsSL https://claude.ai/install.sh | bash
