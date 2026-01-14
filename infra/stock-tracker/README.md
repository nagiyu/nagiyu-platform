# Stock Tracker Infrastructure

This directory contains the AWS CDK infrastructure definitions for the Stock Tracker service.

## Architecture

The infrastructure consists of the following stacks:

1. **SecretsStack**: Manages VAPID keys for Web Push notifications in AWS Secrets Manager
2. **EcrStack**: Creates ECR repositories for Web and Batch Lambda Docker images
3. **DynamoDBStack**: Provisions a DynamoDB table with Single Table Design and 3 GSIs
4. **SNSStack**: Creates SNS topic for CloudWatch Alarms notifications
5. **LambdaStack**: Deploys 4 Lambda functions (1 Web + 3 Batch)
6. **CloudFrontStack**: Sets up CloudFront distribution for CDN delivery
7. **EventBridgeStack**: Configures EventBridge Scheduler rules for batch processing
8. **CloudWatchAlarmsStack**: Creates 13 CloudWatch Alarms for monitoring

## Stack Resources

### Secrets Manager
- `nagiyu-stock-tracker-vapid-{env}`: VAPID key pair for Web Push (initially PLACEHOLDER)

### ECR Repositories
- `stock-tracker-web-{env}`: Web Lambda container images
- `stock-tracker-batch-{env}`: Batch Lambda container images

### DynamoDB Table
- `nagiyu-stock-tracker-main-{env}`: Single Table Design
  - GSI1 (UserIndex): User-specific data queries
  - GSI2 (AlertIndex): Batch processing queries by frequency
  - GSI3 (ExchangeTickerIndex): Tickers by exchange

### Lambda Functions
- `stock-tracker-web-{env}`: Next.js application (1024 MB, 30s timeout)
- `stock-tracker-batch-minute-{env}`: MINUTE_LEVEL alerts (512 MB, 50s timeout)
- `stock-tracker-batch-hourly-{env}`: HOURLY_LEVEL alerts (512 MB, 5m timeout)
- `stock-tracker-batch-daily-{env}`: Daily cleanup (512 MB, 10m timeout)

### EventBridge Rules
- `stock-tracker-batch-minute-{env}`: Triggers every 1 minute
- `stock-tracker-batch-hourly-{env}`: Triggers every 1 hour
- `stock-tracker-batch-daily-{env}`: Triggers daily at 0:00 UTC

### CloudWatch Alarms (13 total)
- Lambda Web: Error rate, Duration, Throttling
- Lambda Batch Minute: Error rate, Duration, Throttling
- Lambda Batch Hourly: Error rate, Duration, Throttling
- Lambda Batch Daily: Error rate, Duration, Throttling
- DynamoDB: Read throttle, Write throttle

### SNS Topic
- `nagiyu-stock-tracker-alarms-{env}`: Receives alarm notifications

## Prerequisites

- AWS CLI configured with appropriate credentials
- Node.js >= 22.0.0
- npm >= 10.0.0
- Docker (for building container images)

## Deployment

### Initial Setup

1. **Bootstrap CDK** (if not already done):
```bash
npm run bootstrap
```

2. **Deploy Secrets Stack** (creates Secrets Manager resources with PLACEHOLDER):
```bash
npm run deploy -- NagiyuStockTrackerSecretsDev --context env=dev
```

3. **Generate and Upload VAPID Keys**:
```bash
# Generate VAPID keys
npx web-push generate-vapid-keys

# Manually update Secrets Manager via AWS Console
# Navigate to: nagiyu-stock-tracker-vapid-dev
# Replace PLACEHOLDER with actual keys in JSON format:
# {
#   "publicKey": "BNcRd...",
#   "privateKey": "tBHI..."
# }
```

4. **Deploy ECR Stack**:
```bash
npm run deploy -- NagiyuStockTrackerECRDev --context env=dev
```

