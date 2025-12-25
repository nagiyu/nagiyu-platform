# ベースイメージ
FROM node:22-alpine AS base

# 依存関係のインストールステージ
FROM base AS deps
WORKDIR /app

# モノレポ全体をコピー（package.jsonとlock file）
COPY package*.json ./
COPY services/tools/package.json ./services/tools/
COPY libs/common/package.json ./libs/common/
COPY libs/browser/package.json ./libs/browser/
COPY libs/ui/package.json ./libs/ui/

# モノレポ全体の依存関係をインストール
# Docker環境での問題回避のため、legacy-peer-depsを使用
RUN npm ci --legacy-peer-deps

# ビルドステージ
FROM base AS builder
WORKDIR /app

# 依存関係をコピー
COPY --from=deps /app/node_modules ./node_modules

# モノレポ全体のファイルをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/tools ./services/tools/

# モノレポのルートからビルド（共通ライブラリも含めて）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=libs/common
RUN npm run build --workspace=libs/browser
RUN npm run build --workspace=libs/ui
RUN npm run build --workspace=tools

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
COPY --from=builder /app/services/tools/.next/standalone ./

# publicとstaticは別途コピーが必要
COPY --from=builder /app/services/tools/public ./services/tools/public
COPY --from=builder /app/services/tools/.next/static ./services/tools/.next/static

# アプリケーションを起動
CMD ["node", "services/tools/server.js"]
