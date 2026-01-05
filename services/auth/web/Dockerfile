# ベースイメージ
FROM node:22-alpine AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# Next.jsのSWCバイナリに必要なライブラリをインストール
RUN apk add --no-cache libc6-compat

# モノレポ全体のファイルをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/auth ./services/auth/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# Alpine用のSWCバイナリを明示的にインストール
RUN npm install --save-optional @next/swc-linux-x64-musl

# モノレポのルートからビルド（共通ライブラリも含めて）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/browser
RUN npm run build --workspace=@nagiyu/ui
RUN npm run build --workspace=@nagiyu/auth-core
RUN npm run build --workspace=@nagiyu/auth-web

# 本番ステージ
FROM base AS runner
WORKDIR /app

# Lambda Web Adapter のバイナリをコピー
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Next.js が生成した standalone ビルドをコピー
# standaloneには必要な依存関係とserver.jsが全て含まれている
COPY --from=builder /app/services/auth/.next/standalone ./

# publicとstaticは別途コピーが必要
COPY --from=builder /app/services/auth/public ./services/auth/public
COPY --from=builder /app/services/auth/.next/static ./services/auth/.next/static

# アプリケーションを起動
CMD ["node", "services/auth/server.js"]
