# ベースイメージ
FROM node:24-alpine AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# ビルド引数を受け取る
ARG APP_VERSION=1.0.0
ENV APP_VERSION=${APP_VERSION}

RUN apk add --no-cache libc6-compat

# モノレポ全体のファイルをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/livetalk ./services/livetalk/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci
RUN npm install --save-optional @next/swc-linux-x64-musl

# モノレポのルートからビルド（共通ライブラリも含めて）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/browser
RUN npm run build --workspace=@nagiyu/ui
RUN npm run build --workspace=@nagiyu/nextjs
RUN npm run build --workspace=@nagiyu/aws
RUN npm run build --workspace=@nagiyu/livetalk-core
RUN npm run build --workspace=@nagiyu/livetalk-web

# 本番ステージ（ECS Fargate 上で直接 node server.js を起動する。
# Lambda Web Adapter は ECS では不要なので組み込まない）
FROM base AS runner
WORKDIR /app

# ヘルスチェック用に curl を入れておく
RUN apk add --no-cache curl

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Next.js が生成した standalone ビルドをコピー
COPY --from=builder /app/services/livetalk/web/.next/standalone ./
COPY --from=builder /app/services/livetalk/web/public ./services/livetalk/web/public
COPY --from=builder /app/services/livetalk/web/.next/static ./services/livetalk/web/.next/static

EXPOSE 3000

# Next.js standalone は server.js を直接 node で起動する（`next start` 相当）
CMD ["node", "services/livetalk/web/server.js"]
