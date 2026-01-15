# ベースイメージ
FROM node:22-alpine AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体のファイルをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/stock-tracker/core ./services/stock-tracker/core/
COPY services/stock-tracker/web ./services/stock-tracker/web/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# モノレポのルートからビルド（共通ライブラリも含めて）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=libs/common
RUN npm run build --workspace=libs/browser
RUN npm run build --workspace=libs/ui
RUN npm run build --workspace=stock-tracker-core || echo "Core package not ready yet, skipping"
RUN npm run build --workspace=stock-tracker-web

# 本番ステージ
FROM base AS runner
WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Lambda Web Adapter のバイナリをコピー
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Next.js が生成した standalone ビルドをコピー
# standaloneには必要な依存関係とserver.jsが全て含まれている
COPY --from=builder /app/services/stock-tracker/web/.next/standalone ./

# publicとstaticは別途コピーが必要
COPY --from=builder /app/services/stock-tracker/web/public ./services/stock-tracker/web/public
COPY --from=builder /app/services/stock-tracker/web/.next/static ./services/stock-tracker/web/.next/static

# アプリケーションを起動
CMD ["node", "services/stock-tracker/web/server.js"]
