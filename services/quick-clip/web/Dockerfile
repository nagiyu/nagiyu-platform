FROM node:24-alpine AS base

FROM base AS builder
WORKDIR /app

ARG APP_VERSION=0.1.0
ENV APP_VERSION=${APP_VERSION}

ARG NEXT_PUBLIC_VAST_TAG_URL
ENV NEXT_PUBLIC_VAST_TAG_URL=${NEXT_PUBLIC_VAST_TAG_URL}

COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/quick-clip ./services/quick-clip/

RUN npm ci
RUN npm install --save-optional @next/swc-linux-x64-musl

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/browser
RUN npm run build --workspace=@nagiyu/react
RUN npm run build --workspace=@nagiyu/nextjs
RUN npm run build --workspace=@nagiyu/ui
RUN npm run build --workspace=@nagiyu/quick-clip-core
RUN npm run build --workspace=@nagiyu/quick-clip-web

FROM base AS runner
WORKDIR /app

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/services/quick-clip/web/.next/standalone ./
COPY --from=builder /app/services/quick-clip/web/public ./services/quick-clip/web/public
COPY --from=builder /app/services/quick-clip/web/.next/static ./services/quick-clip/web/.next/static

CMD ["node", "services/quick-clip/web/server.js"]
