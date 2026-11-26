# Multi-stage build for dev-sync Batch Lambda（汎用 DynamoDB 同期）
# AWS Lambda 公式 Node.js 26 ベースイメージを使用

FROM public.ecr.aws/lambda/nodejs:26 AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体の package.json とソースをコピー
COPY package*.json ./
COPY configs ./configs/
COPY services/dev-sync ./services/dev-sync/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# dev-sync-batch をビルド（core は無し）
RUN npm run build --workspace=@nagiyu/dev-sync-batch

# 実行ステージ
FROM base AS runner
WORKDIR ${LAMBDA_TASK_ROOT}

ENV NODE_ENV=production

# モノレポのルート node_modules をコピー（ホイスティング対応）
COPY --from=builder /app/node_modules ./node_modules

# 必要なビルド成果物と package.json をコピー
COPY --from=builder /app/package*.json ./

# dev-sync Batch
COPY --from=builder /app/services/dev-sync/batch/package*.json ./services/dev-sync/batch/
COPY --from=builder /app/services/dev-sync/batch/dist ./services/dev-sync/batch/dist

# Lambda ハンドラーは CDK 側の cmd で上書き可能
# - sync-handler: services/dev-sync/batch/dist/src/sync-handler.handler
CMD ["services/dev-sync/batch/dist/src/sync-handler.handler"]
