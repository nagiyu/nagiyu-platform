import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { LambdaStackBase } from '../../../src/stacks/lambda-stack-base';

describe('LambdaStackBase', () => {
  let app: cdk.App;

  beforeEach(() => {
    app = new cdk.App();
  });

  describe('basic instantiation', () => {
    it('should create Lambda function with default settings', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
      });

      // Assert
      const template = Template.fromStack(stack);

      // Lambda function exists
      template.resourceCountIs('AWS::Lambda::Function', 1);

      // Function has correct settings
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-tools-lambda-dev',
        MemorySize: 512,
        Timeout: 30,
      });
    });

    it('should apply correct naming convention', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'auth',
        environment: 'prod',
        ecrRepositoryName: 'nagiyu-auth-ecr-prod',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-auth-lambda-prod',
      });
    });

    it('should create execution role with basic permissions', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::IAM::Role', 1);
      template.hasResourceProperties('AWS::IAM::Role', {
        AssumeRolePolicyDocument: {
          Statement: [
            {
              Action: 'sts:AssumeRole',
              Effect: 'Allow',
              Principal: {
                Service: 'lambda.amazonaws.com',
              },
            },
          ],
        },
        ManagedPolicyArns: Match.arrayWith([
          Match.objectLike({
            'Fn::Join': [
              '',
              Match.arrayWith([Match.stringLikeRegexp('.*AWSLambdaBasicExecutionRole')]),
            ],
          }),
        ]),
      });
    });

    it('should create function URL by default', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Lambda::Url', 1);
      template.hasResourceProperties('AWS::Lambda::Url', {
        AuthType: 'NONE',
      });
    });
  });

  describe('customization', () => {
    it('should allow custom function name', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
        lambdaConfig: {
          functionName: 'custom-function-name',
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'custom-function-name',
      });
    });

    it('should allow custom memory size and timeout', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
        lambdaConfig: {
          memorySize: 1024,
          timeout: 60,
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 1024,
        Timeout: 60,
      });
    });

    it('should allow custom environment variables', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
        lambdaConfig: {
          environment: {
            NODE_ENV: 'production',
            CUSTOM_VAR: 'value',
          },
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            NODE_ENV: 'production',
            CUSTOM_VAR: 'value',
          },
        },
      });
    });

    it('should disable function URL when configured', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
        enableFunctionUrl: false,
      });

      // Assert
      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Lambda::Url', 0);
    });

    it('should use ARM_64 architecture when configured', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
        lambdaConfig: {
          architecture: 'ARM_64',
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Architectures: ['arm64'],
      });
    });
  });

  describe('outputs', () => {
    it('should export function name, ARN, role ARN, and function URL', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
      });

      // Assert
      const template = Template.fromStack(stack);

      // Check for outputs
      template.hasOutput('FunctionName', { Export: Match.absent() });
      template.hasOutput('FunctionArn', { Export: Match.absent() });
      template.hasOutput('RoleArn', { Export: Match.absent() });
      template.hasOutput('FunctionUrl', { Export: Match.absent() });
    });

    it('should not export function URL when disabled', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
        enableFunctionUrl: false,
      });

      // Assert
      const template = Template.fromStack(stack);

      // Check for outputs
      template.hasOutput('FunctionName', { Export: Match.absent() });
      template.hasOutput('FunctionArn', { Export: Match.absent() });
      template.hasOutput('RoleArn', { Export: Match.absent() });

      // Function URL output should not exist
      expect(() => {
        template.hasOutput('FunctionUrl', {});
      }).toThrow();
    });
  });

  describe('tags', () => {
    it('should add correct tags to function', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          { Key: 'Application', Value: 'nagiyu' },
          { Key: 'Service', Value: 'tools' },
        ]),
      });
    });
  });

  describe('ログと X-Ray', () => {
    it('既定で CloudFormation 管理の LogGroup を保持期間 30 日で作り、X-Ray を有効にする', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Logs::LogGroup', 1);
      template.hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/nagiyu-tools-lambda-dev',
        RetentionInDays: 30,
      });
      template.resourceCountIs('Custom::LogRetention', 0);
      template.hasResourceProperties('AWS::Lambda::Function', {
        TracingConfig: { Mode: 'Active' },
        LoggingConfig: { LogGroup: { Ref: Match.stringLikeRegexp('^FunctionLogGroup') } },
      });
    });

    it('関数名を変えると、ロググループ名もその関数名に従う', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'prod',
        ecrRepositoryName: 'nagiyu-tools-ecr-prod',
        lambdaConfig: { functionName: 'custom-function-name' },
      });

      // Assert
      Template.fromStack(stack).hasResourceProperties('AWS::Logs::LogGroup', {
        LogGroupName: '/aws/lambda/custom-function-name',
      });
    });

    it('既存ロググループの引き継ぎ指定では LogGroup を作らず、LogRetention で保持期間を設定する', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
        lambdaConfig: { adoptExistingLogGroup: true },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Logs::LogGroup', 0);
      template.hasResourceProperties('Custom::LogRetention', { RetentionInDays: 30 });
      template.hasResourceProperties('AWS::Lambda::Function', {
        TracingConfig: { Mode: 'Active' },
      });
    });

    it('error-events の環境変数と権限を既定で足さない', () => {
      // Arrange & Act
      const stack = new LambdaStackBase(app, 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
      });

      // Assert
      expect(JSON.stringify(Template.fromStack(stack).toJSON())).not.toContain('error-events');
    });
  });

  describe('論理 ID の互換性', () => {
    // 既存スタックの関数・ロールは名前固定で、論理 ID が変わると置き換えに失敗する。
    // 引き継ぎ指定の有無でも変わってはならない。
    const collectIds = (adopt: boolean, logicalId?: string): Record<string, string[]> => {
      const s = new LambdaStackBase(new cdk.App(), 'TestLambdaStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrRepositoryName: 'nagiyu-tools-ecr-dev',
        lambdaConfig: { adoptExistingLogGroup: adopt, logicalId },
      });
      const t = Template.fromStack(s);
      const withoutLogRetention = (ids: string[]): string[] =>
        ids.filter((id) => !id.startsWith('LogRetention'));
      return {
        functions: withoutLogRetention(Object.keys(t.findResources('AWS::Lambda::Function'))),
        roles: withoutLogRetention(Object.keys(t.findResources('AWS::IAM::Role'))),
        urls: Object.keys(t.findResources('AWS::Lambda::Url')),
      };
    };

    it('関数の論理 ID は既定で Function、ロールは LambdaExecutionRole から始まる', () => {
      const ids = collectIds(false);

      expect(ids.functions).toEqual([expect.stringMatching(/^Function[0-9A-F]{8}$/)]);
      expect(ids.roles).toEqual([expect.stringMatching(/^LambdaExecutionRole[0-9A-F]{8}$/)]);
    });

    it('logicalId の指定が関数の論理 ID になる', () => {
      const ids = collectIds(false, 'WebFunction');

      expect(ids.functions).toEqual([expect.stringMatching(/^WebFunction[0-9A-F]{8}$/)]);
    });

    it('引き継ぎ指定の有無で、関数・ロール・Function URL の論理 ID が変わらない', () => {
      expect(collectIds(true)).toEqual(collectIds(false));
      expect(collectIds(true, 'WebFunction')).toEqual(collectIds(false, 'WebFunction'));
    });
  });
});
