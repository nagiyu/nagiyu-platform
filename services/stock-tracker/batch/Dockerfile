# Multi-stage build for Stock Tracker Batch Lambda
# AWS Lambda 公式 Node.js 22 ベースイメージを使用

# ベースイメージ
FROM public.ecr.aws/lambda/nodejs:22 AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体のpackage.jsonとソースをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/stock-tracker ./services/stock-tracker/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# モノレポのルートからビルド（共通ライブラリも含めて）
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=stock-tracker-core
RUN npm run build --workspace=stock-tracker-batch

# 実行ステージ
FROM base AS runner
WORKDIR ${LAMBDA_TASK_ROOT}

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

# Lambda ハンドラーを指定
# CMD は CDK の cmd オプションで上書きされる (例: services/stock-tracker/batch/dist/minute.handler)
CMD ["services/stock-tracker/batch/dist/minute.handler"]
