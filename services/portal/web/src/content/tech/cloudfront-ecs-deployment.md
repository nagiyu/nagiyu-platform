---
title: 'CloudFront+ECSでNext.jsをデプロイする構成解説'
description: 'CloudFront + ECS FargateでNext.jsをデプロイするAWS構成を解説。ECSサービス設定・ALB構成・CloudFrontディストリビューション・キャッシュ設定・GitHub ActionsでのCI/CDまで詳しく説明します。'
slug: 'cloudfront-ecs-deployment'
publishedAt: '2026-04-10'
tags: ['AWS', 'CloudFront', 'ECS', 'Next.js']
---

## はじめに

Next.js アプリケーションを本番環境にデプロイする際、AWS の CloudFront + ECS Fargate という構成は高可用性・スケーラビリティ・コスト効率を両立する優れた選択肢です。本記事では、nagiyu プラットフォームでも採用しているこのアーキテクチャの構成方法を解説します。

## アーキテクチャ概要

```
インターネット
    ↓
CloudFront Distribution（CDN・エッジキャッシュ）
    ↓
Application Load Balancer（ALB）
    ↓
ECS Fargate（Next.js コンテナ）
    ↓
各 AWS サービス（RDS・S3・DynamoDB など）
```

CloudFront を最前段に置くことで、静的アセットのキャッシュによるパフォーマンス向上と、グローバルエッジロケーションによる低レイテンシを実現します。

## Next.js の Dockerfile

まず Next.js アプリケーションの Dockerfile を作成します。スタンドアロンモードを使うことでイメージサイズを削減できます。

```dockerfile
FROM node:20-alpine AS base

# 依存関係のインストール
FROM base AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --only=production

# ビルド
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# 本番イメージ
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

COPY --from=builder /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /app/.next/static ./.next/static

USER nextjs
EXPOSE 3000
ENV PORT 3000

CMD ["node", "server.js"]
```

### next.config.ts の設定

```typescript
// next.config.ts
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: 'standalone', // スタンドアロンモードを有効化
  // CloudFront経由の場合のホスト設定
  async headers() {
    return [
      {
        source: '/_next/static/:path*',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=31536000, immutable',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
```

## ECS Fargate の設定

### タスク定義

```json
{
  "family": "nagiyu-portal",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "nextjs-app",
      "image": "123456789.dkr.ecr.ap-northeast-1.amazonaws.com/nagiyu-portal:latest",
      "portMappings": [
        {
          "containerPort": 3000,
          "protocol": "tcp"
        }
      ],
      "environment": [{ "name": "NODE_ENV", "value": "production" }],
      "secrets": [
        {
          "name": "DATABASE_URL",
          "valueFrom": "arn:aws:secretsmanager:ap-northeast-1:123456789:secret:prod/db-url"
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/nagiyu-portal",
          "awslogs-region": "ap-northeast-1",
          "awslogs-stream-prefix": "ecs"
        }
      },
      "healthCheck": {
        "command": ["CMD-SHELL", "curl -f http://localhost:3000/api/health || exit 1"],
        "interval": 30,
        "timeout": 5,
        "retries": 3
      }
    }
  ]
}
```

### ECS サービスの設定

```json
{
  "serviceName": "nagiyu-portal-service",
  "taskDefinition": "nagiyu-portal",
  "desiredCount": 2,
  "launchType": "FARGATE",
  "networkConfiguration": {
    "awsvpcConfiguration": {
      "subnets": ["subnet-private-1a", "subnet-private-1c"],
      "securityGroups": ["sg-ecs-tasks"],
      "assignPublicIp": "DISABLED"
    }
  },
  "loadBalancers": [
    {
      "targetGroupArn": "arn:aws:elasticloadbalancing:...",
      "containerName": "nextjs-app",
      "containerPort": 3000
    }
  ],
  "deploymentConfiguration": {
    "minimumHealthyPercent": 100,
    "maximumPercent": 200,
    "deploymentCircuitBreaker": {
      "enable": true,
      "rollback": true
    }
  }
}
```

## ALB（Application Load Balancer）の設定

```
リスナー: HTTPS（443）
  ↓
ターゲットグループ: ECS タスク（ポート 3000）
  ↓
ヘルスチェック: GET /api/health
```

ALB では以下の設定を行います。

- **スティッキーセッション**: 無効（Next.js はステートレスに設計）
- **アイドルタイムアウト**: 60 秒
- **アクセスログ**: S3 に保存（コスト分析・デバッグ用）

