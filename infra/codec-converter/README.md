# Codec Converter Infrastructure

This CDK stack defines the infrastructure for the Codec Converter service.

## Architecture

- **Lambda Function**: Next.js application running in a Docker container
- **CloudFront Distribution**: CDN for serving the application with caching
- **S3 Bucket**: Storage for input/output video files
- **DynamoDB Table**: Job management and tracking

## Prerequisites

Before deploying this stack, ensure:

1. **ECR Repository**: Create an ECR repository for the Lambda container image:
   ```bash
   aws ecr create-repository --repository-name codec-converter-dev --region us-east-1
   ```

2. **Docker Image**: Build and push the Next.js application Docker image to ECR:
   ```bash
   cd ../../services/codec-converter
   # Build the Docker image with Lambda Web Adapter
   docker build -t codec-converter:latest .
   
   # Tag and push to ECR
   aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com
   docker tag codec-converter:latest <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/codec-converter-dev:latest
   docker push <ACCOUNT_ID>.dkr.ecr.us-east-1.amazonaws.com/codec-converter-dev:latest
   ```

## Building

Install dependencies and compile TypeScript:

```bash
npm install
npm run build
```

## Testing

Run unit tests:

```bash
npm test
```

## Deployment

### Development Environment

```bash
# Synthesize CloudFormation template
npx cdk synth

# Deploy to dev environment
npx cdk deploy --context env=dev
```

### Production Environment

```bash
# Deploy to prod environment
npx cdk deploy --context env=prod --context ecrRepositoryName=codec-converter-prod
```

## Configuration

The stack accepts the following context parameters:

- `env`: Environment name (default: `dev`)
- `ecrRepositoryName`: ECR repository name (default: `codec-converter-{env}`)
- `imageTag`: Docker image tag to deploy (default: `latest`)
- `allowedOrigin`: CORS allowed origin for S3 (default: `https://codec-converter.nagiyu.com`)

Example with custom configuration:

```bash
npx cdk deploy \
  --context env=staging \
  --context ecrRepositoryName=codec-converter-staging \
  --context imageTag=v1.2.3 \
  --context allowedOrigin=https://staging.codec-converter.nagiyu.com
```

## Stack Outputs

After deployment, the stack exports the following values:

- `CodecConverterStorageBucket-{env}`: S3 bucket name
- `CodecConverterJobsTable-{env}`: DynamoDB table name
- `CodecConverterLambdaFunctionArn-{env}`: Lambda function ARN
- `CodecConverterLambdaFunctionUrl-{env}`: Lambda Function URL
- `CodecConverterCloudFrontDistributionId-{env}`: CloudFront distribution ID
- `CodecConverterCloudFrontDomainName-{env}`: CloudFront domain name

## Lambda Configuration

- **Memory**: 1024 MB
- **Timeout**: 30 seconds
- **Runtime**: Docker container image
- **Environment Variables**:
  - `DYNAMODB_TABLE`: DynamoDB table name
  - `S3_BUCKET`: S3 bucket name
  - `AWS_REGION`: Automatically provided by Lambda runtime

## CloudFront Behaviors

- **Default**: No caching, all HTTP methods, compressed
- `/api/*`: No caching, all HTTP methods
- `/_next/static/*`: Cached for 1 year, compressed
- `/favicon.ico`: Cached for 1 day, compressed

## Lambda Web Adapter

The Lambda function uses [Lambda Web Adapter](https://github.com/awslabs/aws-lambda-web-adapter) to run the Next.js application. The adapter must be included in the Docker image (layers are not supported for container images).

Example Dockerfile:

```dockerfile
FROM public.ecr.aws/docker/library/node:20-slim AS base

# Install Lambda Web Adapter
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:0.8.4 /lambda-adapter /opt/extensions/lambda-adapter

# ... rest of your Dockerfile
```

## Notes

- The ECR repository must exist before deploying the Lambda function
- Custom domain and ACM certificate will be added in a future phase
- Batch job queue and definition environment variables will be added when Batch resources are created
- S3 lifecycle policy automatically deletes files after 24 hours
- DynamoDB uses TTL with `expiresAt` attribute for automatic cleanup
