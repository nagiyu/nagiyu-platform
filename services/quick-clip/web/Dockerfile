# ベースイメージ
FROM node:24-alpine AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# ビルド引数を受け取る
ARG APP_VERSION=0.1.0
ENV APP_VERSION=${APP_VERSION}

# NEXT_PUBLIC_ の値はビルド時にクライアントコードへ埋め込まれるため、ビルド引数で渡す
ARG NEXT_PUBLIC_VAST_TAG_URL
ENV NEXT_PUBLIC_VAST_TAG_URL=${NEXT_PUBLIC_VAST_TAG_URL}

# モノレポ全体のファイルをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/quick-clip ./services/quick-clip/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# 共通ライブラリ、core、web の順にビルドする
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:libs
RUN npm run build --workspace=@nagiyu/quick-clip-core
RUN npm run build --workspace=@nagiyu/quick-clip-web

# 本番ステージ
FROM base AS runner
WORKDIR /app

# Lambda Web Adapter のバイナリをコピー
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Next.js が生成した standalone ビルドをコピー
# standalone には必要な依存関係と server.js が全て含まれている
COPY --from=builder /app/services/quick-clip/web/.next/standalone ./

# public と static は別途コピーが必要
COPY --from=builder /app/services/quick-clip/web/public ./services/quick-clip/web/public
COPY --from=builder /app/services/quick-clip/web/.next/static ./services/quick-clip/web/.next/static

# アプリケーションを起動
CMD ["node", "services/quick-clip/web/server.js"]
