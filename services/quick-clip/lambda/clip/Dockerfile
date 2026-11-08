FROM node:24-slim AS base

FROM base AS builder
WORKDIR /app

COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/quick-clip ./services/quick-clip/

RUN npm ci
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/aws
RUN npm run build --workspace=@nagiyu/quick-clip-core
RUN npm run build --workspace=@nagiyu/quick-clip-lambda-clip

FROM public.ecr.aws/lambda/nodejs:24 AS runner
WORKDIR ${LAMBDA_TASK_ROOT}

# ffmpeg は npm 経由ではなく、ビルド済みの静的バイナリのイメージから取り込む。
# npm のインストール時に外部 (GitHub のリリース) からバイナリを取得させると、
# その障害で全サービスの npm ci が失敗するため。
# タグだけでは差し替わりうるので、ダイジェストで固定する (マルチアーキの index)。
COPY --from=mwader/static-ffmpeg:6.1.1@sha256:a44cd22b260c527f54e99517186a209b805d0a2319e0886d356e840f62a72132 /ffmpeg /usr/local/bin/ffmpeg

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/libs/common/package*.json ./libs/common/
COPY --from=builder /app/libs/common/dist ./libs/common/dist
COPY --from=builder /app/libs/aws/package*.json ./libs/aws/
COPY --from=builder /app/libs/aws/dist ./libs/aws/dist
COPY --from=builder /app/services/quick-clip/core/package*.json ./services/quick-clip/core/
COPY --from=builder /app/services/quick-clip/core/dist ./services/quick-clip/core/dist
COPY --from=builder /app/services/quick-clip/lambda/clip/package*.json ./services/quick-clip/lambda/clip/
COPY --from=builder /app/services/quick-clip/lambda/clip/dist ./services/quick-clip/lambda/clip/dist

CMD ["services/quick-clip/lambda/clip/dist/src/handler.handler"]
