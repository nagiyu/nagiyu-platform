import { SSM_PARAMETERS } from '../../src/utils/ssm';

describe('ssm utilities', () => {
  it('should generate shared VPC parameter names', () => {
    expect(SSM_PARAMETERS.VPC_ID('dev')).toBe('/nagiyu/shared/dev/vpc/id');
    expect(SSM_PARAMETERS.VPC_CIDR('prod')).toBe('/nagiyu/shared/prod/vpc/cidr');
    expect(SSM_PARAMETERS.PUBLIC_SUBNET_IDS('dev')).toBe(
      '/nagiyu/shared/dev/vpc/public-subnet-ids'
    );
    expect(SSM_PARAMETERS.IGW_ID('prod')).toBe('/nagiyu/shared/prod/vpc/igw-id');
  });

  it('should define shared ACM parameter names', () => {
    expect(SSM_PARAMETERS.ACM_CERTIFICATE_ARN).toBe('/nagiyu/shared/acm/certificate-arn');
    expect(SSM_PARAMETERS.ACM_DOMAIN_NAME).toBe('/nagiyu/shared/acm/domain-name');
  });

  it('should generate root ALB parameter names', () => {
    expect(SSM_PARAMETERS.ALB_DNS_NAME('dev')).toBe('/nagiyu/root/dev/alb/dns-name');
    expect(SSM_PARAMETERS.ALB_ARN('prod')).toBe('/nagiyu/root/prod/alb/arn');
    expect(SSM_PARAMETERS.ALB_TARGET_GROUP_ARN('dev')).toBe(
      '/nagiyu/root/dev/alb/target-group-arn'
    );
    expect(SSM_PARAMETERS.ALB_SECURITY_GROUP_ID('prod')).toBe(
      '/nagiyu/root/prod/alb/security-group-id'
    );
  });

  it('should generate root ECS parameter names', () => {
    expect(SSM_PARAMETERS.ECS_CLUSTER_NAME('dev')).toBe('/nagiyu/root/dev/ecs/cluster-name');
    expect(SSM_PARAMETERS.ECS_CLUSTER_ARN('prod')).toBe('/nagiyu/root/prod/ecs/cluster-arn');
  });

  it('should generate LiveTalk ECR parameter names', () => {
    expect(SSM_PARAMETERS.LIVETALK_ECR_REPOSITORY_NAME('dev')).toBe(
      '/nagiyu/livetalk/dev/ecr/repository-name'
    );
    expect(SSM_PARAMETERS.LIVETALK_ECR_REPOSITORY_URI('prod')).toBe(
      '/nagiyu/livetalk/prod/ecr/repository-uri'
    );
  });

  it('should generate shared ECS parameter names', () => {
    expect(SSM_PARAMETERS.SHARED_ECS_CLUSTER_NAME('dev')).toBe(
      '/nagiyu/shared/dev/ecs/cluster-name'
    );
    expect(SSM_PARAMETERS.SHARED_ECS_CLUSTER_ARN('prod')).toBe(
      '/nagiyu/shared/prod/ecs/cluster-arn'
    );
  });

  it('should generate LiveTalk ALB parameter names', () => {
    expect(SSM_PARAMETERS.LIVETALK_ALB_DNS_NAME('dev')).toBe(
      '/nagiyu/livetalk/dev/alb/dns-name'
    );
    expect(SSM_PARAMETERS.LIVETALK_ALB_ARN('prod')).toBe('/nagiyu/livetalk/prod/alb/arn');
    expect(SSM_PARAMETERS.LIVETALK_ALB_LISTENER_ARN('dev')).toBe(
      '/nagiyu/livetalk/dev/alb/listener-arn'
    );
    expect(SSM_PARAMETERS.LIVETALK_ALB_SECURITY_GROUP_ID('prod')).toBe(
      '/nagiyu/livetalk/prod/alb/security-group-id'
    );
    expect(SSM_PARAMETERS.LIVETALK_ALB_TARGET_GROUP_ARN('dev')).toBe(
      '/nagiyu/livetalk/dev/alb/target-group-arn'
    );
  });

  it('should generate LiveTalk ECS Service parameter name', () => {
    expect(SSM_PARAMETERS.LIVETALK_ECS_SERVICE_NAME('dev')).toBe(
      '/nagiyu/livetalk/dev/ecs/service-name'
    );
    expect(SSM_PARAMETERS.LIVETALK_ECS_SERVICE_NAME('prod')).toBe(
      '/nagiyu/livetalk/prod/ecs/service-name'
    );
  });
});
