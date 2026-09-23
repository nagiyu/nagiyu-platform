const cdk = require('aws-cdk-lib');
const { Template, Match } = require('aws-cdk-lib/assertions');

require('ts-node/register/transpile-only');
const { LiveTalkEcsServiceStack } = require('../../lib/ecs-service-stack');

const STACK_ENV = { account: '000000000000', region: 'us-east-1' };

const synth = (environment, props = {}) => {
  const app = new cdk.App();
  const stack = new LiveTalkEcsServiceStack(app, `TestLiveTalkService${environment}`, {
    environment,
    env: STACK_ENV,
    ...props,
  });
  return Template.fromStack(stack);
};

describe('LiveTalkEcsServiceStack', () => {
  it('dev の Task Definition は 1vCPU/2048MiB で作成する（Issue #3761）', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'nagiyu-livetalk-task-dev',
      RequiresCompatibilities: ['FARGATE'],
      NetworkMode: 'awsvpc',
      Cpu: '1024',
      Memory: '2048',
    });
  });

  it('prod の Task Definition は 2vCPU/4096MiB を維持する（VOICEVOX 同居）', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'nagiyu-livetalk-task-prod',
      RequiresCompatibilities: ['FARGATE'],
      NetworkMode: 'awsvpc',
      Cpu: '2048',
      Memory: '4096',
    });
  });

  it('livetalk-web コンテナを Next.js port 3000 で定義する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          PortMappings: Match.arrayWith([Match.objectLike({ ContainerPort: 3000 })]),
        }),
      ]),
    });
  });

  it('VOICEVOX コンテナを port 50021 で定義し、healthCheck の startPeriod を 60 秒以上にする', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'voicevox',
          Image: 'voicevox/voicevox_engine:cpu-latest',
          Essential: true,
          PortMappings: Match.arrayWith([Match.objectLike({ ContainerPort: 50021 })]),
          HealthCheck: Match.objectLike({
            StartPeriod: 60,
          }),
        }),
      ]),
    });
  });

  it('livetalk-web は VOICEVOX の HEALTHY を dependsOn し、VOICEVOX_URL を env で渡す', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          DependsOn: Match.arrayWith([
            Match.objectLike({
              ContainerName: 'voicevox',
              Condition: 'HEALTHY',
            }),
          ]),
          Environment: Match.arrayWith([
            { Name: 'VOICEVOX_URL', Value: 'http://localhost:50021' },
          ]),
        }),
      ]),
    });
  });

  it('ECS Service 名を環境名込みで作成し、VOICEVOX 起動待ちを含む 120 秒の grace period を持つ', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'nagiyu-livetalk-service-dev',
      DesiredCount: 1,
      HealthCheckGracePeriodSeconds: 120,
    });
  });

  it('dev は Fargate Spot を使用し、prod はオンデマンド FARGATE を使用する', () => {
    const devTemplate = synth('dev');
    devTemplate.hasResourceProperties('AWS::ECS::Service', {
      CapacityProviderStrategy: Match.arrayWith([
        Match.objectLike({ CapacityProvider: 'FARGATE_SPOT' }),
      ]),
    });

    const prodTemplate = synth('prod');
    prodTemplate.hasResourceProperties('AWS::ECS::Service', {
      CapacityProviderStrategy: Match.arrayWith([
        Match.objectLike({ CapacityProvider: 'FARGATE' }),
      ]),
    });
  });

  it('ALB ターゲットは livetalk-web:3000 を明示的に指定する（voicevox に誤マッピングしない）', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::Service', {
      LoadBalancers: Match.arrayWith([
        Match.objectLike({
          ContainerName: 'livetalk-web',
          ContainerPort: 3000,
        }),
      ]),
    });
  });

  it('Task Security Group が ALB SG からの 3000 番受け入れを設定する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::EC2::SecurityGroup', {
      GroupName: 'nagiyu-livetalk-task-sg-dev',
    });
    template.hasResourceProperties('AWS::EC2::SecurityGroupIngress', {
      FromPort: 3000,
      ToPort: 3000,
      IpProtocol: 'tcp',
    });
  });

  it('SSM Parameter に ECS Service 名を出力する', () => {
    const template = synth('dev');
    // Value は CFN の Fn::GetAtt 参照になるため Name のみ検証する
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/dev/ecs/service-name',
    });
  });

  it('CloudWatch Log Group を 7 日間保持で作成する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::Logs::LogGroup', {
      LogGroupName: '/ecs/nagiyu-livetalk-task-dev',
      RetentionInDays: 7,
    });
  });

  it('Component=livetalk タグを付与する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::Service', {
      Tags: Match.arrayWith([{ Key: 'Component', Value: 'livetalk' }]),
    });
  });

  it('APP_VERSION を container environment に注入する（明示指定）', () => {
    const template = synth('dev', { appVersion: '1.2.3' });
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          Environment: Match.arrayWith([{ Name: 'APP_VERSION', Value: '1.2.3' }]),
        }),
      ]),
    });
  });

  it('APP_VERSION 未指定時は 1.0.0 をデフォルトで注入する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          Environment: Match.arrayWith([{ Name: 'APP_VERSION', Value: '1.0.0' }]),
        }),
      ]),
    });
  });

  it('IMAGE_TAG 環境変数からイメージタグを取得する', () => {
    process.env.IMAGE_TAG = 'abc123';
    try {
      const template = synth('dev');
      template.hasResourceProperties('AWS::ECS::TaskDefinition', {
        ContainerDefinitions: Match.arrayWith([
          Match.objectLike({
            Name: 'livetalk-web',
            Image: Match.stringLikeRegexp('.*:abc123$'),
          }),
        ]),
      });
    } finally {
      delete process.env.IMAGE_TAG;
    }
  });

  it('DYNAMODB_TABLE_NAME はヘルパー命名規則の値をそのまま注入する（SSM 経由ではない）', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          Environment: Match.arrayWith([
            { Name: 'DYNAMODB_TABLE_NAME', Value: 'nagiyu-livetalk-dynamodb-dev' },
          ]),
        }),
      ]),
    });
  });

  it('Task Role に DynamoDB の Read/Write 権限を付与する', () => {
    const template = synth('dev');
    // grantReadWriteData が生成する Allow Statement の Action を見て、
    // 順序非依存（CDK のバージョン更新で並びが変わっても壊れない）に
    // Read/Write 両系統の代表アクションを検証する。
    const policies = template.findResources('AWS::IAM::Policy');
    const taskRolePolicy = Object.values(policies).find((p) => {
      const statements = (p.Properties?.PolicyDocument?.Statement ?? []);
      return statements.some(
        (stmt) =>
          stmt.Effect === 'Allow' &&
          Array.isArray(stmt.Action) &&
          stmt.Action.includes('dynamodb:PutItem')
      );
    });
    expect(taskRolePolicy).toBeDefined();
    const allowStatement = taskRolePolicy.Properties.PolicyDocument.Statement.find(
      (stmt) =>
        stmt.Effect === 'Allow' &&
        Array.isArray(stmt.Action) &&
        stmt.Action.includes('dynamodb:PutItem')
    );
    const actions = allowStatement.Action;
    expect(actions).toEqual(
      expect.arrayContaining([
        'dynamodb:GetItem',
        'dynamodb:Query',
        'dynamodb:PutItem',
        'dynamodb:UpdateItem',
        'dynamodb:DeleteItem',
      ])
    );
  });

  it('Task Role の DynamoDB grant に GSI（index/*）への Query 権限が含まれる', () => {
    // status 画面は GSI2（SafetyEvent 横断レビュー）を Query するため、IAM ポリシーの
    // Resource にテーブル本体に加えて `table/.../index/*` が含まれている必要がある
    // （ADR-2.22 / #3580）。fromTableArn のままだと index ARN が grant されず AccessDenied。
    const template = synth('dev');
    template.hasResourceProperties('AWS::IAM::Policy', {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Action: Match.arrayWith(['dynamodb:Query']),
            Resource: Match.arrayWith([
              Match.stringLikeRegexp('table/nagiyu-livetalk-dynamodb-dev/index/\\*'),
            ]),
          }),
        ]),
      },
    });
  });

  it('prod 環境でも正しい命名で生成する', () => {
    const template = synth('prod');
    template.hasResourceProperties('AWS::ECS::Service', {
      ServiceName: 'nagiyu-livetalk-service-prod',
    });
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      Family: 'nagiyu-livetalk-task-prod',
    });
    template.hasResourceProperties('AWS::SSM::Parameter', {
      Name: '/nagiyu/livetalk/prod/ecs/service-name',
    });
  });

  it('TZ=Asia/Tokyo env を livetalk-web container に注入する（Phase 4a / #3327）', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          Environment: Match.arrayWith([{ Name: 'TZ', Value: 'Asia/Tokyo' }]),
        }),
      ]),
    });
  });

  // Issue #3761: AUTH_SECRET / OPENAI_API_KEY / VAPID_* は CDK context 経由の平文
  // environment ではなく、ECS の secrets:（valueFrom）で Secrets Manager から
  // 直接注入する方式に変更した。タスク定義に秘密情報が平文で残らないことを検証する。
  it('AUTH_SECRET / OPENAI_API_KEY / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY を Secrets（valueFrom）で注入する', () => {
    const template = synth('dev');
    template.hasResourceProperties('AWS::ECS::TaskDefinition', {
      ContainerDefinitions: Match.arrayWith([
        Match.objectLike({
          Name: 'livetalk-web',
          Secrets: Match.arrayWith([
            Match.objectLike({ Name: 'AUTH_SECRET', ValueFrom: Match.anyValue() }),
            Match.objectLike({ Name: 'OPENAI_API_KEY', ValueFrom: Match.anyValue() }),
            Match.objectLike({
              Name: 'VAPID_PUBLIC_KEY',
              ValueFrom: Match.objectLike({
                'Fn::Join': Match.arrayWith([Match.arrayWith([Match.stringLikeRegexp(':publicKey::$')])]),
              }),
            }),
            Match.objectLike({
              Name: 'VAPID_PRIVATE_KEY',
              ValueFrom: Match.objectLike({
                'Fn::Join': Match.arrayWith([
                  Match.arrayWith([Match.stringLikeRegexp(':privateKey::$')]),
                ]),
              }),
            }),
          ]),
        }),
      ]),
    });
  });

  it('AUTH_SECRET / OPENAI_API_KEY / VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY は平文の Environment に含まれない（退行防止）', () => {
    const template = synth('dev');
    const taskDefs = template.findResources('AWS::ECS::TaskDefinition');
    const secretEnvNames = ['AUTH_SECRET', 'OPENAI_API_KEY', 'VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'];
    for (const taskDef of Object.values(taskDefs)) {
      const webContainer = taskDef.Properties.ContainerDefinitions.find(
        (c) => c.Name === 'livetalk-web'
      );
      const envNames = (webContainer.Environment ?? []).map((e) => e.Name);
      for (const secretName of secretEnvNames) {
        expect(envNames).not.toContain(secretName);
      }
    }
  });

  it('Task Execution Role に secretsmanager:GetSecretValue 権限を付与する（secrets: での取得は Execution Role が行う）', () => {
    const template = synth('dev');
    const policies = template.findResources('AWS::IAM::Policy');
    const executionRolePolicies = Object.values(policies).filter((p) =>
      (p.Properties?.Roles ?? []).some(
        (role) => JSON.stringify(role).includes('TaskExecutionRole')
      )
    );
    expect(executionRolePolicies.length).toBeGreaterThan(0);

    const hasSecretsRead = executionRolePolicies.some((policy) => {
      const statements = policy.Properties?.PolicyDocument?.Statement ?? [];
      return statements.some(
        (stmt) =>
          stmt.Effect === 'Allow' &&
          (Array.isArray(stmt.Action)
            ? stmt.Action.includes('secretsmanager:GetSecretValue')
            : stmt.Action === 'secretsmanager:GetSecretValue')
      );
    });
    expect(hasSecretsRead).toBe(true);
  });

  it('Task Role には secretsmanager:GetSecretValue 権限を付与しない（取得は Task Execution Role の責務）', () => {
    const template = synth('dev');
    const policies = template.findResources('AWS::IAM::Policy');
    const taskRolePolicies = Object.values(policies).filter((p) =>
      (p.Properties?.Roles ?? []).some((role) => JSON.stringify(role).includes('"Ref":"TaskRole'))
    );

    for (const policy of taskRolePolicies) {
      const statements = policy.Properties?.PolicyDocument?.Statement ?? [];
      for (const stmt of statements) {
        const actions = Array.isArray(stmt.Action) ? stmt.Action : [stmt.Action];
        expect(actions).not.toContain('secretsmanager:GetSecretValue');
      }
    }
  });
});
