# ベースイメージ: Playwright公式イメージ（ブラウザ含む）
FROM mcr.microsoft.com/playwright:v1.57.0-jammy AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体のpackage.jsonとソースをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/niconico-mylist-assistant/core ./services/niconico-mylist-assistant/core/
COPY services/niconico-mylist-assistant/batch ./services/niconico-mylist-assistant/batch/

# 依存関係をインストール（ソースコード存在下で実行）
# lockファイルが不完全な場合はinstallで解決
RUN npm install || npm ci

# モノレポのルートからビルド（共通ライブラリも含めて）
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/browser
RUN npm run build --workspace=@nagiyu/niconico-mylist-assistant-core
RUN npm run build --workspace=@nagiyu/niconico-mylist-assistant-batch

# 実行ステージ
FROM base AS runner
WORKDIR /app

ENV NODE_ENV=production

# モノレポのルートnode_modulesをコピー（依存関係のホイスティングに対応）
COPY --from=builder /app/node_modules ./node_modules

# 必要なビルド成果物とpackage.jsonをコピー
COPY --from=builder /app/package*.json ./

# 共通ライブラリ
COPY --from=builder /app/libs/common/package*.json ./libs/common/
COPY --from=builder /app/libs/common/dist ./libs/common/dist

# ブラウザライブラリ
COPY --from=builder /app/libs/browser/package*.json ./libs/browser/
COPY --from=builder /app/libs/browser/dist ./libs/browser/dist

# Core パッケージ
COPY --from=builder /app/services/niconico-mylist-assistant/core/package*.json ./services/niconico-mylist-assistant/core/
COPY --from=builder /app/services/niconico-mylist-assistant/core/dist ./services/niconico-mylist-assistant/core/dist

# Batch パッケージ
COPY --from=builder /app/services/niconico-mylist-assistant/batch/package*.json ./services/niconico-mylist-assistant/batch/
COPY --from=builder /app/services/niconico-mylist-assistant/batch/dist ./services/niconico-mylist-assistant/batch/dist

# エントリーポイント
CMD ["node", "services/niconico-mylist-assistant/batch/dist/index.js"]
