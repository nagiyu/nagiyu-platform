# ベースイメージ
FROM node:22-alpine AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体のファイルをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/niconico-mylist-assistant/core ./services/niconico-mylist-assistant/core/
COPY services/niconico-mylist-assistant/web ./services/niconico-mylist-assistant/web/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# モノレポのルートからビルド（共通ライブラリも含めて）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/browser
RUN npm run build --workspace=@nagiyu/ui
RUN npm run build --workspace=@nagiyu/niconico-mylist-assistant-core
RUN npm run build --workspace=@nagiyu/niconico-mylist-assistant-web

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
COPY --from=builder /app/services/niconico-mylist-assistant/web/.next/standalone ./

# publicとstaticは別途コピーが必要
COPY --from=builder /app/services/niconico-mylist-assistant/web/public ./services/niconico-mylist-assistant/web/public
COPY --from=builder /app/services/niconico-mylist-assistant/web/.next/static ./services/niconico-mylist-assistant/web/.next/static

# アプリケーションを起動
CMD ["node", "services/niconico-mylist-assistant/web/server.js"]
