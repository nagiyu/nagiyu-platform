import { Environment } from '../types/environment';

export const SSM_PARAMETERS = {
  VPC_ID: (env: Environment) => `/nagiyu/shared/${env}/vpc/id`,
  VPC_CIDR: (env: Environment) => `/nagiyu/shared/${env}/vpc/cidr`,
  PUBLIC_SUBNET_IDS: (env: Environment) => `/nagiyu/shared/${env}/vpc/public-subnet-ids`,
  IGW_ID: (env: Environment) => `/nagiyu/shared/${env}/vpc/igw-id`,
  ACM_CERTIFICATE_ARN: '/nagiyu/shared/acm/certificate-arn',
  ACM_DOMAIN_NAME: '/nagiyu/shared/acm/domain-name',
  ALB_DNS_NAME: (env: Environment) => `/nagiyu/root/${env}/alb/dns-name`,
  ALB_ARN: (env: Environment) => `/nagiyu/root/${env}/alb/arn`,
  ALB_TARGET_GROUP_ARN: (env: Environment) => `/nagiyu/root/${env}/alb/target-group-arn`,
  ALB_SECURITY_GROUP_ID: (env: Environment) => `/nagiyu/root/${env}/alb/security-group-id`,
  ECS_CLUSTER_NAME: (env: Environment) => `/nagiyu/root/${env}/ecs/cluster-name`,
  ECS_CLUSTER_ARN: (env: Environment) => `/nagiyu/root/${env}/ecs/cluster-arn`,
  SHARED_ECS_CLUSTER_NAME: (env: Environment) => `/nagiyu/shared/${env}/ecs/cluster-name`,
  SHARED_ECS_CLUSTER_ARN: (env: Environment) => `/nagiyu/shared/${env}/ecs/cluster-arn`,
  LIVETALK_ECR_REPOSITORY_NAME: (env: Environment) => `/nagiyu/livetalk/${env}/ecr/repository-name`,
  LIVETALK_ECR_REPOSITORY_URI: (env: Environment) => `/nagiyu/livetalk/${env}/ecr/repository-uri`,
  LIVETALK_ALB_DNS_NAME: (env: Environment) => `/nagiyu/livetalk/${env}/alb/dns-name`,
  LIVETALK_ALB_ARN: (env: Environment) => `/nagiyu/livetalk/${env}/alb/arn`,
  LIVETALK_ALB_LISTENER_ARN: (env: Environment) => `/nagiyu/livetalk/${env}/alb/listener-arn`,
  LIVETALK_ALB_SECURITY_GROUP_ID: (env: Environment) =>
    `/nagiyu/livetalk/${env}/alb/security-group-id`,
  LIVETALK_ALB_TARGET_GROUP_ARN: (env: Environment) =>
    `/nagiyu/livetalk/${env}/alb/target-group-arn`,
  LIVETALK_ECS_SERVICE_NAME: (env: Environment) => `/nagiyu/livetalk/${env}/ecs/service-name`,
  LIVETALK_CLOUDFRONT_DISTRIBUTION_ID: (env: Environment) =>
    `/nagiyu/livetalk/${env}/cloudfront/distribution-id`,
  LIVETALK_CLOUDFRONT_DOMAIN_NAME: (env: Environment) =>
    `/nagiyu/livetalk/${env}/cloudfront/domain-name`,
  LIVETALK_CLOUDFRONT_CUSTOM_DOMAIN: (env: Environment) =>
    `/nagiyu/livetalk/${env}/cloudfront/custom-domain`,
  LIVETALK_ASSETS_BUCKET_NAME: (env: Environment) =>
    `/nagiyu/livetalk/${env}/assets/bucket-name`,
  LIVETALK_DYNAMODB_TABLE_NAME: (env: Environment) =>
    `/nagiyu/livetalk/${env}/dynamodb/table-name`,
  LIVETALK_DYNAMODB_TABLE_ARN: (env: Environment) =>
    `/nagiyu/livetalk/${env}/dynamodb/table-arn`,
} as const;
