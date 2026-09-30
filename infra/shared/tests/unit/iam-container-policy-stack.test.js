const cdk = require('aws-cdk-lib');
const { Template } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { IamContainerPolicyStack } = require('../../lib/iam/iam-container-policy-stack');

describe('IamContainerPolicyStack', () => {
  const createStatements = () => {
    const app = new cdk.App();
    const stack = new IamContainerPolicyStack(app, 'TestIamContainerPolicyStack');
    const template = Template.fromStack(stack);
    const [policy] = Object.values(template.findResources('AWS::IAM::ManagedPolicy'));
    return policy.Properties.PolicyDocument.Statement;
  };

  it('public ECR の認証 pull 用に GetAuthorizationToken と GetServiceBearerToken を許可する', () => {
    const statement = createStatements().find((s) => s.Sid === 'ECRPublicPull');

    expect(statement).toBeDefined();
    expect(statement.Effect).toBe('Allow');
    expect(statement.Action).toEqual(
      expect.arrayContaining(['ecr-public:GetAuthorizationToken', 'sts:GetServiceBearerToken'])
    );
    expect(statement.Resource).toBe('*');
  });

  it('プライベート ECR の認証トークン取得権限を維持する', () => {
    const statement = createStatements().find((s) => s.Sid === 'ECROperations');

    expect(statement.Action).toContain('ecr:GetAuthorizationToken');
  });
});