## CloudFront ディストリビューションの設定

### キャッシュ動作の設定

```
オリジン: ALB の DNS 名（HTTPS）

キャッシュビヘイビア:
1. /_next/static/*
   - キャッシュポリシー: CachingOptimized
   - TTL: 365日（コンテンツはハッシュ付きのため安全）

2. /images/*
   - キャッシュポリシー: CachingOptimized
   - TTL: 24時間

3. /* (デフォルト)
   - キャッシュポリシー: CachingDisabled（SSR/ISRページ用）
   - または TTL を短く設定（SSG ページは長めに設定可能）
   - オリジンリクエストポリシー: AllViewerExceptHostHeader
```

### CloudFormation（CDK）でのディストリビューション定義

```typescript
// infra/lib/cloudfront-stack.ts
import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import * as origins from 'aws-cdk-lib/aws-cloudfront-origins';

const distribution = new cloudfront.Distribution(this, 'PortalDistribution', {
  defaultBehavior: {
    origin: new origins.LoadBalancerV2Origin(alb, {
      protocolPolicy: cloudfront.OriginProtocolPolicy.HTTPS_ONLY,
    }),
    viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
    allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
  },
  additionalBehaviors: {
    '/_next/static/*': {
      origin: new origins.LoadBalancerV2Origin(alb),
      cachePolicy: cloudfront.CachePolicy.CACHING_OPTIMIZED,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
    },
  },
  domainNames: ['portal.nagiyu.com'],
  certificate: acmCertificate,
  httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
});
```

## GitHub Actions による CI/CD

```yaml
# .github/workflows/deploy-portal.yml
name: Deploy Portal

on:
  push:
    branches: [master]
    paths: ['services/portal/**']

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Configure AWS credentials
        uses: aws-actions/configure-aws-credentials@v4
        with:
          role-to-assume: arn:aws:iam::123456789:role/GitHubActionsRole
          aws-region: ap-northeast-1

      - name: Login to Amazon ECR
        id: login-ecr
        uses: aws-actions/amazon-ecr-login@v2

      - name: Build and push Docker image
        env:
          ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
          IMAGE_TAG: ${{ github.sha }}
        run: |
          docker build -t $ECR_REGISTRY/nagiyu-portal:$IMAGE_TAG \
            -f services/portal/web/Dockerfile services/portal/web
          docker push $ECR_REGISTRY/nagiyu-portal:$IMAGE_TAG
          docker tag $ECR_REGISTRY/nagiyu-portal:$IMAGE_TAG \
            $ECR_REGISTRY/nagiyu-portal:latest
          docker push $ECR_REGISTRY/nagiyu-portal:latest

      - name: Deploy to ECS
        run: |
          aws ecs update-service \
            --cluster nagiyu-cluster \
            --service nagiyu-portal-service \
            --force-new-deployment

      - name: Invalidate CloudFront cache
        run: |
          aws cloudfront create-invalidation \
            --distribution-id ${{ secrets.CLOUDFRONT_DISTRIBUTION_ID }} \
            --paths "/*"
```

## コストの考慮事項

### ECS Fargate のコスト

- CPU 0.5 vCPU × 2 タスク: 約 $15/月
- メモリ 1 GB × 2 タスク: 約 $5/月
- 合計: 約 $20/月（最小構成）

### CloudFront のコスト

- データ転送: 最初の 1 TB/月は無料（AWS Free Tier）
- リクエスト数: 最初の 1,000 万リクエスト/月は無料

スモールスタートのサービスであれば、CloudFront の料金は無料枠内に収まることが多く、主なコストは ECS Fargate です。

### コスト最適化のポイント

1. **スケジュールスケーリング**: 夜間・休日はタスク数を削減
2. **Spot タスク**: ECS Fargate Spot を使って最大 70% コスト削減
3. **適切なキャッシュ設定**: CloudFront のキャッシュを最大限活用してオリジンへのリクエストを削減

## まとめ

CloudFront + ECS Fargate の構成は、Next.js アプリケーションの本番デプロイに適した柔軟かつスケーラブルなアーキテクチャです。CloudFront による静的アセットのキャッシュ、ALB によるロードバランシング、ECS のコンテナデプロイ、GitHub Actions による自動デプロイという組み合わせで、信頼性の高い本番環境を構築できます。
