---
title: 'Docker multi-stage build で Next.js standalone をスリム化する'
description: 'Next.js の standalone モードと Docker multi-stage build を組み合わせて、本番イメージサイズを最小化する手法を解説。Alpine ベース・依存最小化・ECR への push まで一連の流れを示します。'
slug: 'docker-multistage-nextjs'
publishedAt: '2026-04-05'
updatedAt: '2026-05-01'
author: 'なぎゆー'
tags: ['Docker', 'Next.js', 'CI/CD']
---

## はじめに

Next.js を ECS Fargate / Lambda コンテナ / Cloud Run などで動かすには Docker イメージを作ります。素直にやると数百 MB〜 1 GB を超えてしまい、push に時間がかかる・コールドスタートが遅い、という不満が出ます。multi-stage build と standalone モードを使えば **100 MB 前後**まで縮められます。

## standalone モードの有効化

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const config: NextConfig = {
  output: 'standalone',
};

export default config;
```

`next build` 後に `.next/standalone/` 配下に **必要な依存だけ含む実行可能ディレクトリ**が生成されます。`node server.js` で起動できるので、`next start` を経由せずに済みます。

## Dockerfile の構成

```dockerfile
# ============ 1) deps stage ============
FROM node:20-alpine AS deps
WORKDIR /app
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
RUN npm ci

# ============ 2) builder stage ============
FROM node:20-alpine AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
RUN npm run build

# ============ 3) runner stage ============
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# 非 root ユーザーで動かす
RUN addgroup --system --gid 1001 nodejs \
  && adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT=3000

CMD ["node", "server.js"]
```

3 つのステージに分けています:

1. **deps**: `package*.json` だけコピーして `npm ci`。Lock ファイルが変わらない限りキャッシュが効く
2. **builder**: ソースをコピーして `next build`。standalone 出力を生成
3. **runner**: 最終イメージ。`.next/standalone` と `public/` `.next/static` だけ持つ

最終イメージには `node_modules` が **standalone が必要なものだけ**含まれます。`next` 本体や開発依存は含まれません。

## モノレポでの Dockerfile

ワークスペース構成だと `npm ci` がモノレポ全体を必要とします。Dockerfile はリポジトリルートからビルドする想定にします。

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /repo
RUN apk add --no-cache libc6-compat
COPY package.json package-lock.json ./
COPY libs/ ./libs/
COPY services/portal/ ./services/portal/
RUN npm ci
RUN npm run build --workspace=@nagiyu/common
RUN npm run build --workspace=@nagiyu/ui
RUN npm run build --workspace=@nagiyu/portal-web

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /repo/services/portal/web/.next/standalone ./
COPY --from=builder /repo/services/portal/web/.next/static ./services/portal/web/.next/static
COPY --from=builder /repo/services/portal/web/public ./services/portal/web/public
EXPOSE 3000
CMD ["node", "services/portal/web/server.js"]
```

standalone はモノレポ構成でも `services/portal/web/server.js` のような相対パスで動きます。`COPY` 元のパスがやや読みづらくなりますが、最初に書ききれば後は触らなくて済みます。

## .dockerignore で送信コンテキストを削減

```
node_modules
.next
.git
.github
*.log
coverage/
playwright-report/
test-results/
**/*.test.ts
**/*.spec.ts
```

`.dockerignore` を整備しないと、ローカルの `node_modules` まで Docker daemon に転送されてビルドが遅くなります。**送信コンテキスト 50 MB 以下**を目標にすると速度差が体感できます。

## イメージサイズの実測

| 構成                                     | サイズ        |
| ---------------------------------------- | ------------- |
| `next start` ベース（deps + ソース全部） | 約 800 MB     |
| standalone のみ                          | 約 200 MB     |
| standalone + alpine + multi-stage        | **約 120 MB** |

リポジトリ規模やライブラリ数で変動しますが、目安としてこのレンジに収まります。

## ECR への push

```yaml
# .github/workflows/portal-deploy.yml の抜粋
- name: Login to Amazon ECR
  uses: aws-actions/amazon-ecr-login@v2

- name: Build and push
  env:
    REGISTRY: ${{ steps.login-ecr.outputs.registry }}
    IMAGE: nagiyu-portal
    TAG: ${{ github.sha }}
  run: |
    docker build -t $REGISTRY/$IMAGE:$TAG -f services/portal/web/Dockerfile .
    docker push $REGISTRY/$IMAGE:$TAG
    docker tag $REGISTRY/$IMAGE:$TAG $REGISTRY/$IMAGE:latest
    docker push $REGISTRY/$IMAGE:latest
```

`docker build` の context が `.`（リポジトリルート）なのがポイント。Dockerfile 内で `services/portal/web/...` のような相対パスを使えるようになります。

## BuildKit のキャッシュ

GitHub Actions では `actions/cache` ではなく Docker BuildKit のキャッシュを使うとさらに速くなります。

```yaml
- uses: docker/setup-buildx-action@v3
- uses: docker/build-push-action@v5
  with:
    context: .
    file: services/portal/web/Dockerfile
    push: true
    tags: ${{ env.REGISTRY }}/${{ env.IMAGE }}:${{ env.TAG }}
    cache-from: type=gha
    cache-to: type=gha,mode=max
```

`cache-from: type=gha` で GitHub Actions のキャッシュにレイヤーを保存。2 回目以降のビルドは数十秒短縮できます。

## ハマりどころ

- **`libc6-compat` の不足**: 一部の Node.js native モジュール（`@node-rs/argon2` など）が alpine で動かない。最終手段は `node:20-bookworm-slim` に切り替え。
- **`output: 'standalone'` を忘れる**: `.next/standalone` が生成されず、Dockerfile の COPY が失敗する。
- **`public` ディレクトリの copy 漏れ**: standalone には含まれない。最終ステージで明示的に copy する。
- **`dist` 系のビルド成果物を `.dockerignore` で除外**: 共有ライブラリの `dist/` を除外すると、コンテナ内で再ビルドが必要になる。除外対象を慎重に選ぶ。
- **タイムゾーン**: alpine はデフォルトで UTC。`tzdata` を入れて `TZ=Asia/Tokyo` を設定するかは要件次第。

## まとめ

`output: 'standalone'` + multi-stage build + alpine の組み合わせで、Next.js の本番イメージは小さく速く作れます。`.dockerignore` の整備と BuildKit キャッシュを足せば、CI のビルド時間とイメージ push の時間が大きく改善します。本番運用するならまず最初に整えておきたい構成です。
