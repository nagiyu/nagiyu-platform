# ベースイメージ
FROM node:22-alpine AS base

# 依存関係のインストールステージ
FROM base AS deps
WORKDIR /app

# モノレポのルートからpackage.jsonとpackage-lock.jsonをコピー
# ビルドコンテキストはリポジトリルート
COPY package*.json ./
# toolsサービスのpackage.jsonもコピー
COPY services/tools/package.json ./services/tools/
# 共通ライブラリのpackage.jsonもコピー
COPY libs/common/package.json ./libs/common/
COPY libs/browser/package.json ./libs/browser/
COPY libs/ui/package.json ./libs/ui/

# モノレポ全体の依存関係をインストール
# npm ci はワークスペースで問題があるため npm install を使用
RUN npm install

# ビルドステージ
FROM base AS builder
WORKDIR /app

# 依存関係をコピー
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/services/tools/node_modules ./services/tools/node_modules

# モノレポのルート設定をコピー
COPY package*.json ./
COPY .prettierrc ./

# 共通設定ファイルをコピー
COPY configs ./configs/

# 共通ライブラリをコピー
COPY libs ./libs/

# 共通ライブラリをビルド
WORKDIR /app/libs/common
RUN npm run build
WORKDIR /app/libs/browser
RUN npm run build
WORKDIR /app/libs/ui
RUN npm run build

# toolsサービスのファイルをコピー
COPY services/tools ./services/tools/

# Next.js アプリケーションをビルド
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /app/services/tools
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
# standaloneには必要な依存関係とserver.jsが全て含まれている
COPY --from=builder /app/services/tools/.next/standalone ./

# publicとstaticは別途コピーが必要
COPY --from=builder /app/services/tools/public ./services/tools/public
COPY --from=builder /app/services/tools/.next/static ./services/tools/.next/static

# アプリケーションを起動
CMD ["node", "services/tools/server.js"]