5. **Build and Push Docker Images**:
```bash
# See deployment.md for detailed instructions
# Build Web image
docker build -t stock-tracker-web:latest -f services/stock-tracker/web/Dockerfile .

# Build Batch image
docker build -t stock-tracker-batch:latest -f services/stock-tracker/batch/Dockerfile .

# Tag and push to ECR
# ... (see deployment.md)
```

6. **Deploy All Remaining Stacks**:
```bash
npm run deploy -- --context env=dev --all
```

### Update Deployment

To update Lambda functions after code changes:

```bash
# Rebuild and push Docker images (see step 5 above)
# Then update Lambda functions
npm run deploy -- NagiyuStockTrackerLambdaDev --context env=dev
```

## Environment Variables

The Lambda functions are configured with the following environment variables:

### Web Lambda
- `NODE_ENV`: `production`
- `DYNAMODB_TABLE_NAME`: DynamoDB table name
- `VAPID_PUBLIC_KEY`: From Secrets Manager
- `VAPID_PRIVATE_KEY`: From Secrets Manager
- `AUTH_URL`: Auth service URL
- `NEXT_PUBLIC_AUTH_URL`: Client-side auth URL
- `APP_URL`: Stock Tracker URL
- `AUTH_SECRET`: NextAuth secret (optional, from Secrets Manager)

### Batch Lambda
- `NODE_ENV`: `production`
- `DYNAMODB_TABLE_NAME`: DynamoDB table name
- `BATCH_TYPE`: `MINUTE` | `HOURLY` | `DAILY`
- `VAPID_PUBLIC_KEY`: From Secrets Manager
- `VAPID_PRIVATE_KEY`: From Secrets Manager

## CloudFormation Exports

Each stack exports key resource identifiers for cross-stack references:

- `{StackName}-VapidSecretArn`
- `{StackName}-WebRepositoryUri`
- `{StackName}-BatchRepositoryUri`
- `{StackName}-TableName`
- `{StackName}-WebFunctionArn`
- `{StackName}-FunctionUrl`
- `{StackName}-AlarmTopicArn`
- And more...

## Useful Commands

- `npm run build` - Compile TypeScript to JavaScript
- `npm run watch` - Watch for changes and compile
- `npm run synth` - Synthesize CloudFormation template
- `npm run deploy` - Deploy stack(s) to AWS
- `npm run diff` - Compare deployed stack with current state
- `npm run destroy` - Remove stack(s) from AWS

## Context Parameters

- `env`: Environment (dev | prod) - **Required**
- `authSecretArn`: NextAuth Secret ARN - Optional

Example:
```bash
npm run deploy -- --context env=dev --context authSecretArn=arn:aws:secretsmanager:...
```

## Security Notes

1. **VAPID Keys**: Stored in Secrets Manager, not in code or environment variables directly
2. **IAM Roles**: Minimal permissions following principle of least privilege
3. **Encryption**: DynamoDB uses AWS managed encryption at rest
4. **HTTPS Only**: CloudFront enforces HTTPS with TLS 1.2+
5. **X-Ray Tracing**: Enabled for all Lambda functions for security monitoring

## Related Documentation

- [Architecture Design](../../tasks/stock-tracker/architecture.md)
- [Deployment Guide](../../tasks/stock-tracker/deployment.md)
- [API Specification](../../tasks/stock-tracker/api-spec.md)
- [Testing Strategy](../../tasks/stock-tracker/testing.md)

## Troubleshooting

### CDK Synthesis Fails
- Ensure `@nagiyu/infra-common` is built: `cd ../common && npm run build`
- Check TypeScript compilation: `npm run build`

### Deployment Fails
- Verify AWS credentials are configured
- Check for sufficient IAM permissions
- Ensure ECR repositories exist and contain images (for Lambda stack)
- Verify VAPID keys are set in Secrets Manager (not PLACEHOLDER)

### Lambda Function Errors
- Check CloudWatch Logs: `/aws/lambda/stock-tracker-*-{env}`
- Verify environment variables are set correctly
- Ensure DynamoDB table exists and is accessible
- Check X-Ray traces for detailed execution flow

## Support

For issues or questions, refer to the main project documentation or contact the platform team.
