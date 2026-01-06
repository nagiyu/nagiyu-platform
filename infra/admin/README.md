# Admin Service Infrastructure

AWS CDK infrastructure for the Admin service (Next.js application).

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         CloudFront                               │
│                  (admin-dev.nagiyu.com)                         │
│                                                                  │
│  • HTTPS redirect                                               │
│  • Security headers (HSTS, X-Frame-Options, etc.)              │
│  • Cache: DISABLED (management interface)                       │
│  • ACM Certificate (*.nagiyu.com)                              │
└────────────────────────┬────────────────────────────────────────┘
                         │
                         ▼
         ┌───────────────────────────────┐
         │    Lambda Function URL        │
         │   (nagiyu-admin-dev)         │
         │                               │
         │  • Runtime: Container Image   │
         │  • Memory: 512 MB             │
         │  • Timeout: 30 seconds        │
         │  • Architecture: ARM_64       │
         │  • CORS: Enabled              │
         └───────────┬───────────────────┘
                     │
                     ▼
         ┌───────────────────────────────┐
         │      ECR Repository           │
         │   (nagiyu-admin-dev)         │
         │                               │
         │  • Scan on push: Enabled      │
         │  • Lifecycle: Keep 10 images  │
         └───────────────────────────────┘
```

## Stacks

### 1. Admin Stack (Main)

Orchestrates the creation of the ECR stack.

**Stack ID**: `Admin-{env}`

### 2. ECR Stack

Creates an ECR repository for storing Docker images.

**Stack ID**: `Admin-ECR-{env}`

**Resources**:
- ECR Repository: `nagiyu-admin-{env}`
- Image scanning on push
- Lifecycle policy: Keep last 10 images
- Removal policy: DESTROY (dev), RETAIN (prod)

**Outputs**:
- `RepositoryUri`: ECR repository URI
- `RepositoryArn`: ECR repository ARN
- `RepositoryName`: ECR repository name

### 3. Lambda Stack

Creates a Lambda function that runs the Next.js application.

**Stack ID**: `Admin-Lambda-{env}`

**Resources**:
- Lambda Function: `nagiyu-admin-{env}`
  - Runtime: Container image from ECR
  - Memory: 512 MB
  - Timeout: 30 seconds
  - Architecture: ARM_64
- Lambda Function URL (with CORS)
- IAM Execution Role with Secrets Manager permissions

**Environment Variables**:
- `NODE_ENV`: Environment name (dev/prod)
- `NEXTAUTH_URL`: Auth service URL
- `NEXTAUTH_SECRET`: Placeholder (should be retrieved from Secrets Manager at runtime)
- `NEXT_PUBLIC_AUTH_URL`: Public Auth service URL

**IAM Permissions**:
- CloudWatch Logs (via AWSLambdaBasicExecutionRole)
- Secrets Manager: `GetSecretValue` for `nagiyu-auth-nextauth-secret-{env}`

**Outputs**:
- `FunctionName`: Lambda function name
- `FunctionArn`: Lambda function ARN
- `FunctionUrl`: Lambda function URL
- `RoleArn`: Lambda execution role ARN

### 4. CloudFront Stack

Creates a CloudFront distribution for the Admin service.

**Stack ID**: `Admin-CloudFront-{env}`

**Resources**:
- CloudFront Distribution
  - Domain: `admin-dev.nagiyu.com` (dev), `admin.nagiyu.com` (prod)
  - Origin: Lambda Function URL
  - Cache: DISABLED (management interface)
  - Security headers policy
- Response Headers Policy (HSTS, X-Frame-Options, etc.)

**Security Headers**:
- `Strict-Transport-Security`: max-age=63072000; includeSubDomains; preload
- `X-Content-Type-Options`: nosniff
- `X-Frame-Options`: DENY
- `X-XSS-Protection`: 1; mode=block
- `Referrer-Policy`: strict-origin-when-cross-origin

**Outputs**:
- `DistributionId`: CloudFront distribution ID
- `DistributionDomainName`: CloudFront distribution domain name
- `CustomDomainName`: Custom domain name (admin-dev.nagiyu.com)

## Prerequisites

1. AWS CDK CLI installed: `npm install -g aws-cdk`
2. AWS credentials configured
3. Shared ACM certificate (`*.nagiyu.com`) in us-east-1 region
4. Auth service Secrets Manager secret: `nagiyu-auth-nextauth-secret-{env}`

## Deployment

### 1. Deploy ECR Repository

```bash
cd infra/admin
npx cdk deploy Admin-ECR-dev --context env=dev
```

### 2. Build and Push Docker Image

```bash
# Build the Admin service Docker image
cd services/admin
docker build -t nagiyu-admin-dev .

