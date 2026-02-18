import {
  getLambdaFunctionArn,
  getDynamoDBTableArn,
  getS3BucketArn,
  getEcrRepositoryArn,
  getIamRoleArn,
  getIamManagedPolicyArn,
  getSecretsManagerSecretArn,
  getEcsClusterArn,
} from '../../src/utils/arn';

describe('arn utilities', () => {
  const region = 'ap-northeast-1';
  const account = '123456789012';

  it('should generate Lambda function ARN', () => {
    expect(getLambdaFunctionArn(region, account, 'nagiyu-tools-lambda-dev')).toBe(
      'arn:aws:lambda:ap-northeast-1:123456789012:function:nagiyu-tools-lambda-dev'
    );
  });

  it('should generate DynamoDB table ARN', () => {
    expect(getDynamoDBTableArn(region, account, 'nagiyu-auth-dynamodb-dev')).toBe(
      'arn:aws:dynamodb:ap-northeast-1:123456789012:table/nagiyu-auth-dynamodb-dev'
    );
  });

  it('should generate S3 bucket ARN', () => {
    expect(getS3BucketArn('nagiyu-tools-s3-dev')).toBe('arn:aws:s3:::nagiyu-tools-s3-dev');
  });

  it('should generate ECR repository ARN', () => {
    expect(getEcrRepositoryArn(region, account, 'nagiyu-tools-ecr-dev')).toBe(
      'arn:aws:ecr:ap-northeast-1:123456789012:repository/nagiyu-tools-ecr-dev'
    );
  });

  it('should generate IAM role ARN', () => {
    expect(getIamRoleArn(account, 'nagiyu-tools-iam-role-dev')).toBe(
      'arn:aws:iam::123456789012:role/nagiyu-tools-iam-role-dev'
    );
  });

  it('should generate IAM managed policy ARN', () => {
    expect(getIamManagedPolicyArn(account, 'nagiyu-deploy-policy-core')).toBe(
      'arn:aws:iam::123456789012:policy/nagiyu-deploy-policy-core'
    );
  });

  it('should generate Secrets Manager secret ARN pattern', () => {
    expect(getSecretsManagerSecretArn(region, account, 'nagiyu-auth-secrets-dev')).toBe(
      'arn:aws:secretsmanager:ap-northeast-1:123456789012:secret:nagiyu-auth-secrets-dev-*'
    );
  });

  it('should generate ECS cluster ARN', () => {
    expect(getEcsClusterArn(region, account, 'nagiyu-root-ecs-cluster-dev')).toBe(
      'arn:aws:ecs:ap-northeast-1:123456789012:cluster/nagiyu-root-ecs-cluster-dev'
    );
  });
});
