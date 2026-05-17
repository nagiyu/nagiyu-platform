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
RUN npm run build --workspace=@nagiyu/quick-clip-lambda-zip

FROM public.ecr.aws/lambda/nodejs:24 AS runner
WORKDIR ${LAMBDA_TASK_ROOT}

ENV NODE_ENV=production

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/libs/common/package*.json ./libs/common/
COPY --from=builder /app/libs/common/dist ./libs/common/dist
COPY --from=builder /app/libs/aws/package*.json ./libs/aws/
COPY --from=builder /app/libs/aws/dist ./libs/aws/dist
COPY --from=builder /app/services/quick-clip/lambda/zip/package*.json ./services/quick-clip/lambda/zip/
COPY --from=builder /app/services/quick-clip/lambda/zip/dist ./services/quick-clip/lambda/zip/dist

CMD ["services/quick-clip/lambda/zip/dist/src/handler.handler"]
