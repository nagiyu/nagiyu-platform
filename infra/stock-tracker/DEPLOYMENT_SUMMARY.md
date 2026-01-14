# Stock Tracker Infrastructure Deployment Summary

## Overview

This document summarizes the CDK infrastructure implementation for the Stock Tracker service, completed as part of Task 0.1 from the roadmap.

## Implementation Status: ✅ COMPLETE

All required infrastructure components have been successfully implemented and validated.

### Acceptance Criteria Status

- ✅ `npm run deploy -w @nagiyu/infra-stock-tracker -- --context env=dev` ready (syntax validated)
- ✅ DynamoDB table `nagiyu-stock-tracker-main-dev` configured
- ✅ Lambda functions 4つ (Web + Batch × 3) configured
- ✅ EventBridge rules 3つ configured
- ✅ All stacks synthesize successfully with `cdk synth`

## Infrastructure Components

### 1. Secrets Stack ✅
**Purpose**: Manages VAPID keys for Web Push notifications

**Resources**:
- Secrets Manager secret: `nagiyu-stock-tracker-vapid-{env}`
- Initial value: PLACEHOLDER (to be replaced manually after deployment)

**Stack Name**: `NagiyuStockTrackerSecrets{Dev|Prod}`

### 2. ECR Stack ✅
**Purpose**: Container image repositories for Lambda functions

**Resources**:
- Web Lambda repository: `stock-tracker-web-{env}`
- Batch Lambda repository: `stock-tracker-batch-{env}`
- Lifecycle policy: Keep last 10 images
- Image scanning: Enabled

**Stack Name**: `NagiyuStockTrackerECR{Dev|Prod}`

### 3. DynamoDB Stack ✅
**Purpose**: Single Table Design for all entities

**Resources**:
- Table: `nagiyu-stock-tracker-main-{env}`
- Billing: On-Demand (Pay-per-Request)
- PITR: Enabled (35 days)
- Encryption: AWS Managed
- GSIs:
  - **UserIndex** (GSI1): User-specific data queries
  - **AlertIndex** (GSI2): Batch processing by frequency
  - **ExchangeTickerIndex** (GSI3): Tickers by exchange

**Stack Name**: `NagiyuStockTrackerDynamoDB{Dev|Prod}`

### 4. SNS Stack ✅
**Purpose**: Notification channel for CloudWatch Alarms

**Resources**:
- Topic: `nagiyu-stock-tracker-alarms-{env}`

**Stack Name**: `NagiyuStockTrackerSNS{Dev|Prod}`

### 5. Lambda Stack ✅
**Purpose**: Application runtime (Web + Batch processing)

**Resources**:
- **Web Function**: `stock-tracker-web-{env}`
  - Memory: 1024 MB
  - Timeout: 30 seconds
  - Function URL: Enabled (HTTPS)
  - Runtime: Node.js 20.x (FROM_IMAGE)

- **Batch Minute Function**: `stock-tracker-batch-minute-{env}`
  - Memory: 512 MB
  - Timeout: 50 seconds
  - Handler: `minute.handler`

- **Batch Hourly Function**: `stock-tracker-batch-hourly-{env}`
  - Memory: 512 MB
  - Timeout: 5 minutes
  - Handler: `hourly.handler`

- **Batch Daily Function**: `stock-tracker-batch-daily-{env}`
  - Memory: 512 MB
  - Timeout: 10 minutes
  - Handler: `daily.handler`

- **IAM Roles**:
  - Web execution role: DynamoDB read/write, Secrets Manager read
  - Batch execution role: DynamoDB query/scan/update, Secrets Manager read

**Stack Name**: `NagiyuStockTrackerLambda{Dev|Prod}`

### 6. CloudFront Stack ✅
**Purpose**: CDN distribution for content delivery

**Resources**:
- Distribution with custom domain
- Origin: Lambda Function URL
- Cache: Disabled (SSR support)
- HTTPS: Enforced with redirect
- Certificate: Shared ACM wildcard certificate (*.nagiyu.com)

**Domains**:
- Dev: `dev-stock-tracker.nagiyu.com`
- Prod: `stock-tracker.nagiyu.com`

