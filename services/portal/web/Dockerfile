# ベースイメージ
FROM node:24-alpine AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# ビルド引数を受け取る
ARG APP_VERSION=1.0.0
ENV APP_VERSION=${APP_VERSION}

# モノレポ全体のファイルをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/portal/web ./services/portal/web/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# モノレポのルートからビルド（共通ライブラリも含めて）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=libs/common
RUN npm run build --workspace=libs/browser
RUN npm run build --workspace=libs/ui
RUN npm run build --workspace=@nagiyu/portal-web

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
COPY --from=builder /app/services/portal/web/.next/standalone ./

# publicとstaticは別途コピーが必要
COPY --from=builder /app/services/portal/web/public ./services/portal/web/public
COPY --from=builder /app/services/portal/web/.next/static ./services/portal/web/.next/static

# アプリケーションを起動
CMD ["node", "services/portal/web/server.js"]
