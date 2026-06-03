import * as cdk from 'aws-cdk-lib';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as elbv2 from 'aws-cdk-lib/aws-elasticloadbalancingv2';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as logs from 'aws-cdk-lib/aws-logs';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import { Construct } from 'constructs';
import {
  Environment,
  SSM_PARAMETERS,
  getDynamoDBTableArn,
  getDynamoDBTableName,
  getEcrRepositoryName,
  grantErrorEventsWrite,
} from '@nagiyu/infra-common';

export interface LiveTalkEcsServiceStackProps extends cdk.StackProps {
  environment: Environment;
  /**
   * アプリバージョン（services/livetalk/web/package.json の version）。
   * ECS Task の `APP_VERSION` env として container に渡し、ランタイムで
   * `/api/health` の version フィールドに反映する。
   */
  appVersion?: string;
}

/**
 * LiveTalk ECS Service スタック
 *
 * - 共通 ECS Cluster（`nagiyu-shared-cluster-{env}`）に Attach
 * - Task Definition: Next.js 単一コンテナ（port 3000）
 *   Phase 1f で同一 Task 内に VOICEVOX コンテナを追加できる構成にしておく
 * - Service: 1 タスク稼働、health check grace period 60s、ALB Target Group へ登録
 * - SSM Parameter に Service 名を出力
 * - Component: livetalk タグを付与
 *
 * イメージタグは `IMAGE_TAG` 環境変数から取得し、Task Definition のリビジョンが
 * 更新されるたびに force-new-deployment でローリングデプロイされる想定。
 */
export class LiveTalkEcsServiceStack extends cdk.Stack {
  public readonly service: ecs.FargateService;
  public readonly taskDefinition: ecs.FargateTaskDefinition;
  public readonly ecsTaskSecurityGroup: ec2.SecurityGroup;

