FROM node:22-alpine AS base

FROM base AS builder
WORKDIR /app

ARG APP_VERSION=1.0.0
ENV APP_VERSION=${APP_VERSION}

RUN apk add --no-cache libc6-compat

COPY package*.json ./
COPY configs ./configs/
COPY libs ./libs/
COPY services/share-together ./services/share-together/

RUN npm ci
RUN npm install --save-optional @next/swc-linux-x64-musl

ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/browser
RUN npm run build --workspace=@nagiyu/ui
RUN npm run build --workspace=@nagiyu/nextjs
RUN npm run build --workspace=@nagiyu/aws
RUN npm run build --workspace=@nagiyu/share-together-core
RUN npm run build --workspace=@nagiyu/share-together-web

FROM base AS runner
WORKDIR /app

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.9.1 /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000

COPY --from=builder /app/services/share-together/web/.next/standalone ./
COPY --from=builder /app/services/share-together/web/public ./services/share-together/web/public
COPY --from=builder /app/services/share-together/web/.next/static ./services/share-together/web/.next/static

CMD ["node", "services/share-together/web/server.js"]
