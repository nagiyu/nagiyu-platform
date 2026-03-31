FROM node:24-slim AS base

FROM base AS builder
WORKDIR /app

COPY package*.json ./
COPY configs ./configs/
COPY services/quick-clip ./services/quick-clip/

RUN npm ci
RUN npm run build --workspace=@nagiyu/quick-clip-core
RUN npm run build --workspace=@nagiyu/quick-clip-lambda-clip

FROM public.ecr.aws/lambda/nodejs:24 AS runner
WORKDIR ${LAMBDA_TASK_ROOT}

RUN dnf install -y ffmpeg && dnf clean all

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/services/quick-clip/core/package*.json ./services/quick-clip/core/
COPY --from=builder /app/services/quick-clip/core/dist ./services/quick-clip/core/dist
COPY --from=builder /app/services/quick-clip/lambda/clip/package*.json ./services/quick-clip/lambda/clip/
COPY --from=builder /app/services/quick-clip/lambda/clip/dist ./services/quick-clip/lambda/clip/dist

CMD ["services/quick-clip/lambda/clip/dist/src/handler.handler"]
