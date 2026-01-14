import * as cdk from 'aws-cdk-lib';
import { Match, Template } from 'aws-cdk-lib/assertions';
import { EcrStackBase } from '../../../src/stacks/ecr-stack-base';

describe('EcrStackBase', () => {
  let app: cdk.App;

  beforeEach(() => {
    app = new cdk.App();
  });

  describe('basic instantiation', () => {
    it('should create ECR repository with default settings', () => {
      // Arrange & Act
      const stack = new EcrStackBase(app, 'TestEcrStack', {
        serviceName: 'tools',
        environment: 'dev',
      });

      // Assert
      const template = Template.fromStack(stack);

      // ECR repository exists
      template.resourceCountIs('AWS::ECR::Repository', 1);

      // Repository has correct name
      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'nagiyu-tools-ecr-dev',
        ImageScanningConfiguration: {
          ScanOnPush: true,
        },
        ImageTagMutability: 'MUTABLE',
      });
    });

    it('should apply correct naming convention', () => {
      // Arrange & Act
      const stack = new EcrStackBase(app, 'TestEcrStack', {
        serviceName: 'auth',
        environment: 'prod',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'nagiyu-auth-ecr-prod',
      });
    });

    it('should set RETAIN removal policy for prod environment', () => {
      // Arrange & Act
      const stack = new EcrStackBase(app, 'TestEcrStack', {
        serviceName: 'tools',
        environment: 'prod',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResource('AWS::ECR::Repository', {
        DeletionPolicy: 'Retain',
      });
    });

    it('should set DESTROY removal policy for dev environment', () => {
      // Arrange & Act
      const stack = new EcrStackBase(app, 'TestEcrStack', {
        serviceName: 'tools',
        environment: 'dev',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResource('AWS::ECR::Repository', {
        DeletionPolicy: 'Delete',
      });
    });
  });

  describe('customization', () => {
    it('should allow custom repository name', () => {
      // Arrange & Act
      const stack = new EcrStackBase(app, 'TestEcrStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrConfig: {
          repositoryName: 'custom-repo-name',
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::ECR::Repository', {
        RepositoryName: 'custom-repo-name',
      });
    });

    it('should allow custom image count', () => {
      // Arrange & Act
      const stack = new EcrStackBase(app, 'TestEcrStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrConfig: {
          maxImageCount: 20,
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::ECR::Repository', {
        LifecyclePolicy: {
          LifecyclePolicyText: Match.stringLikeRegexp('.*countNumber.*20.*'),
        },
      });
    });

    it('should disable image scanning when configured', () => {
      // Arrange & Act
      const stack = new EcrStackBase(app, 'TestEcrStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrConfig: {
          imageScanOnPush: false,
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::ECR::Repository', {
        ImageScanningConfiguration: {
          ScanOnPush: false,
        },
      });
    });

    it('should allow IMMUTABLE tag mutability', () => {
      // Arrange & Act
      const stack = new EcrStackBase(app, 'TestEcrStack', {
        serviceName: 'tools',
        environment: 'dev',
        ecrConfig: {
          imageTagMutability: 'IMMUTABLE',
        },
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::ECR::Repository', {
        ImageTagMutability: 'IMMUTABLE',
      });
    });
  });

  describe('outputs', () => {
    it('should export repository URI, ARN, and name', () => {
      // Arrange & Act
      const stack = new EcrStackBase(app, 'TestEcrStack', {
        serviceName: 'tools',
        environment: 'dev',
      });

      // Assert
      const template = Template.fromStack(stack);

      // Check for outputs
      template.hasOutput('RepositoryUri', {});
      template.hasOutput('RepositoryArn', {});
      template.hasOutput('RepositoryName', {});
    });
  });

  describe('tags', () => {
    it('should add correct tags to repository', () => {
      // Arrange & Act
      const stack = new EcrStackBase(app, 'TestEcrStack', {
        serviceName: 'tools',
        environment: 'dev',
      });

      // Assert
      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::ECR::Repository', {
        Tags: Match.arrayWith([
          { Key: 'Application', Value: 'nagiyu' },
          { Key: 'Service', Value: 'tools' },
        ]),
      });
    });
  });
});
