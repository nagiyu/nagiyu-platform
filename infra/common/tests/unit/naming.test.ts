import {
  getResourceName,
  getEcrRepositoryName,
  getLambdaFunctionName,
  getCloudFrontDomainName,
  getRootDomainName,
  getServiceUrl,
  getS3BucketName,
  getDynamoDBTableName,
  getIamRoleName,
  getLogGroupName,
} from '../../src/utils/naming';

describe('naming utilities', () => {
  describe('getResourceName', () => {
    it('should generate resource name with correct pattern', () => {
      expect(getResourceName('tools', 'ecr', 'dev')).toBe('nagiyu-tools-ecr-dev');
      expect(getResourceName('auth', 'lambda', 'prod')).toBe('nagiyu-auth-lambda-prod');
    });

    it('should handle different resource types', () => {
      expect(getResourceName('admin', 's3', 'dev')).toBe('nagiyu-admin-s3-dev');
      expect(getResourceName('tools', 'dynamodb', 'prod')).toBe('nagiyu-tools-dynamodb-prod');
    });
  });

  describe('getEcrRepositoryName', () => {
    it('should generate ECR repository name for dev environment', () => {
      expect(getEcrRepositoryName('tools', 'dev')).toBe('nagiyu-tools-ecr-dev');
    });

    it('should generate ECR repository name for prod environment', () => {
      expect(getEcrRepositoryName('auth', 'prod')).toBe('nagiyu-auth-ecr-prod');
    });
  });

  describe('getLambdaFunctionName', () => {
    it('should generate Lambda function name for dev environment', () => {
      expect(getLambdaFunctionName('tools', 'dev')).toBe('nagiyu-tools-lambda-dev');
    });

    it('should generate Lambda function name for prod environment', () => {
      expect(getLambdaFunctionName('auth', 'prod')).toBe('nagiyu-auth-lambda-prod');
    });
  });

  describe('getCloudFrontDomainName', () => {
    it('should generate CloudFront domain name for prod environment', () => {
      expect(getCloudFrontDomainName('tools', 'prod')).toBe('tools.nagiyu.com');
      expect(getCloudFrontDomainName('auth', 'prod')).toBe('auth.nagiyu.com');
    });

    it('should generate CloudFront domain name for dev environment under the dev zone', () => {
      expect(getCloudFrontDomainName('tools', 'dev')).toBe('tools.dev.nagiyu.com');
      expect(getCloudFrontDomainName('auth', 'dev')).toBe('auth.dev.nagiyu.com');
    });
  });

  describe('getRootDomainName', () => {
    it('should return nagiyu.com for prod', () => {
      expect(getRootDomainName('prod')).toBe('nagiyu.com');
    });

    it('should return dev.nagiyu.com for dev', () => {
      expect(getRootDomainName('dev')).toBe('dev.nagiyu.com');
    });
  });

  describe('getServiceUrl', () => {
    it('should generate service URL for prod environment', () => {
      expect(getServiceUrl('auth', 'prod')).toBe('https://auth.nagiyu.com');
    });

    it('should generate service URL for dev environment under the dev zone', () => {
      expect(getServiceUrl('auth', 'dev')).toBe('https://auth.dev.nagiyu.com');
    });
  });

  describe('getS3BucketName', () => {
    it('should generate S3 bucket name', () => {
      expect(getS3BucketName('tools', 'dev')).toBe('nagiyu-tools-s3-dev');
      expect(getS3BucketName('admin', 'prod')).toBe('nagiyu-admin-s3-prod');
    });
  });

  describe('getDynamoDBTableName', () => {
    it('should generate DynamoDB table name', () => {
      expect(getDynamoDBTableName('auth', 'dev')).toBe('nagiyu-auth-dynamodb-dev');
      expect(getDynamoDBTableName('tools', 'prod')).toBe('nagiyu-tools-dynamodb-prod');
    });
  });

  describe('getIamRoleName', () => {
    it('should generate IAM role name', () => {
      expect(getIamRoleName('tools', 'dev')).toBe('nagiyu-tools-iam-role-dev');
      expect(getIamRoleName('auth', 'prod')).toBe('nagiyu-auth-iam-role-prod');
    });
  });

  describe('getLogGroupName', () => {
    it('should generate CloudWatch Logs log group name', () => {
      expect(getLogGroupName('tools', 'dev')).toBe('/aws/lambda/nagiyu-tools-lambda-dev');
      expect(getLogGroupName('auth', 'prod')).toBe('/aws/lambda/nagiyu-auth-lambda-prod');
    });
  });
});
