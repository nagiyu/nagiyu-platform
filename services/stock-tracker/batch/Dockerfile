# Multi-stage build for Stock Tracker Batch Lambda
# Node.js 22 on Debian (matching codec-converter pattern)

# ベースイメージ
FROM node:22-slim AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体のpackage.jsonとソースをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/stock-tracker ./services/stock-tracker/

# 依存関係をインストール（ソースコード存在下で実行）
# npm ci fails with "Exit handler never called" in Docker build environment
# Using npm install as workaround - still respects package-lock.json
RUN npm install --prefer-offline --no-audit

# モノレポのルートからビルド（共通ライブラリも含めて）
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/stock-tracker-core
RUN npm run build --workspace=@nagiyu/stock-tracker-batch

# 実行ステージ
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# モノレポのルートnode_modulesをコピー（依存関係のホイスティングに対応）
COPY --from=builder /app/node_modules ./node_modules

# 必要なビルド成果物とpackage.jsonをコピー
COPY --from=builder /app/package*.json ./

# 共通ライブラリ
COPY --from=builder /app/libs/common/package*.json ./libs/common/
COPY --from=builder /app/libs/common/dist ./libs/common/dist

# Core パッケージ
COPY --from=builder /app/services/stock-tracker/core/package*.json ./services/stock-tracker/core/
COPY --from=builder /app/services/stock-tracker/core/dist ./services/stock-tracker/core/dist

# Batch パッケージ
COPY --from=builder /app/services/stock-tracker/batch/package*.json ./services/stock-tracker/batch/
COPY --from=builder /app/services/stock-tracker/batch/dist ./services/stock-tracker/batch/dist

# Lambda handler entry point
# Lambda will invoke the handler function from the specified module
# Format: <file>.<function> (e.g., minute.handler)
CMD ["node", "services/stock-tracker/batch/dist/src/minute.js"]
