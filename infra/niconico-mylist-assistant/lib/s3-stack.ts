import * as cdk from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';

export interface S3StackProps extends cdk.StackProps {
  environment: string;
}

/**
 * niconico-mylist-assistant サービス用の S3 スタック
 *
 * バッチ処理のスクリーンショット保存用バケットを提供します。
 *
 * セキュリティ設定:
 * - パブリックアクセスをブロック
 * - 暗号化を有効化 (SSE-S3)
 * - ライフサイクルルールで7日後に削除（スクリーンショットは一時的なデバッグ用のため）
 */
export class S3Stack extends cdk.Stack {
  public readonly screenshotBucket: s3.IBucket;
  public readonly screenshotBucketName: string;

  constructor(scope: Construct, id: string, props: S3StackProps) {
    super(scope, id, props);

    const { environment } = props;

    // スクリーンショット保存用バケット
    this.screenshotBucket = new s3.Bucket(this, 'ScreenshotBucket', {
      bucketName: `nagiyu-niconico-mylist-assistant-screenshots-${environment}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: cdk.RemovalPolicy.RETAIN, // 本番データ保護のため RETAIN
      autoDeleteObjects: false,
      lifecycleRules: [
        {
          id: 'DeleteOldScreenshots',
          enabled: true,
          expiration: cdk.Duration.days(7), // 7日後に自動削除
        },
      ],
      versioned: false,
    });

    this.screenshotBucketName = this.screenshotBucket.bucketName;

    // Outputs
    new cdk.CfnOutput(this, 'ScreenshotBucketName', {
      value: this.screenshotBucket.bucketName,
      description: 'S3 bucket name for screenshots',
    });

    new cdk.CfnOutput(this, 'ScreenshotBucketArn', {
      value: this.screenshotBucket.bucketArn,
      description: 'S3 bucket ARN for screenshots',
    });

    // タグの追加
    cdk.Tags.of(this).add('Application', 'nagiyu');
    cdk.Tags.of(this).add('Service', 'niconico-mylist-assistant');
    cdk.Tags.of(this).add('Environment', environment);
  }
}
