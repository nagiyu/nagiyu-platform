# Auth Service Infrastructure (AWS CDK)

AWS CDK infrastructure for the Auth service, including DynamoDB user table, Secrets Manager for OAuth credentials, and ECR repository.

## Project Structure

```
infra/auth/
├── bin/
│   └── auth.ts                 # CDK アプリエントリーポイント
├── lib/
│   ├── auth-stack.ts           # メインスタック
│   ├── dynamodb-stack.ts       # DynamoDB テーブル
│   ├── secrets-stack.ts        # Secrets Manager
│   └── ecr-stack.ts            # ECR リポジトリ
├── cdk.json                    # CDK 設定
├── package.json                # 依存関係
└── tsconfig.json               # TypeScript 設定
```

## Resources

### 1. DynamoDB User Table

**Table Name**: `nagiyu-auth-users-{env}`

**Schema**:
- **Primary Key**: `userId` (String, HASH)
- **Global Secondary Index**: `googleId-index` on `googleId` attribute

**Configuration**:
- Billing Mode: `PAY_PER_REQUEST` (auto-scaling)
- Point-in-time recovery: Enabled
- Encryption: AWS managed key (default)
- RemovalPolicy: `RETAIN` (prod), `DESTROY` (dev)

**Attributes** (application-defined):
- `userId`: Platform user ID (UUID v4)
- `googleId`: Google OAuth ID
- `email`: Email address
- `name`: Display name
- `picture`: Profile picture URL (optional)
- `roles`: Array of role IDs (e.g., `["admin", "user-manager"]`)
- `createdAt`: Creation timestamp (ISO 8601)
- `updatedAt`: Update timestamp (ISO 8601)

### 2. Secrets Manager

**Secrets**:

1. **Google OAuth Credentials**: `nagiyu-auth-google-oauth-{env}`
   - `clientId`: Google OAuth Client ID
   - `clientSecret`: Google OAuth Client Secret
   - Initial values are placeholders, must be updated manually after deployment

2. **NextAuth.js Secret**: `nagiyu-auth-nextauth-secret-{env}`
   - Automatically generated 32-character random string
   - Used for JWT signing

### 3. ECR Repository

**Repository Name**: `nagiyu-auth-{env}`

**Configuration**:
- Image scanning: Enabled on push
- Tag mutability: `MUTABLE`
- Lifecycle policy: Keep latest 10 images only
- RemovalPolicy: `RETAIN` (prod), `DESTROY` (dev)

## Prerequisites

- Node.js 18.x or later
- AWS CLI configured with appropriate credentials
- AWS CDK CLI: `npm install -g aws-cdk`

## Installation

```bash
cd infra/auth
npm install
```

## Build

```bash
npm run build
```

## CDK Commands

### Synthesize CloudFormation template

```bash
# Dev environment
npm run synth -- --context env=dev

# Prod environment
npm run synth -- --context env=prod
```

Or use the CDK CLI directly:

```bash
npx cdk synth --context env=dev
```

### Deploy

```bash
# Bootstrap (first time only)
npx cdk bootstrap aws://{account-id}/{region}

# Deploy all stacks to dev
npm run deploy:dev

# Deploy all stacks to prod
npm run deploy:prod

# Deploy specific stack
npx cdk deploy Auth-DynamoDB-dev --context env=dev
npx cdk deploy Auth-Secrets-dev --context env=dev
npx cdk deploy Auth-ECR-dev --context env=dev
```

### View differences

```bash
# Dev environment
npm run diff:dev

# Prod environment
npm run diff:prod
```

### List all stacks

```bash
npx cdk list --context env=dev
```

## Post-Deployment Configuration

### 1. Update Google OAuth Credentials

After deploying Secrets Manager, you must manually update the Google OAuth credentials:

1. **Obtain Google OAuth Credentials**:
   - Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
   - Create OAuth 2.0 Client ID (Web application)
   - Authorized redirect URIs:
     - Dev: `https://dev-auth.nagiyu.com/api/auth/callback/google`
     - Prod: `https://auth.nagiyu.com/api/auth/callback/google`

2. **Update Secret in AWS**:

   ```bash
   # Dev environment
   aws secretsmanager put-secret-value \
     --secret-id nagiyu-auth-google-oauth-dev \
     --secret-string '{
       "clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
       "clientSecret": "GOCSPX-YOUR_CLIENT_SECRET"
     }'

   # Production environment
   aws secretsmanager put-secret-value \
     --secret-id nagiyu-auth-google-oauth-prod \
     --secret-string '{
       "clientId": "YOUR_CLIENT_ID.apps.googleusercontent.com",
       "clientSecret": "GOCSPX-YOUR_CLIENT_SECRET"
     }'
   ```

### 2. Verify Resources

```bash
# Verify DynamoDB table
aws dynamodb describe-table --table-name nagiyu-auth-users-dev

# Verify Secrets Manager
aws secretsmanager describe-secret --secret-id nagiyu-auth-google-oauth-dev

# Verify ECR repository
aws ecr describe-repositories --repository-names nagiyu-auth-dev
```

## Stack Outputs

Each stack exports values that can be referenced by other stacks:

### DynamoDB Stack
- `{StackName}-TableName`: Table name
- `{StackName}-TableArn`: Table ARN
- `{StackName}-GoogleIdIndexName`: GSI name

### Secrets Stack
- `{StackName}-GoogleOAuthSecretArn`: Google OAuth secret ARN
- `{StackName}-GoogleOAuthSecretName`: Google OAuth secret name
- `{StackName}-NextAuthSecretArn`: NextAuth secret ARN
- `{StackName}-NextAuthSecretName`: NextAuth secret name

### ECR Stack
- `{StackName}-RepositoryUri`: ECR repository URI
- `{StackName}-RepositoryArn`: ECR repository ARN
- `{StackName}-RepositoryName`: ECR repository name

## Destroy Stack

**Warning**: Be careful when deleting production stacks. Resources in production have `RETAIN` removal policy.

```bash
# Destroy dev stacks
npx cdk destroy Auth-ECR-dev --context env=dev
npx cdk destroy Auth-Secrets-dev --context env=dev
npx cdk destroy Auth-DynamoDB-dev --context env=dev

# Destroy all dev stacks
npx cdk destroy --context env=dev --all
```

## Troubleshooting

### Issue: CDK synth fails with TypeScript errors

**Solution**: Run `npm run build` to compile TypeScript files first.

### Issue: Stack deployment fails with permission error

**Solution**: Ensure your IAM user/role has the deployment policies from `infra/shared/iam/policies/`.

### Issue: Cannot read secret value

**Solution**: Ensure your Lambda execution role has `secretsmanager:GetSecretValue` permission for the secret ARN.

## Related Documentation

- [Auth Service Architecture](../../docs/services/auth/architecture.md)
- [Infrastructure Architecture](../../docs/infra/architecture.md)
- [AWS CDK Documentation](https://docs.aws.amazon.com/cdk/v2/guide/home.html)
