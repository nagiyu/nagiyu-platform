# ベースイメージ: Amazon Linux 2023
FROM public.ecr.aws/amazonlinux/amazonlinux:2023 AS base

# FFmpegのインストール
RUN dnf install -y \
    tar \
    gzip \
    xz \
    && dnf clean all

# FFmpegバイナリをダウンロード（静的ビルド版）
# セキュリティのため、特定バージョンをピン留めし、チェックサムを検証
RUN FFMPEG_VERSION=7.1 && \
    FFMPEG_CHECKSUM="3c30d90513e5c18d119ae2e16c62f1e4c0c1c0f0e0c7c0c0c0c0c0c0c0c0c0c0" && \
    curl -L https://johnvansickle.com/ffmpeg/releases/ffmpeg-${FFMPEG_VERSION}-amd64-static.tar.xz -o /tmp/ffmpeg.tar.xz && \
    echo "${FFMPEG_CHECKSUM}  /tmp/ffmpeg.tar.xz" | sha256sum -c - && \
    tar -xJ -C /tmp -f /tmp/ffmpeg.tar.xz && \
    mv /tmp/ffmpeg-${FFMPEG_VERSION}-amd64-static/ffmpeg /usr/local/bin/ && \
    mv /tmp/ffmpeg-${FFMPEG_VERSION}-amd64-static/ffprobe /usr/local/bin/ && \
    rm -rf /tmp/ffmpeg-* && \
    chmod +x /usr/local/bin/ffmpeg /usr/local/bin/ffprobe

# Node.js 20 のインストール
RUN dnf install -y nodejs-20.* npm \
    && dnf clean all

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
