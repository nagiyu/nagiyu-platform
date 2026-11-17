import * as s3 from 'aws-cdk-lib/aws-s3';
import type { Construct } from 'constructs';

/**
 * サービス用 S3 バケットのプロパティ。
 * 暗号化・パブリックアクセスブロック・SSL 強制は共通関数が固定するため、上書きできない。
 */
export type ServiceBucketProps = Omit<
  s3.BucketProps,
  'encryption' | 'blockPublicAccess' | 'enforceSSL'
>;

/**
 * サービス用 S3 バケットを作成する。
 *
 * 暗号化 (SSE-S3)・パブリックアクセスの全面ブロック・HTTPS 限定を固定する。
 * バケットごとにセキュリティ設定の差が出るのを防ぐため、呼び出し側では上書きできない。
 * それ以外のプロパティ (名前・ライフサイクル・CORS・削除ポリシー等) はそのまま渡す。
 *
 * @param scope - 親コンストラクト
 * @param id - バケットのコンストラクト ID
 * @param props - バケットのプロパティ
 * @returns 作成したバケット
 */
export function createServiceBucket(
  scope: Construct,
  id: string,
  props: ServiceBucketProps
): s3.Bucket {
  return new s3.Bucket(scope, id, {
    ...props,
    encryption: s3.BucketEncryption.S3_MANAGED,
    blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
    enforceSSL: true,
  });
}
