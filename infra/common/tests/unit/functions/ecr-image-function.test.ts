import * as cdk from 'aws-cdk-lib';
import * as ecr from 'aws-cdk-lib/aws-ecr';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import { Match, Template } from 'aws-cdk-lib/assertions';
import {
  createEcrImageFunction,
  EcrImageFunctionProps,
} from '../../../src/functions/ecr-image-function';
import {
  DEFAULT_LAMBDA_LOG_RETENTION,
  DEFAULT_LAMBDA_TRACING,
} from '../../../src/constants/defaults';

describe('createEcrImageFunction', () => {
  let app: cdk.App;
  let stack: cdk.Stack;
  let repository: ecr.IRepository;

  const baseProps = (): EcrImageFunctionProps => ({
    functionName: 'nagiyu-sample-fn-dev',
    serviceName: 'sample',
    deployEnvironment: 'dev',
    repository,
  });

  beforeEach(() => {
    app = new cdk.App();
    stack = new cdk.Stack(app, 'TestStack');
    repository = ecr.Repository.fromRepositoryName(stack, 'Repo', 'nagiyu-sample-ecr-dev');
  });

  describe('定数', () => {
    it('ログ保持期間の既定は 30 日、トレーシングの既定は ACTIVE である', () => {
      expect(DEFAULT_LAMBDA_LOG_RETENTION).toBe(30);
      expect(DEFAULT_LAMBDA_TRACING).toBe(lambda.Tracing.ACTIVE);
    });
  });

  describe('既定の構成', () => {
    it('ECR イメージ (latest) から関数を作り、既定値を適用する', () => {
      createEcrImageFunction(stack, 'SampleFunction', baseProps());

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        FunctionName: 'nagiyu-sample-fn-dev',
        PackageType: 'Image',
        MemorySize: 512,
        Timeout: 30,
        Architectures: ['x86_64'],
        TracingConfig: { Mode: 'Active' },
      });
      expect(JSON.stringify(template.toJSON())).toContain(':latest');
    });

    it('CloudFormation 管理の LogGroup を保持期間 30 日で作り、関数に渡す', () => {
      createEcrImageFunction(stack, 'SampleFunction', baseProps());

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Logs::LogGroup', 1);
      template.hasResource('AWS::Logs::LogGroup', {
        Properties: {
          LogGroupName: '/aws/lambda/nagiyu-sample-fn-dev',
          RetentionInDays: 30,
        },
        DeletionPolicy: 'Delete',
        UpdateReplacePolicy: 'Delete',
      });
      template.hasResourceProperties('AWS::Lambda::Function', {
        LoggingConfig: { LogGroup: { Ref: Match.stringLikeRegexp('^SampleFunctionLogGroup') } },
      });
      // LogRetention カスタムリソースは使わない
      template.resourceCountIs('Custom::LogRetention', 0);
    });

    it('タグ 3 つを付ける', () => {
      createEcrImageFunction(stack, 'SampleFunction', baseProps());

      Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([
          { Key: 'Application', Value: 'nagiyu' },
          { Key: 'Environment', Value: 'dev' },
          { Key: 'Service', Value: 'sample' },
        ]),
      });
    });

    it('Service タグは serviceName で指定できる', () => {
      createEcrImageFunction(stack, 'SampleFunction', {
        ...baseProps(),
        serviceName: 'admin-batch',
      });

      Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
        Tags: Match.arrayWith([{ Key: 'Service', Value: 'admin-batch' }]),
      });
    });
  });

  describe('論理 ID', () => {
    it('関数の論理 ID は渡した id から決まり、ロググループは別 id になる', () => {
      createEcrImageFunction(stack, 'SampleFunction', baseProps());

      const template = Template.fromStack(stack);
      const functions = Object.keys(template.findResources('AWS::Lambda::Function'));
      expect(functions).toHaveLength(1);
      expect(functions[0]).toMatch(/^SampleFunction[0-9A-F]{8}$/);
      const logGroups = Object.keys(template.findResources('AWS::Logs::LogGroup'));
      expect(logGroups[0]).toMatch(/^SampleFunctionLogGroup[0-9A-F]{8}$/);
    });

    it('LogGroup を足しても関数と渡したロールの論理 ID は変わらない', () => {
      // 既存スタックの関数・ロールは名前固定で、論理 ID が変わると置き換えに失敗する
      const build = (adopt: boolean): Record<string, string[]> => {
        const s = new cdk.Stack(new cdk.App(), 'S');
        const repo = ecr.Repository.fromRepositoryName(s, 'Repo', 'r');
        const role = new iam.Role(s, 'WebExecutionRole', {
          roleName: 'fixed-role-name',
          assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
        });
        createEcrImageFunction(s, 'WebFunction', {
          functionName: 'fixed-fn-name',
          serviceName: 'sample',
          deployEnvironment: 'dev',
          repository: repo,
          role,
          adoptExistingLogGroup: adopt,
        });
        const t = Template.fromStack(s);
        return {
          functions: Object.keys(t.findResources('AWS::Lambda::Function')).filter(
            (k) => !k.startsWith('LogRetention')
          ),
          roles: Object.keys(t.findResources('AWS::IAM::Role')).filter(
            (k) => !k.startsWith('LogRetention')
          ),
        };
      };

      const created = build(false);
      const adopted = build(true);
      expect(created.functions).toEqual(adopted.functions);
      expect(created.roles).toEqual(adopted.roles);
      expect(created.functions[0]).toMatch(/^WebFunction[0-9A-F]{8}$/);
      expect(created.roles).toEqual([expect.stringMatching(/^WebExecutionRole[0-9A-F]{8}$/)]);
    });
  });

  describe('既存ロググループの引き継ぎ', () => {
    it('LogGroup を作らず、LogRetention カスタムリソースで保持期間 30 日を設定する', () => {
      createEcrImageFunction(stack, 'SampleFunction', {
        ...baseProps(),
        adoptExistingLogGroup: true,
      });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::Logs::LogGroup', 0);
      template.hasResourceProperties('Custom::LogRetention', {
        // LogRetention は関数名を参照して名前を組み立てる (既存のロググループ名と一致する)
        LogGroupName: {
          'Fn::Join': ['', ['/aws/lambda/', { Ref: Match.stringLikeRegexp('^SampleFunction') }]],
        },
        RetentionInDays: 30,
      });
      template.hasResourceProperties('AWS::Lambda::Function', {
        TracingConfig: { Mode: 'Active' },
      });
    });
  });

  describe('ロール', () => {
    it('ロールを渡さないと Lambda がサービスロールを自動生成する', () => {
      createEcrImageFunction(stack, 'SampleFunction', baseProps());

      const template = Template.fromStack(stack);
      const roles = Object.keys(template.findResources('AWS::IAM::Role'));
      expect(roles).toEqual([expect.stringMatching(/^SampleFunctionServiceRole/)]);
    });

    it('渡したロールを使い、権限はそのロールに付く', () => {
      const role = new iam.Role(stack, 'MyRole', {
        roleName: 'my-role',
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      });
      createEcrImageFunction(stack, 'SampleFunction', { ...baseProps(), role });

      const template = Template.fromStack(stack);
      template.resourceCountIs('AWS::IAM::Role', 1);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Role: { 'Fn::GetAtt': [Match.stringLikeRegexp('^MyRole'), 'Arn'] },
      });
      template.hasResourceProperties('AWS::IAM::Policy', {
        Roles: [{ Ref: Match.stringLikeRegexp('^MyRole') }],
        PolicyDocument: {
          Statement: Match.arrayWith([
            Match.objectLike({ Action: 'dynamodb:PutItem', Effect: 'Allow' }),
          ]),
        },
      });
    });

    it('同じロールを複数の関数に渡しても、書き込み権限は 1 つにまとまる', () => {
      const role = new iam.Role(stack, 'SharedRole', {
        assumedBy: new iam.ServicePrincipal('lambda.amazonaws.com'),
      });
      createEcrImageFunction(stack, 'FnA', { ...baseProps(), functionName: 'fn-a', role });
      createEcrImageFunction(stack, 'FnB', { ...baseProps(), functionName: 'fn-b', role });

      const template = Template.fromStack(stack);
      const policies = Object.values(template.findResources('AWS::IAM::Policy'));
      const putItemStatements = policies.flatMap((p) =>
        (p.Properties.PolicyDocument.Statement as { Action: string | string[] }[]).filter(
          (st) => st.Action === 'dynamodb:PutItem'
        )
      );
      expect(putItemStatements).toHaveLength(1);
    });
  });

  describe('error events', () => {
    it('既定で環境変数を設定し、cross-stack import した ARN への PutItem を付与する', () => {
      createEcrImageFunction(stack, 'SampleFunction', {
        ...baseProps(),
        environment: { NODE_ENV: 'dev' },
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: {
          Variables: {
            NODE_ENV: 'dev',
            ERROR_EVENTS_TABLE_NAME: 'nagiyu-error-events-dev',
          },
        },
      });
      template.hasResourceProperties('AWS::IAM::Policy', {
        PolicyDocument: {
          Statement: Match.arrayWith([
            {
              Action: 'dynamodb:PutItem',
              Effect: 'Allow',
              Resource: { 'Fn::ImportValue': 'nagiyu-error-events-table-arn-dev' },
            },
          ]),
        },
      });
    });

    it('prod では prod のテーブルを指す', () => {
      createEcrImageFunction(stack, 'SampleFunction', {
        ...baseProps(),
        deployEnvironment: 'prod',
      });

      const json = JSON.stringify(Template.fromStack(stack).toJSON());
      expect(json).toContain('nagiyu-error-events-prod');
      expect(json).toContain('nagiyu-error-events-table-arn-prod');
    });

    it('呼び出し元が ERROR_EVENTS_TABLE_NAME を指定しても、権限の対象と揃う値で上書きする', () => {
      createEcrImageFunction(stack, 'SampleFunction', {
        ...baseProps(),
        environment: { ERROR_EVENTS_TABLE_NAME: 'other-table' },
      });

      Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
        Environment: { Variables: { ERROR_EVENTS_TABLE_NAME: 'nagiyu-error-events-dev' } },
      });
    });

    it('無効にすると環境変数も権限も付けない', () => {
      createEcrImageFunction(stack, 'SampleFunction', {
        ...baseProps(),
        enableErrorEvents: false,
        environment: { NODE_ENV: 'dev' },
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        Environment: { Variables: { NODE_ENV: 'dev' } },
      });
      expect(JSON.stringify(template.toJSON())).not.toContain('error-events');
    });

    it('無効にして環境変数も無ければ、Environment を持たない', () => {
      createEcrImageFunction(stack, 'SampleFunction', {
        ...baseProps(),
        enableErrorEvents: false,
      });

      Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
        Environment: Match.absent(),
      });
    });
  });

  describe('既存関数が使うプロパティの受け渡し', () => {
    it('cmd / memory / timeout / architecture / 説明 / 同時実行数 / 一時ストレージ / 再試行 / DLQ を通す', () => {
      const dlq = new sqs.Queue(stack, 'Dlq');
      createEcrImageFunction(stack, 'SampleFunction', {
        ...baseProps(),
        cmd: ['services/sample/dist/handler.handler'],
        memorySize: 2048,
        timeout: cdk.Duration.minutes(15),
        architecture: lambda.Architecture.ARM_64,
        description: '説明',
        reservedConcurrentExecutions: 1,
        ephemeralStorageSize: cdk.Size.mebibytes(10240),
        retryAttempts: 0,
        deadLetterQueue: dlq,
      });

      const template = Template.fromStack(stack);
      template.hasResourceProperties('AWS::Lambda::Function', {
        MemorySize: 2048,
        Timeout: 900,
        Architectures: ['arm64'],
        Description: '説明',
        ReservedConcurrentExecutions: 1,
        EphemeralStorage: { Size: 10240 },
        DeadLetterConfig: { TargetArn: Match.anyValue() },
        ImageConfig: { Command: ['services/sample/dist/handler.handler'] },
      });
      template.hasResourceProperties('AWS::Lambda::EventInvokeConfig', {
        MaximumRetryAttempts: 0,
      });
    });

    it('tracing は上書きできる', () => {
      createEcrImageFunction(stack, 'SampleFunction', {
        ...baseProps(),
        tracing: lambda.Tracing.DISABLED,
      });

      Template.fromStack(stack).hasResourceProperties('AWS::Lambda::Function', {
        TracingConfig: Match.absent(),
      });
    });
  });
});
