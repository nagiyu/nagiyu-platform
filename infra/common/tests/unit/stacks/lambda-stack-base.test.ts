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
      template.hasOutput('FunctionName', {});
      template.hasOutput('FunctionArn', {});
      template.hasOutput('RoleArn', {});
      template.hasOutput('FunctionUrl', {});
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
      template.hasOutput('FunctionName', {});
      template.hasOutput('FunctionArn', {});
      template.hasOutput('RoleArn', {});

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
});
