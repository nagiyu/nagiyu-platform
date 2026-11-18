import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import {
  createResponseHeadersPolicy,
  RESPONSE_HEADERS_POLICY_ERROR_MESSAGES,
} from '../../../src/cloudfront/response-headers-policy';

describe('createResponseHeadersPolicy', () => {
  let stack: cdk.Stack;

  beforeEach(() => {
    stack = new cdk.Stack(new cdk.App(), 'TestStack');
  });

  const baseProps = {
    responseHeadersPolicyName: 'test-policy',
    comment: 'テスト用ポリシー',
  };

  const getConfig = () =>
    Object.values(
      Template.fromStack(stack).findResources('AWS::CloudFront::ResponseHeadersPolicy')
    )[0].Properties.ResponseHeadersPolicyConfig;

  it('名前とコメントを設定する', () => {
    createResponseHeadersPolicy(stack, 'Policy', {
      ...baseProps,
      securityHeaders: true,
      noindex: false,
    });

    const config = getConfig();
    expect(config.Name).toBe('test-policy');
    expect(config.Comment).toBe('テスト用ポリシー');
  });

  it('セキュリティヘッダーの各値を設定し、X-Frame-Options は既定で DENY にする', () => {
    createResponseHeadersPolicy(stack, 'Policy', {
      ...baseProps,
      securityHeaders: true,
      noindex: false,
    });

    const config = getConfig();
    expect(config.SecurityHeadersConfig).toEqual({
      StrictTransportSecurity: {
        AccessControlMaxAgeSec: 63072000,
        IncludeSubdomains: true,
        Preload: true,
        Override: true,
      },
      ContentTypeOptions: { Override: true },
      FrameOptions: { FrameOption: 'DENY', Override: true },
      XSSProtection: { Protection: true, ModeBlock: true, Override: true },
      ReferrerPolicy: { ReferrerPolicy: 'strict-origin-when-cross-origin', Override: true },
    });
    expect(config.CustomHeadersConfig).toBeUndefined();
  });

  it('frameOption に SAMEORIGIN を指定できる', () => {
    createResponseHeadersPolicy(stack, 'Policy', {
      ...baseProps,
      securityHeaders: true,
      frameOption: 'SAMEORIGIN',
      noindex: false,
    });

    expect(getConfig().SecurityHeadersConfig.FrameOptions).toEqual({
      FrameOption: 'SAMEORIGIN',
      Override: true,
    });
  });

  it('frameOption に DENY を明示しても DENY になる', () => {
    createResponseHeadersPolicy(stack, 'Policy', {
      ...baseProps,
      securityHeaders: true,
      frameOption: 'DENY',
      noindex: false,
    });

    expect(getConfig().SecurityHeadersConfig.FrameOptions.FrameOption).toBe('DENY');
  });

  it('noindex のみのときは X-Robots-Tag だけを付ける', () => {
    createResponseHeadersPolicy(stack, 'Policy', {
      ...baseProps,
      securityHeaders: false,
      noindex: true,
    });

    const config = getConfig();
    expect(config.SecurityHeadersConfig).toBeUndefined();
    expect(config.CustomHeadersConfig).toEqual({
      Items: [{ Header: 'X-Robots-Tag', Value: 'noindex, nofollow', Override: true }],
    });
  });

  it('セキュリティヘッダーと noindex の両方を付けられる', () => {
    createResponseHeadersPolicy(stack, 'Policy', {
      ...baseProps,
      securityHeaders: true,
      noindex: true,
    });

    Template.fromStack(stack).hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
      ResponseHeadersPolicyConfig: Match.objectLike({
        SecurityHeadersConfig: Match.objectLike({ ContentTypeOptions: { Override: true } }),
        CustomHeadersConfig: { Items: [Match.objectLike({ Header: 'X-Robots-Tag' })] },
      }),
    });
  });

  it('securityHeaders も noindex も false のときはエラーにする', () => {
    expect(() =>
      createResponseHeadersPolicy(stack, 'Policy', {
        ...baseProps,
        securityHeaders: false,
        noindex: false,
      })
    ).toThrow(RESPONSE_HEADERS_POLICY_ERROR_MESSAGES.NO_HEADERS_ENABLED);
  });
});
