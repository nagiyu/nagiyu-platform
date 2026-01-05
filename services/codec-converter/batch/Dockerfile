# ベースイメージ: Node.js 22 on Debian (FFmpeg含む)
FROM node:22-slim AS base

# FFmpegのインストール
RUN apt-get update && \
    apt-get install -y ffmpeg && \
    rm -rf /var/lib/apt/lists/*

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体のpackage.jsonとソースをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/tools ./services/tools/
COPY services/codec-converter ./services/codec-converter/

# 依存関係をインストール（ソースコード存在下で実行）
# npm ci fails with "Exit handler never called" in Docker build environment
# Using npm install as workaround - still respects package-lock.json
RUN npm install --prefer-offline --no-audit

# モノレポのルートからビルド（共通ライブラリも含めて）
RUN npm run build --workspace=codec-converter-core
RUN npm run build --workspace=codec-converter-batch

# 実行ステージ
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# モノレポのルートnode_modulesをコピー（依存関係のホイスティングに対応）
COPY --from=builder /app/node_modules ./node_modules

# 必要なビルド成果物とpackage.jsonをコピー
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/services/codec-converter/core/package*.json ./services/codec-converter/core/
COPY --from=builder /app/services/codec-converter/core/dist ./services/codec-converter/core/dist
COPY --from=builder /app/services/codec-converter/batch/package*.json ./services/codec-converter/batch/
COPY --from=builder /app/services/codec-converter/batch/dist ./services/codec-converter/batch/dist

# 一時ファイル用ディレクトリを作成
RUN mkdir -p /tmp && chmod 1777 /tmp

# ワーカースクリプトを実行
CMD ["node", "services/codec-converter/batch/dist/src/index.js"]
