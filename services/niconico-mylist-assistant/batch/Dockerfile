FROM mcr.microsoft.com/playwright:v1.57.0-jammy

WORKDIR /app

# 依存関係のコピーとインストール
COPY package*.json ./
RUN npm ci --only=production

# ソースコードのコピー
COPY dist ./dist

# エントリーポイント
CMD ["node", "dist/src/index.js"]
