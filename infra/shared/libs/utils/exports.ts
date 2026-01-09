/**
 * CloudFormation Export 名の定数定義
 *
 * 各サービスの CDK スタックから参照される Export 名を一元管理します。
 * これにより typo を防ぎ、IDE の補完機能を活用できます。
 */
export const EXPORTS = {
  // VPC 関連
  VPC_ID: (env: string) => `nagiyu-${env}-vpc-id`,
  PUBLIC_SUBNET_IDS: (env: string) => `nagiyu-${env}-public-subnet-ids`,
  IGW_ID: (env: string) => `nagiyu-${env}-igw-id`,
  VPC_CIDR: (env: string) => `nagiyu-${env}-vpc-cidr`,

  // ACM 関連
  ACM_CERTIFICATE_ARN: 'nagiyu-shared-acm-certificate-arn',
  ACM_DOMAIN_NAME: 'nagiyu-shared-acm-domain-name',
  ACM_WILDCARD_DOMAIN: 'nagiyu-shared-acm-wildcard-domain',

  // IAM Policies
  DEPLOY_POLICY_CORE_ARN: 'nagiyu-deploy-policy-core-arn',
  DEPLOY_POLICY_APPLICATION_ARN: 'nagiyu-deploy-policy-application-arn',
  DEPLOY_POLICY_CONTAINER_ARN: 'nagiyu-deploy-policy-container-arn',
  DEPLOY_POLICY_INTEGRATION_ARN: 'nagiyu-deploy-policy-integration-arn',

  // IAM Users
  GITHUB_ACTIONS_USER_ARN:
    'nagiyu-shared-github-actions-user-NagiyuGitHubActionsUserArn',
  GITHUB_ACTIONS_USER_NAME:
    'nagiyu-shared-github-actions-user-NagiyuGitHubActionsUserName',
  LOCAL_DEV_USER_ARN:
    'nagiyu-shared-local-dev-user-NagiyuLocalDevUserArn',
  LOCAL_DEV_USER_NAME:
    'nagiyu-shared-local-dev-user-NagiyuLocalDevUserName',
} as const;
