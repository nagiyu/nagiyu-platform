# ベースイメージ: Node.js 20 Alpine (FFmpeg含む)
FROM node:20-alpine AS base

# FFmpegのインストール
RUN apk add --no-cache ffmpeg

# 作業ディレクトリの作成
WORKDIR /app

# ビルドステージ
FROM base AS builder

# モノレポのパッケージファイルをコピー
COPY package*.json ./
COPY services/codec-converter-worker/package*.json ./services/codec-converter-worker/
COPY services/codec-converter-common/package*.json ./services/codec-converter-common/

# 依存関係をインストール
RUN npm ci --workspace=@nagiyu-platform/codec-converter-worker \
    --workspace=@nagiyu-platform/codec-converter-common

# ソースコードをコピー
COPY services/codec-converter-common ./services/codec-converter-common/
COPY services/codec-converter-worker ./services/codec-converter-worker/
COPY configs ./configs/

# 共通パッケージをビルド
RUN npm run build --workspace=@nagiyu-platform/codec-converter-common

# ワーカーをビルド
RUN npm run build --workspace=@nagiyu-platform/codec-converter-worker

# 実行ステージ
FROM base AS runner

WORKDIR /app

# Node.js production dependencies のみをインストール
COPY package*.json ./
COPY services/codec-converter-worker/package*.json ./services/codec-converter-worker/
COPY services/codec-converter-common/package*.json ./services/codec-converter-common/

RUN npm ci --workspace=@nagiyu-platform/codec-converter-worker \
    --workspace=@nagiyu-platform/codec-converter-common \
    --omit=dev

# ビルド成果物をコピー
COPY --from=builder /app/services/codec-converter-common/dist ./services/codec-converter-common/dist
COPY --from=builder /app/services/codec-converter-worker/dist ./services/codec-converter-worker/dist

# 一時ファイル用ディレクトリを作成
RUN mkdir -p /tmp && chmod 1777 /tmp

# 環境変数
ENV NODE_ENV=production

# ワーカースクリプトを実行
CMD ["node", "services/codec-converter-worker/dist/src/index.js"]
