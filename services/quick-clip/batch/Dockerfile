FROM node:24-slim AS base

FROM base AS builder
WORKDIR /app

COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/quick-clip ./services/quick-clip/

RUN npm install --prefer-offline --no-audit
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/quick-clip-core
RUN npm run build --workspace=@nagiyu/quick-clip-batch

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg \
  && rm -rf /var/lib/apt/lists/*

COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/libs/common/package*.json ./libs/common/
COPY --from=builder /app/libs/common/dist ./libs/common/dist
COPY --from=builder /app/services/quick-clip/core/package*.json ./services/quick-clip/core/
COPY --from=builder /app/services/quick-clip/core/dist ./services/quick-clip/core/dist
COPY --from=builder /app/services/quick-clip/batch/package*.json ./services/quick-clip/batch/
COPY --from=builder /app/services/quick-clip/batch/dist ./services/quick-clip/batch/dist

CMD ["node", "services/quick-clip/batch/dist/src/index.js"]
