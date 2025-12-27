# Auth Service Infrastructure

AWS infrastructure for the Auth service, including DynamoDB user table, Secrets Manager for OAuth credentials, and ECR repository.

## Resources

### 1. DynamoDB User Table (`dynamodb.yaml`)

**Table Name**: `nagiyu-auth-users-{env}`

**Schema**:
- **Primary Key**: `userId` (String, HASH)
- **Global Secondary Index**: `googleId-index` on `googleId` attribute

**Configuration**:
- Billing Mode: `PAY_PER_REQUEST` (auto-scaling)
- Point-in-time recovery: Enabled
- Encryption: AWS managed key (default)
- DeletionPolicy: `RETAIN` (prod), `DELETE` (dev/staging)

**Attributes** (application-defined, not in schema):
- `userId`: Platform user ID (UUID v4)
- `googleId`: Google OAuth ID
- `email`: Email address
- `name`: Display name
- `roles`: Array of role IDs (e.g., `["admin", "user-manager"]`)
- `createdAt`: Creation timestamp (ISO 8601)
- `updatedAt`: Update timestamp (ISO 8601)
- `lastLoginAt`: Last login timestamp (ISO 8601)

### 2. Secrets Manager (`secrets.yaml`)

**Secrets**:

1. **Google OAuth Credentials**: `nagiyu-auth-google-oauth-{env}`
   - `clientId`: Google OAuth Client ID
   - `clientSecret`: Google OAuth Client Secret
   - Initial values are placeholders, must be updated manually after deployment

2. **NextAuth.js Secret**: `nagiyu-auth-nextauth-secret-{env}`
   - Automatically generated 32-character random string
   - Used for JWT signing

### 3. ECR Repository (`ecr.yaml`)

**Repository Name**: `nagiyu-auth-{env}`

**Configuration**:
- Image scanning: Enabled on push
- Tag mutability: `MUTABLE`
- Lifecycle policy: Keep latest 10 images only

## Deployment

### Prerequisites

- AWS CLI configured with appropriate credentials
- Deployment permissions (IAM policies from `infra/shared/iam/`)

### Deploy to Dev Environment

```bash
# 1. Deploy DynamoDB table
aws cloudformation deploy \
  --template-file infra/auth/dynamodb.yaml \
  --stack-name nagiyu-auth-dynamodb-dev \
  --parameter-overrides Environment=dev \
  --tags Application=nagiyu Service=auth Environment=dev

# 2. Deploy Secrets Manager
aws cloudformation deploy \
  --template-file infra/auth/secrets.yaml \
  --stack-name nagiyu-auth-secrets-dev \
  --parameter-overrides Environment=dev \
  --tags Application=nagiyu Service=auth Environment=dev

# 3. Deploy ECR repository
aws cloudformation deploy \
  --template-file infra/auth/ecr.yaml \
  --stack-name nagiyu-auth-ecr-dev \
  --parameter-overrides Environment=dev \
  --tags Application=nagiyu Service=auth Environment=dev
```

### Deploy to Staging Environment

```bash
# Replace 'dev' with 'staging' in all commands above
aws cloudformation deploy \
  --template-file infra/auth/dynamodb.yaml \
  --stack-name nagiyu-auth-dynamodb-staging \
  --parameter-overrides Environment=staging \
  --tags Application=nagiyu Service=auth Environment=staging

# ... repeat for secrets and ecr
```

### Deploy to Production Environment

```bash
# Replace 'dev' with 'prod' in all commands above
aws cloudformation deploy \
  --template-file infra/auth/dynamodb.yaml \
  --stack-name nagiyu-auth-dynamodb-prod \
  --parameter-overrides Environment=prod \
  --tags Application=nagiyu Service=auth Environment=prod

# ... repeat for secrets and ecr
```

## Post-Deployment Configuration

### 1. Update Google OAuth Credentials

After deploying Secrets Manager, you must manually update the Google OAuth credentials:

1. **Obtain Google OAuth Credentials**:
   - Go to [Google Cloud Console - Credentials](https://console.cloud.google.com/apis/credentials)
   - Create OAuth 2.0 Client ID (Web application)
   - Authorized redirect URIs:
     - Dev: `https://dev-auth.nagiyu.com/api/auth/callback/google`
     - Staging: `https://staging-auth.nagiyu.com/api/auth/callback/google`
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

   # Staging environment
   aws secretsmanager put-secret-value \
     --secret-id nagiyu-auth-google-oauth-staging \
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

## Update Stack

To update an existing stack:

```bash
aws cloudformation update-stack \
  --stack-name nagiyu-auth-dynamodb-dev \
  --template-body file://infra/auth/dynamodb.yaml \
  --parameters ParameterKey=Environment,ParameterValue=dev
```

Or use `deploy` command which handles both create and update:

```bash
aws cloudformation deploy \
  --template-file infra/auth/dynamodb.yaml \
  --stack-name nagiyu-auth-dynamodb-dev \
  --parameter-overrides Environment=dev
```

## Delete Stack

**Warning**: Be careful when deleting production stacks. DynamoDB table in production has `RETAIN` deletion policy.

```bash
# Delete dev stacks
aws cloudformation delete-stack --stack-name nagiyu-auth-ecr-dev
aws cloudformation delete-stack --stack-name nagiyu-auth-secrets-dev
aws cloudformation delete-stack --stack-name nagiyu-auth-dynamodb-dev

# For production, DynamoDB table will be retained even after stack deletion
aws cloudformation delete-stack --stack-name nagiyu-auth-dynamodb-prod
```

## Troubleshooting

### Issue: Stack deployment fails with permission error

**Solution**: Ensure your IAM user/role has the deployment policies from `infra/shared/iam/policies/`.

### Issue: Cannot read secret value

**Solution**: Ensure your Lambda execution role has `secretsmanager:GetSecretValue` permission for the secret ARN.

### Issue: DynamoDB table already exists

**Solution**: Use a different stack name or delete the existing stack first.

## Related Documentation

- [Auth Service Architecture](../../docs/services/auth/architecture.md)
- [Infrastructure Architecture](../../docs/infra/architecture.md)
- [Deployment Guide](../../docs/infra/deploy.md)
