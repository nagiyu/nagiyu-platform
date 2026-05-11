# Multi-stage build for Admin Batch Lambda (alarm-ingest, stream-handler)
# AWS Lambda 公式 Node.js 24 ベースイメージを使用

FROM public.ecr.aws/lambda/nodejs:24 AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体の package.json とソースをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/admin ./services/admin/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# 共通ライブラリ → admin-core → admin-batch の順にビルド
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/aws
RUN npm run build --workspace=@nagiyu/admin-core
RUN npm run build --workspace=@nagiyu/admin-batch

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

# Admin Core
COPY --from=builder /app/services/admin/core/package*.json ./services/admin/core/
COPY --from=builder /app/services/admin/core/dist ./services/admin/core/dist

# Admin Batch
COPY --from=builder /app/services/admin/batch/package*.json ./services/admin/batch/
COPY --from=builder /app/services/admin/batch/dist ./services/admin/batch/dist

# Lambda ハンドラーは CDK 側で個別の `cmd` で上書きする
# - alarm-ingest:    services/admin/batch/dist/src/alarm-ingest.handler
# - stream-handler:  services/admin/batch/dist/src/stream-handler.handler
CMD ["services/admin/batch/dist/src/alarm-ingest.handler"]
