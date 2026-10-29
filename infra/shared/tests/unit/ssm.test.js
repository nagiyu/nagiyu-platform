require('ts-node/register/transpile-only');
const { SSM_PARAMETERS } = require('../../libs/utils/ssm');

// SSM パラメータ名は他スタック・他サービスが同じ文字列で参照する契約のため、変更を検知する
describe('SSM_PARAMETERS', () => {
  describe.each(['dev', 'prod'])('環境 %s のパラメータ名', (env) => {
    it.each([
      ['VPC_ID', `/nagiyu/shared/${env}/vpc/id`],
      ['VPC_CIDR', `/nagiyu/shared/${env}/vpc/cidr`],
      ['PUBLIC_SUBNET_IDS', `/nagiyu/shared/${env}/vpc/public-subnet-ids`],
      ['IGW_ID', `/nagiyu/shared/${env}/vpc/igw-id`],
      ['ALB_DNS_NAME', `/nagiyu/root/${env}/alb/dns-name`],
      ['ALB_ARN', `/nagiyu/root/${env}/alb/arn`],
      ['ALB_TARGET_GROUP_ARN', `/nagiyu/root/${env}/alb/target-group-arn`],
      ['ALB_SECURITY_GROUP_ID', `/nagiyu/root/${env}/alb/security-group-id`],
      ['ECS_CLUSTER_NAME', `/nagiyu/root/${env}/ecs/cluster-name`],
      ['ECS_CLUSTER_ARN', `/nagiyu/root/${env}/ecs/cluster-arn`],
      ['SHARED_ECS_CLUSTER_NAME', `/nagiyu/shared/${env}/ecs/cluster-name`],
      ['SHARED_ECS_CLUSTER_ARN', `/nagiyu/shared/${env}/ecs/cluster-arn`],
    ])('%s は環境名を含むパス %s を返す', (key, expected) => {
      expect(SSM_PARAMETERS[key](env)).toBe(expected);
    });
  });

  it('環境に依存しないパラメータは固定の文字列である', () => {
    expect(SSM_PARAMETERS.ACM_CERTIFICATE_ARN).toBe('/nagiyu/shared/acm/certificate-arn');
    expect(SSM_PARAMETERS.ACM_DOMAIN_NAME).toBe('/nagiyu/shared/acm/domain-name');
    expect(SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_ID).toBe('/nagiyu/shared/route53/hosted-zone-id');
    expect(SSM_PARAMETERS.ROUTE53_HOSTED_ZONE_NAME).toBe('/nagiyu/shared/route53/hosted-zone-name');
  });

  it('dev と prod でパラメータ名が衝突しない', () => {
    const envDependentKeys = Object.keys(SSM_PARAMETERS).filter(
      (key) => typeof SSM_PARAMETERS[key] === 'function'
    );

    expect(envDependentKeys.length).toBeGreaterThan(0);
    for (const key of envDependentKeys) {
      expect(SSM_PARAMETERS[key]('dev')).not.toBe(SSM_PARAMETERS[key]('prod'));
    }
  });
});
