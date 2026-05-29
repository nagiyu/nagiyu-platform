# Multi-stage build for LiveTalk Batch Lambda
# AWS Lambda 公式 Node.js 24 ベースイメージを使用

# ベースイメージ
FROM public.ecr.aws/lambda/nodejs:24 AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体のpackage.jsonとソースをコピー
COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/livetalk ./services/livetalk/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# モノレポのルートからビルド（共通ライブラリも含めて）
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/aws
RUN npm run build --workspace=@nagiyu/livetalk-core
RUN npm run build --workspace=@nagiyu/livetalk-batch

# 実行ステージ
FROM base AS runner
WORKDIR ${LAMBDA_TASK_ROOT}

ENV NODE_ENV=production

# モノレポのルートnode_modulesをコピー（依存関係のホイスティングに対応）
COPY --from=builder /app/node_modules ./node_modules

# 必要なビルド成果物とpackage.jsonをコピー
COPY --from=builder /app/package*.json ./

# 共通ライブラリ
COPY --from=builder /app/libs/common/package*.json ./libs/common/
COPY --from=builder /app/libs/common/dist ./libs/common/dist

# AWS ライブラリ
COPY --from=builder /app/libs/aws/package*.json ./libs/aws/
COPY --from=builder /app/libs/aws/dist ./libs/aws/dist

# Core パッケージ
COPY --from=builder /app/services/livetalk/core/package*.json ./services/livetalk/core/
COPY --from=builder /app/services/livetalk/core/dist ./services/livetalk/core/dist

# Batch パッケージ
COPY --from=builder /app/services/livetalk/batch/package*.json ./services/livetalk/batch/
COPY --from=builder /app/services/livetalk/batch/dist ./services/livetalk/batch/dist

# Lambda ハンドラーを指定（<モジュールパス>.<エクスポート名>）
# Lambda ランタイムはハンドラ文字列を最初のドットで分割するため、
# ファイル名にドットを含めない（compress-conversations.ts → handler export）。
# CMD は CDK の cmd オプションで上書きされる。
CMD ["services/livetalk/batch/dist/src/handlers/compress-conversations.handler"]
