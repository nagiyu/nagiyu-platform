FROM mcr.microsoft.com/devcontainers/typescript-node:1-22-bullseye

USER node

# Install Playwright browsers
RUN npm exec --workspace tools -- playwright install --with-deps chromium webkit

# Note: Claude CLI installation removed due to security concerns with curl | bash pattern.
# If Claude CLI is required, please install it manually or use a verified package manager.
# See: https://docs.anthropic.com/claude/docs/cli for alternative installation methods.
