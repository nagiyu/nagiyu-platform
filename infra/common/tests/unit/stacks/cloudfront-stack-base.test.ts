import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { CloudFrontStackBase } from '../../../src/stacks/cloudfront-stack-base';

describe('CloudFrontStackBase', () => {
  let app: cdk.App;

  beforeEach(() => {
    app = new cdk.App();
  });

  describe('basic instantiation', () => {
    it('should create CloudFront distribution with default settings', () => {
      // Arrange & Act
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      });

      // Assert
      const template = Template.fromStack(stack);

      // CloudFront distribution exists
      template.resourceCountIs('AWS::CloudFront::Distribution', 1);

      // Distribution has correct settings
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Comment: 'tools Service Distribution (dev)',
          Enabled: true,
          HttpVersion: 'http2and3',
          IPV6Enabled: true,
        },
      });
    });

    it('should apply correct domain naming convention', () => {
      // Arrange & Act
      const prodStack = new CloudFrontStackBase(app, 'TestProdCloudFrontStack', {
        serviceName: 'tools',
        environment: 'prod',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      });

      const devStack = new CloudFrontStackBase(app, 'TestDevCloudFrontStack', {
        serviceName: 'auth',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      });

      // Assert
      const prodTemplate = Template.fromStack(prodStack);
      const devTemplate = Template.fromStack(devStack);

      prodTemplate.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Aliases: ['tools.nagiyu.com'],
        },
      });

      devTemplate.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Aliases: ['dev-auth.nagiyu.com'],
        },
      });
    });

    it('should create security headers policy by default', () => {
      // Arrange & Act
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::CloudFront::ResponseHeadersPolicy', 1);
      template.hasResourceProperties('AWS::CloudFront::ResponseHeadersPolicy', {
        ResponseHeadersPolicyConfig: {
          Name: 'nagiyu-tools-security-headers-dev',
          SecurityHeadersConfig: {
            StrictTransportSecurity: {
              AccessControlMaxAgeSec: 63072000,
              IncludeSubdomains: true,
              Preload: true,
              Override: true,
            },
            ContentTypeOptions: {
              Override: true,
            },
            FrameOptions: {
              FrameOption: 'DENY',
              Override: true,
            },
            XSSProtection: {
              Protection: true,
              ModeBlock: true,
              Override: true,
            },
            ReferrerPolicy: {
              ReferrerPolicy: 'strict-origin-when-cross-origin',
              Override: true,
            },
          },
        },
      });
    });

    it('should use TLS 1.2 by default', () => {
      // Arrange & Act
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          ViewerCertificate: {
            MinimumProtocolVersion: 'TLSv1.2_2021',
          },
        },
      });
    });

    it('should resolve certificate ARN from SSM when certificateArn is not provided', () => {
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
      });

      const template = Template.fromStack(stack);
      const templateJson = JSON.stringify(template.toJSON());
      expect(templateJson).toContain('/nagiyu/shared/acm/certificate-arn');
      expect(templateJson).not.toContain('Fn::ImportValue');
    });
  });

  describe('customization', () => {
    it('should allow custom domain name', () => {
      // Arrange & Act
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
        cloudfrontConfig: {
          domainName: 'custom.nagiyu.com',
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          Aliases: ['custom.nagiyu.com'],
        },
      });
    });

    it('should allow disabling security headers', () => {
      // Arrange & Act
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
        cloudfrontConfig: {
          enableSecurityHeaders: false,
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::CloudFront::ResponseHeadersPolicy', 0);
    });

    it('should support TLS 1.3', () => {
      // Arrange & Act
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
        cloudfrontConfig: {
          minimumTlsVersion: '1.3',
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          ViewerCertificate: {
            MinimumProtocolVersion: 'TLSv1.3_2025',
          },
        },
      });
    });

    it('should allow custom price class', () => {
      // Arrange & Act
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
        cloudfrontConfig: {
          priceClass: 'PriceClass_All',
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          PriceClass: 'PriceClass_All',
        },
      });
    });

    it('should disable HTTP/3 when configured', () => {
      // Arrange & Act
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
        cloudfrontConfig: {
          enableHttp3: false,
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        DistributionConfig: {
          HttpVersion: 'http2',
        },
      });
    });
  });

  describe('outputs', () => {
    it('should export distribution ID, domain name, and custom domain', () => {
      // Arrange & Act
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      });

      // Assert
      const template = Template.fromStack(stack);

      // Check for outputs
      template.hasOutput('DistributionId', {});
      template.hasOutput('DistributionDomainName', {});
      template.hasOutput('CustomDomainName', {});

      const outputs = template.toJSON().Outputs as Record<string, { Export?: unknown }>;
      expect(outputs.DistributionId.Export).toBeUndefined();
      expect(outputs.DistributionDomainName.Export).toBeUndefined();
      expect(outputs.CustomDomainName.Export).toBeUndefined();
    });
  });

  describe('tags', () => {
    it('should add correct tags to distribution', () => {
      // Arrange & Act
      const stack = new CloudFrontStackBase(app, 'TestCloudFrontStack', {
        serviceName: 'tools',
        environment: 'dev',
        functionUrl: 'https://example.lambda-url.ap-northeast-1.on.aws/',
        certificateArn: 'arn:aws:acm:us-east-1:123456789012:certificate/test',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::CloudFront::Distribution', {
        Tags: Match.arrayWith([
          { Key: 'Application', Value: 'nagiyu' },
          { Key: 'Service', Value: 'tools' },
        ]),
      });
    });
  });
});
