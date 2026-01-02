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
WORKDIR /app

# モノレポ全体のファイルをコピー（ワークスペース解決に必要）
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/

# 他のワークスペースのpackage.jsonをコピー（npm ci のワークスペース解決に必要）
COPY services/tools/package*.json ./services/tools/
COPY services/codec-converter/web/package*.json ./services/codec-converter/web/

# codec-converterのソースをコピー
COPY services/codec-converter/core ./services/codec-converter/core/
COPY services/codec-converter/batch ./services/codec-converter/batch/

# 依存関係をインストール（モノレポのワークスペース機能を使用）
# SSL証明書エラー回避とnpm問題対策
RUN npm config set strict-ssl false && \
    npm config set fetch-timeout 300000 && \
    npm config set fetch-retries 5 && \
    npm install

# モノレポのルートからビルド（共通ライブラリも含めて）
RUN npm run build --workspace=codec-converter-core
RUN npm run build --workspace=codec-converter-batch

# 実行ステージ
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# ビルド成果物とnode_modulesをコピー
COPY --from=builder /app/services/codec-converter/core/dist ./services/codec-converter/core/dist
COPY --from=builder /app/services/codec-converter/core/node_modules ./services/codec-converter/core/node_modules
COPY --from=builder /app/services/codec-converter/batch/dist ./services/codec-converter/batch/dist
COPY --from=builder /app/services/codec-converter/batch/node_modules ./services/codec-converter/batch/node_modules

# package.jsonもコピー（実行時に必要な場合があるため）
COPY --from=builder /app/services/codec-converter/core/package*.json ./services/codec-converter/core/
COPY --from=builder /app/services/codec-converter/batch/package*.json ./services/codec-converter/batch/

# 一時ファイル用ディレクトリを作成
RUN mkdir -p /tmp && chmod 1777 /tmp

# ワーカースクリプトを実行
CMD ["node", "services/codec-converter/batch/dist/src/index.js"]
