import * as cdk from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { grantCloudFrontInvoke } from '../../../src/grants/cloudfront-invoke';

describe('grantCloudFrontInvoke', () => {
  const createFunction = () => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Test', {
      env: { account: '123456789012', region: 'ap-northeast-1' },
    });
    const fn = new lambda.Function(stack, 'Fn', {
      runtime: lambda.Runtime.NODEJS_22_X,
      handler: 'index.handler',
      code: lambda.Code.fromInline('exports.handler = async () => ({});'),
    });
    return { stack, fn };
  };

  it('既定ではアカウント内の全配信に 2 つの許可を足す', () => {
    const { stack, fn } = createFunction();

    grantCloudFrontInvoke(fn);

    const template = Template.fromStack(stack);
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunctionUrl',
      Principal: 'cloudfront.amazonaws.com',
      FunctionUrlAuthType: 'AWS_IAM',
      SourceArn: Match.anyValue(),
    });
    template.hasResourceProperties('AWS::Lambda::Permission', {
      Action: 'lambda:InvokeFunction',
      Principal: 'cloudfront.amazonaws.com',
      InvokedViaFunctionUrl: true,
      SourceArn: Match.anyValue(),
    });
    template.resourceCountIs('AWS::Lambda::Permission', 2);
    // formatArn はアカウントを Token で埋めるため、組み立てた文字列の末尾で確かめる
    const permissions = Object.values(template.findResources('AWS::Lambda::Permission'));
    permissions.forEach((permission) => {
      expect(JSON.stringify(permission.Properties.SourceArn)).toContain(':distribution/*');
    });
  });

  it('sourceArn を指定したらその配信に絞る', () => {
    const { stack, fn } = createFunction();
    const sourceArn = 'arn:aws:cloudfront::123456789012:distribution/EXAMPLE';

    grantCloudFrontInvoke(fn, { sourceArn });

    const template = Template.fromStack(stack);
    template.resourceCountIs('AWS::Lambda::Permission', 2);
    template.allResourcesProperties('AWS::Lambda::Permission', { SourceArn: sourceArn });
  });
});
