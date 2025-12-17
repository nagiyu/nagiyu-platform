# ベースイメージ
FROM node:22-alpine AS base

# 依存関係のインストールステージ
FROM base AS deps
WORKDIR /app

# 依存関係ファイルのコピー
COPY package*.json ./
RUN npm ci

# ビルドステージ
FROM base AS builder
WORKDIR /app

# 依存関係と全ファイルをコピー
COPY --from=deps /app/node_modules ./node_modules
COPY . .

# Next.js アプリケーションをビルド
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# 本番ステージ
FROM base AS runner
WORKDIR /app

# Lambda Web Adapter のバイナリをコピー
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

# Next.js が生成した standalone ビルドをコピー
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

# アプリケーションを起動
CMD ["node", "server.js"]
