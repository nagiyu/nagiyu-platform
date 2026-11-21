import * as cdk from 'aws-cdk-lib';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import type { Construct } from 'constructs';
import { SECURITY_HEADERS } from '../constants/security-headers';

/**
 * createResponseHeadersPolicy のエラーメッセージ定数
 */
export const RESPONSE_HEADERS_POLICY_ERROR_MESSAGES = {
  NO_HEADERS_ENABLED:
    'レスポンスヘッダーポリシーを作成できません。securityHeaders か noindex の少なくとも一方を ' +
    'true にしてください (どちらも false だと中身のないポリシーになります)',
} as const;

/**
 * レスポンスヘッダーポリシーのプロパティ
 */
export interface ResponseHeadersPolicyProps {
  /**
   * ポリシー名
   */
  responseHeadersPolicyName: string;

  /**
   * ポリシーのコメント
   */
  comment: string;

  /**
   * セキュリティヘッダー (HSTS・X-Content-Type-Options・X-Frame-Options・
   * X-XSS-Protection・Referrer-Policy) を付けるか
   */
  securityHeaders: boolean;

  /**
   * X-Frame-Options の値
   *
   * 同じオリジンの iframe で画面を描くサイト (Storybook、Playwright のレポート) は、
   * DENY だと自身のフレームが表示できないため、SAMEORIGIN を指定する。
   * securityHeaders が false のときは使われない。
   * @default 'DENY'
   */
  frameOption?: 'DENY' | 'SAMEORIGIN';

  /**
   * 検索エンジンへのインデックスを拒否する X-Robots-Tag (noindex, nofollow) を付けるか
   */
  noindex: boolean;
}

/**
 * CloudFront のレスポンスヘッダーポリシーを作成する。
 *
 * セキュリティヘッダーの中身は共通定数から組み立て、サービスごとの差が出ないようにする。
 *
 * @param scope - 親コンストラクト
 * @param id - ポリシーのコンストラクト ID
 * @param props - ポリシーのプロパティ
 * @returns 作成したポリシー
 * @throws securityHeaders も noindex も false のとき
 */
export function createResponseHeadersPolicy(
  scope: Construct,
  id: string,
  props: ResponseHeadersPolicyProps
): cloudfront.ResponseHeadersPolicy {
  const { responseHeadersPolicyName, comment, securityHeaders, frameOption, noindex } = props;

  if (!securityHeaders && !noindex) {
    throw new Error(RESPONSE_HEADERS_POLICY_ERROR_MESSAGES.NO_HEADERS_ENABLED);
  }

  const resolvedFrameOption =
    (frameOption ?? SECURITY_HEADERS.frameOptions.frameOption) === 'SAMEORIGIN'
      ? cloudfront.HeadersFrameOption.SAMEORIGIN
      : cloudfront.HeadersFrameOption.DENY;

  return new cloudfront.ResponseHeadersPolicy(scope, id, {
    responseHeadersPolicyName,
    comment,
    ...(securityHeaders && {
      securityHeadersBehavior: {
        strictTransportSecurity: {
          accessControlMaxAge: cdk.Duration.seconds(
            SECURITY_HEADERS.strictTransportSecurity.accessControlMaxAge
          ),
          includeSubdomains: SECURITY_HEADERS.strictTransportSecurity.includeSubdomains,
          preload: SECURITY_HEADERS.strictTransportSecurity.preload,
          override: SECURITY_HEADERS.strictTransportSecurity.override,
        },
        contentTypeOptions: {
          override: SECURITY_HEADERS.contentTypeOptions.override,
        },
        frameOptions: {
          frameOption: resolvedFrameOption,
          override: SECURITY_HEADERS.frameOptions.override,
        },
        xssProtection: {
          protection: SECURITY_HEADERS.xssProtection.protection,
          modeBlock: SECURITY_HEADERS.xssProtection.modeBlock,
          override: SECURITY_HEADERS.xssProtection.override,
        },
        referrerPolicy: {
          referrerPolicy: cloudfront.HeadersReferrerPolicy.STRICT_ORIGIN_WHEN_CROSS_ORIGIN,
          override: SECURITY_HEADERS.referrerPolicy.override,
        },
      },
    }),
    ...(noindex && {
      customHeadersBehavior: {
        customHeaders: [
          {
            header: 'X-Robots-Tag',
            value: 'noindex, nofollow',
            override: true,
          },
        ],
      },
    }),
  });
}