**Stack Name**: `NagiyuStockTrackerCloudFront{Dev|Prod}`

### 7. EventBridge Stack ✅
**Purpose**: Batch processing scheduler

**Resources**:
- **Minute Rule**: `stock-tracker-batch-minute-{env}`
  - Schedule: Every 1 minute
  - Target: Batch Minute Function

- **Hourly Rule**: `stock-tracker-batch-hourly-{env}`
  - Schedule: Every 1 hour
  - Target: Batch Hourly Function

- **Daily Rule**: `stock-tracker-batch-daily-{env}`
  - Schedule: Daily at 0:00 UTC
  - Target: Batch Daily Function

**Stack Name**: `NagiyuStockTrackerEventBridge{Dev|Prod}`

### 8. CloudWatch Alarms Stack ✅
**Purpose**: Monitoring and alerting

**Total Alarms**: 13

**Lambda Web Alarms** (3):
- Error rate > 5%
- Duration > 20 seconds
- Throttling detected

**Lambda Batch Minute Alarms** (3):
- Error rate > 10%
- Duration > 40 seconds
- Throttling detected

**Lambda Batch Hourly Alarms** (3):
- Error rate > 10%
- Duration > 4 minutes
- Throttling detected

**Lambda Batch Daily Alarms** (3):
- Error rate > 10%
- Duration > 8 minutes
- Throttling detected

**DynamoDB Alarms** (2):
- Read throttle events
- Write throttle events

All alarms notify SNS topic: `nagiyu-stock-tracker-alarms-{env}`

**Stack Name**: `NagiyuStockTrackerAlarms{Dev|Prod}`

## Deployment Order

The stacks have built-in dependencies, but the recommended deployment order is:

1. **Secrets Stack** (independent)
2. **ECR Stack** (independent)
3. **DynamoDB Stack** (independent)
4. **SNS Stack** (independent)
5. **Lambda Stack** (depends on: Secrets, ECR, DynamoDB)
6. **CloudFront Stack** (depends on: Lambda)
7. **EventBridge Stack** (depends on: Lambda)
8. **CloudWatch Alarms Stack** (depends on: Lambda, DynamoDB, SNS)

## Validation Results

### CDK Synthesis ✅
```bash
$ npm run synth -- --context env=dev
Successfully synthesized to .../cdk.out
```

### Generated Templates ✅
- 8 CloudFormation templates generated
- All templates are valid JSON
- All resource dependencies are correctly configured

### Type Checking ✅
```bash
$ npm run build
Compiled successfully with no errors
```

## Next Steps (Manual Deployment)

### 1. Bootstrap CDK (if not already done)
```bash
cd infra/stock-tracker
npm run bootstrap
```

### 2. Deploy Infrastructure

#### Step 1: Deploy Secrets Stack
```bash
npm run deploy -- NagiyuStockTrackerSecretsDev --context env=dev
```

#### Step 2: Generate and Upload VAPID Keys
```bash
# Generate VAPID keys
npx web-push generate-vapid-keys

# Output:
# Public Key: BNcRd...
# Private Key: tBHI...

# Update Secrets Manager via AWS Console:
# 1. Navigate to nagiyu-stock-tracker-vapid-dev
# 2. Replace PLACEHOLDER with:
# {
#   "publicKey": "BNcRd...",
#   "privateKey": "tBHI..."
# }
```

#### Step 3: Deploy ECR Stack
```bash
npm run deploy -- NagiyuStockTrackerECRDev --context env=dev
```

#### Step 4: Build and Push Docker Images
```bash
# ECR login
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com

# Build and push Web image
docker build -t stock-tracker-web:latest -f services/stock-tracker/web/Dockerfile .
docker tag stock-tracker-web:latest ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/stock-tracker-web-dev:latest
docker push ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/stock-tracker-web-dev:latest

# Build and push Batch image
docker build -t stock-tracker-batch:latest -f services/stock-tracker/batch/Dockerfile .
docker tag stock-tracker-batch:latest ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/stock-tracker-batch-dev:latest
docker push ${ACCOUNT_ID}.dkr.ecr.us-east-1.amazonaws.com/stock-tracker-batch-dev:latest
```

#### Step 5: Deploy All Remaining Stacks
```bash
npm run deploy -- --context env=dev --all
```

