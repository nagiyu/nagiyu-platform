# ベースイメージ: Node.js 20 Alpine (FFmpeg含む)
FROM node:20-alpine AS base

# FFmpegのインストール (edge/community リポジトリから)
RUN apk add --no-cache --repository=https://dl-cdn.alpinelinux.org/alpine/edge/community ffmpeg

# 作業ディレクトリの作成
WORKDIR /app

# ビルドステージ
FROM base AS builder

# モノレポのパッケージファイルをコピー
COPY package*.json ./
COPY services/codec-converter/batch/package*.json ./services/codec-converter/batch/
COPY services/codec-converter/core/package*.json ./services/codec-converter/core/

# 依存関係をインストール
RUN npm ci --workspace=codec-converter-batch \
    --workspace=codec-converter-core

# ソースコードをコピー
COPY services/codec-converter/core ./services/codec-converter/core/
COPY services/codec-converter/batch ./services/codec-converter/batch/
COPY configs ./configs/

# 共通パッケージをビルド
RUN npm run build --workspace=codec-converter-core

# ワーカーをビルド
RUN npm run build --workspace=codec-converter-batch

# 実行ステージ
FROM base AS runner

WORKDIR /app

# Node.js production dependencies のみをインストール
COPY package*.json ./
COPY services/codec-converter/batch/package*.json ./services/codec-converter/batch/
COPY services/codec-converter/core/package*.json ./services/codec-converter/core/

RUN npm ci --workspace=codec-converter-batch \
    --workspace=codec-converter-core \
    --omit=dev

# ビルド成果物をコピー
COPY --from=builder /app/services/codec-converter/core/dist ./services/codec-converter/core/dist
COPY --from=builder /app/services/codec-converter/batch/dist ./services/codec-converter/batch/dist

# 一時ファイル用ディレクトリを作成
RUN mkdir -p /tmp && chmod 1777 /tmp

# 環境変数
ENV NODE_ENV=production

# ワーカースクリプトを実行
CMD ["node", "services/codec-converter/batch/dist/src/index.js"]
