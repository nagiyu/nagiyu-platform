# ワーカー用 Dockerfile
# TypeScript で処理を書けるベースイメージを使用し、ビルド時に FFmpeg をインストール

FROM node:22-bullseye

# FFmpeg と必要なコーデックライブラリをインストール
# H.264 (libx264), VP9 (libvpx-vp9), AV1 (libaom-av1) をサポート
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
    ffmpeg \
    libx264-dev \
    libvpx-dev \
    libaom-dev \
    && rm -rf /var/lib/apt/lists/*

# 作業ディレクトリを作成
WORKDIR /app

# アプリケーションコードをすべてコピー
COPY . .

# 依存関係をインストールしてTypeScript をビルド
RUN npm install && npm run build

# entrypoint.sh に実行権限を付与
RUN chmod +x /app/entrypoint.sh

# 非ルートユーザーを作成してセキュリティを向上
RUN groupadd -r worker && useradd -r -g worker -u 1001 worker

# 一時作業ディレクトリを作成し、権限を付与
RUN mkdir -p /tmp/worker && chown -R worker:worker /tmp/worker /app

# 非ルートユーザーに切り替え
USER worker

# エントリポイントスクリプトを実行
ENTRYPOINT ["/app/entrypoint.sh"]