# Tag and push to ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin {account-id}.dkr.ecr.us-east-1.amazonaws.com
docker tag nagiyu-admin-dev:latest {account-id}.dkr.ecr.us-east-1.amazonaws.com/nagiyu-admin-dev:latest
docker push {account-id}.dkr.ecr.us-east-1.amazonaws.com/nagiyu-admin-dev:latest
```

### 3. Deploy Lambda Function

```bash
cd infra/admin
npx cdk deploy Admin-Lambda-dev --context env=dev
```

### 4. Deploy CloudFront Distribution

```bash
cd infra/admin
npx cdk deploy Admin-CloudFront-dev --context env=dev
```

### 5. Configure Route 53

Add a CNAME record in Route 53:

```
Name: admin-dev.nagiyu.com
Type: CNAME
Value: {cloudfront-distribution-domain-name}
```

You can get the CloudFront distribution domain name from the stack output:

```bash
aws cloudformation describe-stacks --stack-name Admin-CloudFront-dev --query "Stacks[0].Outputs[?OutputKey=='DistributionDomainName'].OutputValue" --output text
```

## Verification

After deployment, verify the infrastructure:

1. **ECR Repository**:
   ```bash
   aws ecr describe-repositories --repository-names nagiyu-admin-dev
   ```

2. **Lambda Function**:
   ```bash
   aws lambda get-function --function-name nagiyu-admin-dev
   aws lambda get-function-url-config --function-name nagiyu-admin-dev
   ```

3. **CloudFront Distribution**:
   ```bash
   aws cloudfront list-distributions --query "DistributionList.Items[?Comment=='Admin Service Distribution (dev)']"
   ```

4. **Access the application**:
   ```bash
   curl -I https://admin-dev.nagiyu.com
   # Expected: 502/503 (application not deployed yet) or 200 (if deployed)
   ```

## Environment Variables

The Lambda function requires the following environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `NODE_ENV` | Environment name | `dev` or `prod` |
| `NEXTAUTH_URL` | Auth service URL | `https://dev-auth.nagiyu.com` |
| `NEXTAUTH_SECRET` | NextAuth secret (from Secrets Manager) | Retrieved at runtime |
| `NEXT_PUBLIC_AUTH_URL` | Public Auth service URL | `https://dev-auth.nagiyu.com` |

**Note**: `NEXTAUTH_SECRET` is a placeholder in the CDK configuration. The actual secret should be retrieved from AWS Secrets Manager (`nagiyu-auth-nextauth-secret-{env}`) at runtime by the Next.js application.

## Secrets Manager Integration

The Lambda function has read access to the following Secrets Manager secret:

```
arn:aws:secretsmanager:{region}:{account}:secret:nagiyu-auth-nextauth-secret-{env}-*
```

This secret is created by the Auth service and contains the NextAuth secret key used for JWT signing and verification.

## Cleanup

To destroy all stacks:

```bash
cd infra/admin
npx cdk destroy Admin-CloudFront-dev --context env=dev
npx cdk destroy Admin-Lambda-dev --context env=dev
npx cdk destroy Admin-ECR-dev --context env=dev
npx cdk destroy Admin-dev --context env=dev
```

**Warning**: This will delete all resources. ECR images will be deleted if the removal policy is set to DESTROY.

## Differences from Auth Service

| Aspect | Admin Service | Auth Service |
|--------|---------------|--------------|
| **DynamoDB** | ❌ Not needed | ✅ Required for user data |
| **Secrets Stack** | ❌ Uses Auth service secrets | ✅ Creates own secrets |
| **Lambda Architecture** | ARM_64 | X86_64 |
| **CloudFront Cache** | DISABLED (management UI) | DISABLED (auth service) |
| **Origin Request Policy** | ALL_VIEWER | ALL_VIEWER_EXCEPT_HOST_HEADER |
| **Environment Variables** | NEXTAUTH_* | AUTH_* (NextAuth v5) |

## Troubleshooting

### CDK Synth Errors

```bash
cd infra
npm run build
cd admin
npx cdk synth --context env=dev
```

### Lambda Function Not Starting

Check CloudWatch Logs:

```bash
aws logs tail /aws/lambda/nagiyu-admin-dev --follow
```

### CloudFront 502/503 Errors

1. Check Lambda function logs
2. Verify Lambda function URL is accessible
3. Check Lambda execution role permissions
4. Verify ECR image exists and is valid

### Secrets Manager Access Denied

Verify the Lambda execution role has the correct permissions:

```bash
aws iam get-role-policy --role-name {lambda-execution-role-name} --policy-name {policy-name}
```

## References

- [Admin Service Architecture](../../docs/services/admin/architecture.md)
- [Auth Service Infrastructure](../auth/README.md)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/)
- [Lambda Container Images](https://docs.aws.amazon.com/lambda/latest/dg/images-create.html)
