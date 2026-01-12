// Type exports
export type {
  Environment,
  EcrConfig,
  LambdaConfig,
  CloudFrontConfig,
  ServiceConfig,
} from "./types";

// Naming utilities
export {
  getResourceName,
  getEcrRepositoryName,
  getLambdaFunctionName,
  getCloudFrontDomainName,
  getS3BucketName,
  getDynamoDBTableName,
  getIamRoleName,
  getLogGroupName,
} from "./utils/naming";
export type { ResourceType } from "./utils/naming";

// Default configurations
export {
  DEFAULT_LAMBDA_CONFIG,
  DEFAULT_ECR_CONFIG,
  DEFAULT_CLOUDFRONT_CONFIG,
  mergeConfig,
} from "./constants/defaults";

// Security headers
export {
  HSTS_HEADER,
  CONTENT_TYPE_OPTIONS_HEADER,
  FRAME_OPTIONS_HEADER,
  XSS_PROTECTION_HEADER,
  REFERRER_POLICY_HEADER,
  PERMISSIONS_POLICY_HEADER,
  SECURITY_HEADERS,
} from "./constants/security-headers";
