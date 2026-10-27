# ベースイメージ
FROM node:24-alpine AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# ビルド引数を受け取る
ARG APP_VERSION=1.0.0
ENV APP_VERSION=${APP_VERSION}

# デプロイ先環境（dev / prod）。SSG のプリレンダリングがビルド時に環境を参照するため、ビルド前に必要
ARG NAGIYU_ENV=
ENV NAGIYU_ENV=${NAGIYU_ENV}

# モノレポ全体のファイルをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/portal/web ./services/portal/web/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# 共通ライブラリ、web の順にビルドする
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build:libs
RUN npm run build --workspace=@nagiyu/portal-web

# 本番ステージ
FROM base AS runner
WORKDIR /app

# ヘルスチェック用に curl をインストール
RUN apk add --no-cache curl

# builder ステージの ARG は引き継がれないため再宣言する
ARG NAGIYU_ENV=

# Lambda Web Adapter のバイナリをコピー
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
# 動的レンダリングされるルートでもビルド時と同じ判定になるようにする
ENV NAGIYU_ENV=${NAGIYU_ENV}
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Next.js が生成した standalone ビルドをコピー
# standalone には必要な依存関係と server.js が全て含まれている
COPY --from=builder /app/services/portal/web/.next/standalone ./

# public と static は別途コピーが必要
COPY --from=builder /app/services/portal/web/public ./services/portal/web/public
COPY --from=builder /app/services/portal/web/.next/static ./services/portal/web/.next/static

# アプリケーションを起動
CMD ["node", "services/portal/web/server.js"]
