import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Template } from 'aws-cdk-lib/assertions';
import { createFunctionUrlOrigin } from '../../../src/cloudfront/function-url-origin';
import { createBodyHashEdgeLambdas } from '../../../src/cloudfront/body-hash-edge-function';

// テンプレートのうち、検証に使う部分だけの型
interface DistributionResource {
  Properties: {
    DistributionConfig: {
      Origins: Array<{
        OriginAccessControlId: unknown;
        CustomOriginConfig: { OriginProtocolPolicy: string };
      }>;
      DefaultCacheBehavior: {
        LambdaFunctionAssociations: Array<{
          EventType: string;
          IncludeBody: boolean;
          LambdaFunctionARN: { Ref: string };
        }>;
      };
    };
  };
}

describe('createFunctionUrlOrigin / createBodyHashEdgeLambdas', () => {
  const synth = (): Template => {
    const app = new cdk.App();
    const stack = new cdk.Stack(app, 'Test', {
      env: { account: '123456789012', region: 'us-east-1' },
    });
    const { origin } = createFunctionUrlOrigin(stack, 'FunctionUrl', {
      originAccessControlName: 'test-oac',
      functionUrl: 'https://abc.lambda-url.ap-northeast-1.on.aws/',
    });
    new cloudfront.Distribution(stack, 'Distribution', {
      defaultBehavior: {
        origin,
        edgeLambdas: createBodyHashEdgeLambdas(stack, 'Edge'),
      },
    });
    return Template.fromStack(stack);
  };

  it('Lambda 用の OAC を常に署名する設定で作る', () => {
    synth().hasResourceProperties('AWS::CloudFront::OriginAccessControl', {
      OriginAccessControlConfig: {
        Name: 'test-oac',
        OriginAccessControlOriginType: 'lambda',
        SigningBehavior: 'always',
        SigningProtocol: 'sigv4',
      },
    });
  });

  it('オリジンに OAC の ID が付き、ドメインは Function URL から取る', () => {
    const template = synth();
    const [distribution] = Object.values(template.findResources('AWS::CloudFront::Distribution'));
    const origins = (distribution as DistributionResource).Properties.DistributionConfig.Origins;

    expect(origins).toHaveLength(1);
    expect(origins[0].OriginAccessControlId).toEqual({
      'Fn::GetAtt': [expect.stringContaining('FunctionUrlOac'), 'Id'],
    });
    expect(origins[0].CustomOriginConfig.OriginProtocolPolicy).toBe('https-only');
  });

  it('Lambda@Edge を origin-request で本文付きで関連付ける', () => {
    const template = synth();
    const [distribution] = Object.values(template.findResources('AWS::CloudFront::Distribution'));
    const associations = (distribution as DistributionResource).Properties.DistributionConfig
      .DefaultCacheBehavior.LambdaFunctionAssociations;

    expect(associations).toHaveLength(1);
    expect(associations[0].EventType).toBe('origin-request');
    expect(associations[0].IncludeBody).toBe(true);
    expect(associations[0].LambdaFunctionARN.Ref).toEqual(
      expect.stringContaining('CurrentVersion')
    );
  });

  it('実行ロールが Lambda と Lambda@Edge の両方を信頼する', () => {
    synth().hasResourceProperties('AWS::IAM::Role', {
      AssumeRolePolicyDocument: {
        Statement: [
          { Principal: { Service: 'lambda.amazonaws.com' } },
          { Principal: { Service: 'edgelambda.amazonaws.com' } },
        ],
      },
    });
  });
});
