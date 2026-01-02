# ベースイメージ
FROM node:22-alpine AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体のファイルをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/codec-converter/core ./services/codec-converter/core/
COPY services/codec-converter/web ./services/codec-converter/web/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# モノレポのルートからビルド（共通ライブラリも含めて）
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=codec-converter-core
RUN npm run build --workspace=codec-converter-web

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
COPY --from=builder /app/services/codec-converter/web/.next/standalone ./

# publicとstaticは別途コピーが必要
COPY --from=builder /app/services/codec-converter/web/public ./services/codec-converter/web/public
COPY --from=builder /app/services/codec-converter/web/.next/static ./services/codec-converter/web/.next/static

# アプリケーションを起動
CMD ["node", "services/codec-converter/web/server.js"]
