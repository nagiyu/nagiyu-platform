# 実行ステージ（Playwright環境のみ使用）
FROM mcr.microsoft.com/playwright:v1.57.0-jammy
WORKDIR /app

ENV NODE_ENV=production

# ルートの package.json をコピー
COPY package*.json ./

# 設定ファイルをコピー
COPY configs ./configs/

# ホストからビルド済みの node_modules をコピー（CI/CD環境で事前にインストールされている前提）
COPY node_modules ./node_modules/

# ビルド済みの共通ライブラリをコピー
COPY libs/common/package.json ./libs/common/
COPY libs/common/dist ./libs/common/dist/
COPY libs/browser/package.json ./libs/browser/
COPY libs/browser/dist ./libs/browser/dist/

# ビルド済みのcoreをコピー
COPY services/niconico-mylist-assistant/core/package.json ./services/niconico-mylist-assistant/core/
COPY services/niconico-mylist-assistant/core/dist ./services/niconico-mylist-assistant/core/dist/

# ビルド済みのbatchをコピー
COPY services/niconico-mylist-assistant/batch/package.json ./services/niconico-mylist-assistant/batch/
COPY services/niconico-mylist-assistant/batch/dist ./services/niconico-mylist-assistant/batch/dist/

# エントリーポイント
CMD ["node", "services/niconico-mylist-assistant/batch/dist/index.js"]
