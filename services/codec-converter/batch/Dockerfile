# ベースイメージ: Node.js 22 on Debian (FFmpeg含む)
# Debian ベースの方がパッケージ管理が安定している
FROM node:22-slim AS base

# FFmpegのインストール
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# 作業ディレクトリの作成
WORKDIR /app

# ビルドステージ
FROM base AS builder

# 依存関係をインストール (workspace個別にインストール)
COPY services/codec-converter/core/package*.json ./services/codec-converter/core/
WORKDIR /app/services/codec-converter/core
RUN npm config set strict-ssl false && npm install

# Batch の依存関係をインストール
WORKDIR /app
COPY services/codec-converter/batch/package*.json ./services/codec-converter/batch/
WORKDIR /app/services/codec-converter/batch
RUN npm config set strict-ssl false && npm install

# ソースコードをコピー
WORKDIR /app
COPY services/codec-converter/core ./services/codec-converter/core/
COPY services/codec-converter/batch ./services/codec-converter/batch/
COPY configs ./configs/

# 共通パッケージをビルド
WORKDIR /app/services/codec-converter/core
RUN npm run build

# ワーカーをビルド
WORKDIR /app/services/codec-converter/batch
RUN npm run build

# 実行ステージ
FROM base AS runner

WORKDIR /app

# Production dependencies のみをインストール
COPY services/codec-converter/core/package*.json ./services/codec-converter/core/
WORKDIR /app/services/codec-converter/core
RUN npm config set strict-ssl false && npm install --omit=dev

WORKDIR /app
COPY services/codec-converter/batch/package*.json ./services/codec-converter/batch/
WORKDIR /app/services/codec-converter/batch
RUN npm config set strict-ssl false && npm install --omit=dev

# ビルド成果物をコピー
WORKDIR /app
COPY --from=builder /app/services/codec-converter/core/dist ./services/codec-converter/core/dist
COPY --from=builder /app/services/codec-converter/batch/dist ./services/codec-converter/batch/dist

# 一時ファイル用ディレクトリを作成
RUN mkdir -p /tmp && chmod 1777 /tmp

# 環境変数
ENV NODE_ENV=production

# ワーカースクリプトを実行
CMD ["node", "services/codec-converter/batch/dist/src/index.js"]
