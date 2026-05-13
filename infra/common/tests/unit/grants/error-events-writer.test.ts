import * as cdk from 'aws-cdk-lib';
import * as iam from 'aws-cdk-lib/aws-iam';
import { Template } from 'aws-cdk-lib/assertions';
import { grantErrorEventsWrite } from '../../../src/grants/error-events-writer';

describe('grantErrorEventsWrite', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let role: iam.Role;

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    role = new iam.Role(stack, 'TestRole', {
      assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
    });
  });

  it('dynamodb:PutItem アクションを付与する', () => {
    grantErrorEventsWrite(stack, role, 'dev');

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: [
          {
            Effect: 'Allow',
            Action: 'dynamodb:PutItem',
          },
        ],
      },
    });
  });

  it('dev 環境の CFN cross-stack export から ARN を取得する', () => {
    grantErrorEventsWrite(stack, role, 'dev');

    const template = Template.fromStack(stack);
    const templateJson = JSON.stringify(template.toJSON());
    expect(templateJson).toContain('nagiyu-error-events-table-arn-dev');
    expect(templateJson).toContain('Fn::ImportValue');
  });

  it('prod 環境の CFN cross-stack export から ARN を取得する', () => {
    grantErrorEventsWrite(stack, role, 'prod');

    const template = Template.fromStack(stack);
    const templateJson = JSON.stringify(template.toJSON());
    expect(templateJson).toContain('nagiyu-error-events-table-arn-prod');
  });

  it('ロールに IAM::Policy が 1 件アタッチされる', () => {
    grantErrorEventsWrite(stack, role, 'dev');

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::IAM::Policy', 1);
  });
});
