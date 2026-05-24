export type Environment = 'dev' | 'prod';

export const SSM_PARAMETERS = {
  VPC_ID: (env: Environment) => `/nagiyu/shared/${env}/vpc/id`,
  VPC_CIDR: (env: Environment) => `/nagiyu/shared/${env}/vpc/cidr`,
  PUBLIC_SUBNET_IDS: (env: Environment) => `/nagiyu/shared/${env}/vpc/public-subnet-ids`,
  IGW_ID: (env: Environment) => `/nagiyu/shared/${env}/vpc/igw-id`,
  ACM_CERTIFICATE_ARN: '/nagiyu/shared/acm/certificate-arn',
  ACM_DOMAIN_NAME: '/nagiyu/shared/acm/domain-name',
  ROUTE53_HOSTED_ZONE_ID: '/nagiyu/shared/route53/hosted-zone-id',
  ROUTE53_HOSTED_ZONE_NAME: '/nagiyu/shared/route53/hosted-zone-name',
  ALB_DNS_NAME: (env: Environment) => `/nagiyu/root/${env}/alb/dns-name`,
  ALB_ARN: (env: Environment) => `/nagiyu/root/${env}/alb/arn`,
  ALB_TARGET_GROUP_ARN: (env: Environment) => `/nagiyu/root/${env}/alb/target-group-arn`,
  ALB_SECURITY_GROUP_ID: (env: Environment) => `/nagiyu/root/${env}/alb/security-group-id`,
  ECS_CLUSTER_NAME: (env: Environment) => `/nagiyu/root/${env}/ecs/cluster-name`,
  ECS_CLUSTER_ARN: (env: Environment) => `/nagiyu/root/${env}/ecs/cluster-arn`,
  SHARED_ECS_CLUSTER_NAME: (env: Environment) => `/nagiyu/shared/${env}/ecs/cluster-name`,
  SHARED_ECS_CLUSTER_ARN: (env: Environment) => `/nagiyu/shared/${env}/ecs/cluster-arn`,
  LIVETALK_CLOUDFRONT_DOMAIN_NAME: (env: Environment) =>
    `/nagiyu/livetalk/${env}/cloudfront/domain-name`,
} as const;
