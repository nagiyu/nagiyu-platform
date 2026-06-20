# Multi-stage build for dev-sync Batch Lambda（汎用 DynamoDB 同期）
# AWS Lambda 公式 Node.js 24 ベースイメージを使用

FROM public.ecr.aws/lambda/nodejs:24 AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体の package.json とソースをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/dev-sync ./services/dev-sync/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# 共通ライブラリ → dev-sync-batch の順にビルド（core は無し）
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/aws
RUN npm run build --workspace=@nagiyu/dev-sync-batch

# 実行ステージ
FROM base AS runner
WORKDIR ${LAMBDA_TASK_ROOT}

ENV NODE_ENV=production

# モノレポのルート node_modules をコピー（ホイスティング対応）
COPY --from=builder /app/node_modules ./node_modules

# 必要なビルド成果物と package.json をコピー
COPY --from=builder /app/package*.json ./

# 共通ライブラリ
COPY --from=builder /app/libs/common/package*.json ./libs/common/
COPY --from=builder /app/libs/common/dist ./libs/common/dist

# AWS ライブラリ
COPY --from=builder /app/libs/aws/package*.json ./libs/aws/
COPY --from=builder /app/libs/aws/dist ./libs/aws/dist

# dev-sync Batch
COPY --from=builder /app/services/dev-sync/batch/package*.json ./services/dev-sync/batch/
COPY --from=builder /app/services/dev-sync/batch/dist ./services/dev-sync/batch/dist

# Lambda ハンドラーは CDK 側の cmd で上書き可能
# - sync-handler: services/dev-sync/batch/dist/src/sync-handler.handler
CMD ["services/dev-sync/batch/dist/src/sync-handler.handler"]