  constructor(scope: Construct, id: string, props: LiveTalkEcsServiceStackProps) {
    super(scope, id, props);

    const { environment, appVersion = '1.0.0' } = props;

    // CDK context から secrets を取得
    // 未指定の場合はプレースホルダーを使用（deploy ジョブで実際の値に更新される）
    const nextAuthSecret =
      scope.node.tryGetContext('nextAuthSecret') || 'PLACEHOLDER_NEXTAUTH_SECRET';

    // OpenAI API キー（Phase 2b / Issue #3248）。
    // 既存の AUTH_SECRET と同じく、deploy ワークフローが Secrets Manager から取得して
    // `--context openAiApiKey=<value>` で渡す方式。Container では `OPENAI_API_KEY` env で参照する。
    const openAiApiKey =
      scope.node.tryGetContext('openAiApiKey') || 'PLACEHOLDER_OPENAI_API_KEY';

    // VAPID キー（Phase 5d / #3346）。Web Push の subscribe / vapid-public-key route が参照する。
    const vapidPublicKey =
      scope.node.tryGetContext('vapidPublicKey') || 'PLACEHOLDER_VAPID_PUBLIC_KEY';
    const vapidPrivateKey =
      scope.node.tryGetContext('vapidPrivateKey') || 'PLACEHOLDER_VAPID_PRIVATE_KEY';

    const authUrl =
      environment === 'prod' ? 'https://auth.nagiyu.com' : `https://dev-auth.nagiyu.com`;

    const appUrl =
      environment === 'prod'
        ? 'https://live-talk.nagiyu.com'
        : 'https://dev-live-talk.nagiyu.com';

    const vpcId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.VPC_ID(environment)
    );
    const publicSubnetIdsStr = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.PUBLIC_SUBNET_IDS(environment)
    );

    const publicSubnetIds = cdk.Fn.split(',', publicSubnetIdsStr);
    const vpc = ec2.Vpc.fromVpcAttributes(this, 'ImportedVpc', {
      vpcId,
      availabilityZones: ['us-east-1a', 'us-east-1b'],
      publicSubnetIds: [
        cdk.Fn.select(0, publicSubnetIds),
        cdk.Fn.select(1, publicSubnetIds),
      ],
    });

    const clusterName = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.SHARED_ECS_CLUSTER_NAME(environment)
    );
    const cluster = ecs.Cluster.fromClusterAttributes(this, 'ImportedSharedCluster', {
      clusterName,
      vpc,
      securityGroups: [],
    });

    const albSecurityGroupId = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.LIVETALK_ALB_SECURITY_GROUP_ID(environment)
    );
    const albSecurityGroup = ec2.SecurityGroup.fromSecurityGroupId(
      this,
      'ImportedAlbSecurityGroup',
      albSecurityGroupId
    );

    const targetGroupArn = ssm.StringParameter.valueForStringParameter(
      this,
      SSM_PARAMETERS.LIVETALK_ALB_TARGET_GROUP_ARN(environment)
    );
    const targetGroup = elbv2.ApplicationTargetGroup.fromTargetGroupAttributes(
      this,
      'ImportedTargetGroup',
      {
        targetGroupArn,
      }
    );

    // DynamoDB Single Table はヘルパーで決定論的に名前 / ARN を組み立てる。
    // CloudFormation の Export/Import によるクロススタック依存を避けるため、
    // SSM ルックアップやスタック参照は使わず、`getDynamoDBTableName` /
    // `getDynamoDBTableArn` を DynamoDB stack 側と揃えて呼ぶ。
    // これにより ECS Service stack は DynamoDB stack の deploy 順序に縛られない。
    const dynamoTableName = getDynamoDBTableName('livetalk', environment);
    const dynamoTableArn = getDynamoDBTableArn(this.region, this.account, dynamoTableName);
    const dynamoTable = dynamodb.Table.fromTableArn(
      this,
      'ImportedDynamoTable',
      dynamoTableArn
    );

    this.ecsTaskSecurityGroup = new ec2.SecurityGroup(this, 'EcsTaskSecurityGroup', {
      vpc,
      securityGroupName: `nagiyu-livetalk-task-sg-${environment}`,
      description: 'Security group for LiveTalk ECS Tasks',
      allowAllOutbound: true,
    });

    this.ecsTaskSecurityGroup.addIngressRule(
      albSecurityGroup,
      ec2.Port.tcp(3000),
      'Allow traffic from LiveTalk ALB'
    );

    const logGroup = new logs.LogGroup(this, 'EcsTaskLogGroup', {
      logGroupName: `/ecs/nagiyu-livetalk-task-${environment}`,
      retention: logs.RetentionDays.ONE_WEEK,
      removalPolicy: cdk.RemovalPolicy.DESTROY,
    });

    const taskExecutionRole = new iam.Role(this, 'TaskExecutionRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS Task Execution Role for LiveTalk',
      managedPolicies: [
        iam.ManagedPolicy.fromAwsManagedPolicyName(
          'service-role/AmazonECSTaskExecutionRolePolicy'
        ),
      ],
    });

    const ecrRepoName = getEcrRepositoryName('livetalk', environment);
    const ecrRepositoryArn = `arn:aws:ecr:${this.region}:${this.account}:repository/${ecrRepoName}`;

    taskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: [
          'ecr:BatchCheckLayerAvailability',
          'ecr:GetDownloadUrlForLayer',
          'ecr:BatchGetImage',
        ],
        resources: [ecrRepositoryArn],
      })
    );

    // ECR GetAuthorizationToken は AWS の仕様上 resource: * を要求する
    taskExecutionRole.addToPolicy(
      new iam.PolicyStatement({
        effect: iam.Effect.ALLOW,
        actions: ['ecr:GetAuthorizationToken'],
        resources: ['*'],
      })
    );

    const taskRole = new iam.Role(this, 'TaskRole', {
      assumedBy: new iam.ServicePrincipal('ecs-tasks.amazonaws.com'),
      description: 'ECS Task Role for LiveTalk',
    });

    const ecrRepositoryUri = `${this.account}.dkr.ecr.${this.region}.amazonaws.com/${ecrRepoName}`;

    const imageTag = process.env.IMAGE_TAG || 'latest';

    // Phase 1f で VOICEVOX コンテナを同一 Task に追加。
    // メモリ内訳: VOICEVOX 2.5GB + Next.js 0.5GB + オーバーヘッド ≈ 4GB
    // CPU は 2 vCPU を web と VOICEVOX で配分（Issue #3356: VOICEVOX 合成の直列化解消）。
    // Fargate の CPU/Memory 組み合わせ制約: cpu=2048 には memory 4096〜16384 が必要。
    this.taskDefinition = new ecs.FargateTaskDefinition(this, 'TaskDefinition', {
      family: `nagiyu-livetalk-task-${environment}`,
      cpu: 2048,
      memoryLimitMiB: 4096,
      executionRole: taskExecutionRole,
      taskRole,
    });

    // VOICEVOX エンジン公式 Docker イメージ。
    // - 1 ECS Task 内に web と同居し、web からは localhost:50021 で接続される
    // - 外部公開不要（Service の Security Group 経由でも 50021 は通さない）
    // - 起動時のモデルロードに 30〜60 秒かかるため startPeriod は 60s
    // - 公式イメージは Docker Hub から直接 pull（ECR ミラー化は将来課題）
    const voicevoxContainer = this.taskDefinition.addContainer('voicevox', {
      containerName: 'voicevox',
      image: ecs.ContainerImage.fromRegistry('voicevox/voicevox_engine:cpu-latest'),
      // cpu_num_threads を 2 に設定し、並列合成リクエストを処理できるようにする（Issue #3356）。
      // 公式イメージの ENTRYPOINT は run バイナリ。command は引数として追記される。
      command: ['--cpu_num_threads', '2'],
      essential: true,
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'ecs',
        logGroup,
      }),
      portMappings: [
        {
          containerPort: 50021,
          protocol: ecs.Protocol.TCP,
        },
      ],
      healthCheck: {
        command: ['CMD-SHELL', 'curl -f http://localhost:50021/version || exit 1'],
        interval: cdk.Duration.seconds(15),
        timeout: cdk.Duration.seconds(5),
        retries: 5,
        startPeriod: cdk.Duration.seconds(60),
      },
    });

    const webContainer = this.taskDefinition.addContainer('livetalk-web', {
      containerName: 'livetalk-web',
      image: ecs.ContainerImage.fromRegistry(`${ecrRepositoryUri}:${imageTag}`),
      logging: ecs.LogDriver.awsLogs({
        streamPrefix: 'ecs',
        logGroup,
      }),
      environment: {
        // admin / niconico-mylist-assistant 等と同じく environment 値をそのまま渡す。
        // 'development' にすると @nagiyu/nextjs の cookie 名サフィックスと domain スコープが
        // Auth サービスの発行 cookie とずれるため、'dev' / 'prod' を使う。
        NODE_ENV: environment,
        // LIVETALK_ENV: EMF メトリクスの Environment ディメンション専用（Issue #3320）。
        // Next.js は next start で NODE_ENV を 'production' に強制上書きするため、
        // メトリクス用の環境識別子として別変数を用意する。
        LIVETALK_ENV: environment,
        PORT: '3000',
        APP_VERSION: appVersion,
        // NextAuth v5 が JWT 署名・検証に使用する secret。Auth サービスと同じ値が必要。
        AUTH_SECRET: nextAuthSecret,
        // Auth サービスの URL（サインインリダイレクト先）
        NEXT_PUBLIC_AUTH_URL: authUrl,
        // 自サービスのベース URL（callbackUrl 生成用）
        APP_URL: appUrl,
        // VOICEVOX エンジンの接続先（同 Task 内 localhost）
        VOICEVOX_URL: 'http://localhost:50021',
        // DynamoDB Single Table 名（Phase 2a で導入）。
        // `@nagiyu/aws` の `getTableName()` がこの環境変数を参照する。
        DYNAMODB_TABLE_NAME: dynamoTableName,
        // OpenAI API キー（Phase 2b）。deploy ワークフローが Secrets Manager から取得して
        // CDK context 経由でここに注入する。アプリは process.env.OPENAI_API_KEY で参照する。
        OPENAI_API_KEY: openAiApiKey,
        // Phase 4a / #3327: Node.js の new Date() を JST 基準にし、getTimeOfDay() の
        // 時間帯判定（朝/昼/夜）を正しく動作させる。ISO8601 タイムスタンプは UTC のまま。
        TZ: 'Asia/Tokyo',
        // VAPID キー（Phase 5d / #3346）。Web Push subscribe / vapid-public-key route が参照する。
        VAPID_PUBLIC_KEY: vapidPublicKey,
        VAPID_PRIVATE_KEY: vapidPrivateKey,
        // エラーイベント登録テーブル（Phase 5f / Issue #3369）
        ERROR_EVENTS_TABLE_NAME: `nagiyu-error-events-${environment}`,
      },
      portMappings: [
        {
          containerPort: 3000,
          protocol: ecs.Protocol.TCP,
        },
      ],
    });

    // VOICEVOX が HEALTHY になるまで web コンテナの起動を遅延させる。
    // これにより /api/echo 初回呼び出しで VOICEVOX 接続不可になる事故を防ぐ。
    webContainer.addContainerDependencies({
      container: voicevoxContainer,
      condition: ecs.ContainerDependencyCondition.HEALTHY,
    });

    // VOICEVOX 起動待ちを含む Service の healthCheckGracePeriod を確保する（VOICEVOX の
    // startPeriod 60s に余裕を持たせる）。
    // dev は Fargate Spot でコスト削減（中断されても Service が自動復旧するため許容）。
    // prod はユーザー利用中の中断を避けるためオンデマンドを維持（Issue #3356）。
    this.service = new ecs.FargateService(this, 'Service', {
      cluster,
      taskDefinition: this.taskDefinition,
      serviceName: `nagiyu-livetalk-service-${environment}`,
      desiredCount: 1,
      assignPublicIp: true,
      securityGroups: [this.ecsTaskSecurityGroup],
      vpcSubnets: {
        subnets: vpc.publicSubnets,
      },
      healthCheckGracePeriod: cdk.Duration.seconds(120),
      capacityProviderStrategies: [
        {
          capacityProvider: environment === 'dev' ? 'FARGATE_SPOT' : 'FARGATE',
          weight: 1,
        },
      ],
    });

    // ECS Task が DynamoDB Single Table を読み書きできるよう IAM 権限を付与する。
    // PITR や Backup 系の操作は不要、Read/Write のみで十分。
    dynamoTable.grantReadWriteData(taskRole);

    // エラーイベント書き込み権限（Phase 5f / Issue #3369）。batch と同じ設定。
    grantErrorEventsWrite(this, taskRole, environment);

    // ALB ターゲットには明示的に livetalk-web:3000 を指定する。
    // attachToApplicationTargetGroup() の暗黙的なデフォルトは「最初に addContainer された
    // コンテナ」を拾うため、複数コンテナ構成では voicevox:50021 が誤ってターゲットになり
    // ALB health check が voicevox に向かい全タスクが unhealthy で再起動を繰り返す事故が起きた。
    // 順番依存を排除するため、container/port を明示的に渡す。
    targetGroup.addTarget(
      this.service.loadBalancerTarget({
        containerName: 'livetalk-web',
        containerPort: 3000,
      })
    );

    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Environment', environment);
    cdk.Tags.of(this).add('ManagedBy', 'CDK');
    cdk.Tags.of(this).add('Component', 'livetalk');

    new cdk.CfnOutput(this, 'ServiceName', {
      value: this.service.serviceName,
      description: 'LiveTalk ECS Service name',
    });

    new cdk.CfnOutput(this, 'ServiceArn', {
      value: this.service.serviceArn,
      description: 'LiveTalk ECS Service ARN',
    });

    new cdk.CfnOutput(this, 'TaskDefinitionArn', {
      value: this.taskDefinition.taskDefinitionArn,
      description: 'LiveTalk Task Definition ARN',
    });

    new cdk.CfnOutput(this, 'TaskSecurityGroupId', {
      value: this.ecsTaskSecurityGroup.securityGroupId,
      description: 'LiveTalk ECS Task Security Group ID',
    });

    new ssm.StringParameter(this, 'ServiceNameParam', {
      parameterName: SSM_PARAMETERS.LIVETALK_ECS_SERVICE_NAME(environment),
      stringValue: this.service.serviceName,
      description: 'LiveTalk ECS Service name',
      tier: ssm.ParameterTier.STANDARD,
    });
  }
}