#### Step 6: Configure SNS Email Subscription
```bash
aws sns subscribe \
  --topic-arn arn:aws:sns:us-east-1:<ACCOUNT_ID>:nagiyu-stock-tracker-alarms-dev \
  --protocol email \
  --notification-endpoint your-email@example.com

# Confirm subscription via email
```

#### Step 7: Verify Deployment
```bash
# Check Lambda functions
aws lambda get-function --function-name stock-tracker-web-dev

# Check DynamoDB table
aws dynamodb describe-table --table-name nagiyu-stock-tracker-main-dev

# Check EventBridge rules
aws events list-rules --name-prefix stock-tracker-batch

# Test health check
curl https://dev-stock-tracker.nagiyu.com/api/health
```

## Environment Variables

### Web Lambda
- `NODE_ENV`: production
- `DYNAMODB_TABLE_NAME`: nagiyu-stock-tracker-main-{env}
- `VAPID_PUBLIC_KEY`: From Secrets Manager
- `VAPID_PRIVATE_KEY`: From Secrets Manager
- `AUTH_URL`: https://auth.nagiyu.com (prod) or https://dev-auth.nagiyu.com (dev)
- `NEXT_PUBLIC_AUTH_URL`: Same as AUTH_URL
- `APP_URL`: https://stock-tracker.nagiyu.com (prod) or https://dev-stock-tracker.nagiyu.com (dev)
- `AUTH_SECRET`: From Secrets Manager (optional)

### Batch Lambda
- `NODE_ENV`: production
- `DYNAMODB_TABLE_NAME`: nagiyu-stock-tracker-main-{env}
- `BATCH_TYPE`: MINUTE | HOURLY | DAILY
- `VAPID_PUBLIC_KEY`: From Secrets Manager
- `VAPID_PRIVATE_KEY`: From Secrets Manager

## Cost Estimation (Dev Environment)

**Monthly Estimate** (Phase 1, low traffic):

| Service | Usage | Cost |
|---------|-------|------|
| Lambda (Web) | 10,000 requests/month | ~$0.20 |
| Lambda (Batch) | ~44,640 invocations/month | ~$0.50 |
| DynamoDB | On-Demand, <1M requests | ~$1.25 |
| CloudFront | <1GB transfer | Free tier |
| ECR | <500MB storage | Free tier |
| Secrets Manager | 2 secrets | ~$0.80 |
| CloudWatch Logs | <5GB | ~$2.50 |
| SNS | <1,000 notifications | Free tier |
| EventBridge | <1M events | Free tier |

**Total**: ~$5-10/month

## Security Notes

1. **Secrets Management**: VAPID keys stored in AWS Secrets Manager, never in code
2. **IAM**: Minimal permissions following least privilege principle
3. **Encryption**: DynamoDB encrypted at rest with AWS managed keys
4. **HTTPS**: Enforced at CloudFront level with TLS 1.2+
5. **X-Ray Tracing**: Enabled for all Lambda functions for security monitoring
6. **Resource Tags**: All resources tagged with Application, Service, Environment

## Known Limitations

1. **VAPID Keys**: Initial deployment creates PLACEHOLDER values that must be replaced manually
2. **Docker Images**: Must be built and pushed to ECR before Lambda deployment
3. **DNS Configuration**: Custom domain DNS records must be configured externally (not managed by CDK)
4. **NextAuth Secret**: Optional, requires separate deployment if not already available

## Related Documentation

- [Architecture Design](../../tasks/stock-tracker/architecture.md)
- [Deployment Manual](../../tasks/stock-tracker/deployment.md)
- [Roadmap](../../tasks/stock-tracker/roadmap.md)
- [Infrastructure README](./README.md)

## Support

For issues or questions:
1. Check CloudWatch Logs: `/aws/lambda/stock-tracker-*-{env}`
2. Review X-Ray traces for detailed execution flow
3. Verify environment variables are correctly set
4. Ensure ECR images are present and tagged correctly

---

**Implementation Date**: 2026-01-14
**Status**: ✅ Ready for Deployment
**Next Task**: Task 0.2 - VAPID キー生成と Secrets Manager 登録
