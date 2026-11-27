# Multi-stage build for LiveTalk Batch Lambda
# AWS Lambda 公式 Node.js 26 ベースイメージを使用

# ベースイメージ
FROM public.ecr.aws/lambda/nodejs:26 AS base

# ビルドステージ
FROM base AS builder
WORKDIR /app

# モノレポ全体のpackage.jsonとソースをコピー
COPY package*.json ./
COPY configs ./configs/
COPY services/livetalk ./services/livetalk/

# 依存関係をインストール（ソースコード存在下で実行）
RUN npm ci

# モノレポのルートからビルド
RUN npm run build --workspace=@nagiyu/livetalk-core
RUN npm run build --workspace=@nagiyu/livetalk-batch

# ほかのサービスと版が違う依存は、ルートに巻き上げられず各パッケージの node_modules に入る。
# 版がそろってディレクトリができないときも COPY が失敗しないよう、先に作っておく
RUN mkdir -p services/livetalk/core/node_modules services/livetalk/batch/node_modules

# 実行ステージ
FROM base AS runner
WORKDIR ${LAMBDA_TASK_ROOT}

ENV NODE_ENV=production

# モノレポのルートnode_modulesをコピー（依存関係のホイスティングに対応）
COPY --from=builder /app/node_modules ./node_modules

# 必要なビルド成果物とpackage.jsonをコピー
COPY --from=builder /app/package*.json ./

# Core パッケージ
COPY --from=builder /app/services/livetalk/core/package*.json ./services/livetalk/core/
COPY --from=builder /app/services/livetalk/core/dist ./services/livetalk/core/dist
COPY --from=builder /app/services/livetalk/core/node_modules ./services/livetalk/core/node_modules

# Batch パッケージ
COPY --from=builder /app/services/livetalk/batch/package*.json ./services/livetalk/batch/
COPY --from=builder /app/services/livetalk/batch/dist ./services/livetalk/batch/dist
COPY --from=builder /app/services/livetalk/batch/node_modules ./services/livetalk/batch/node_modules

# Lambda ハンドラーを指定（<モジュールパス>.<エクスポート名>）
# Lambda ランタイムはハンドラ文字列を最初のドットで分割するため、
# ファイル名にドットを含めない（compress-conversations.ts → handler export）。
# CMD は CDK の cmd オプションで上書きされる。
CMD ["services/livetalk/batch/dist/src/handlers/compress-conversations.handler"]
