import { createHash } from 'crypto';

/**
 * Lambda@Edge (origin-request) のハンドラー。
 *
 * OAC で署名した Function URL は、POST / PUT の本文の SHA256 が `x-amz-content-sha256` に無いと
 * 要求を受けない。ブラウザの送信 (フォーム、Server Actions、認証のコールバック) はこのヘッダーを
 * 付けないため、CloudFront の署名より前にここで計算して入れる。
 *
 * このディレクトリがそのまま Lambda@Edge に配られるので、他のモジュールを import せず、
 * Node 標準のモジュールだけを使う。
 */

const CONTENT_SHA256_HEADER = 'x-amz-content-sha256';

/** 本文が空でも署名に本文のハッシュが要るメソッド */
const METHODS_REQUIRING_HASH = ['POST', 'PUT', 'PATCH'];

export const ERROR_MESSAGES = {
  BODY_TOO_LARGE: 'リクエスト本文が大きすぎます。CloudFront 経由で送れる本文は 1MB までです。',
} as const;

/** CloudFront が渡す本文 (`includeBody: true` のとき) */
export interface EdgeRequestBody {
  inputTruncated?: boolean;
  action?: string;
  encoding?: 'base64' | 'text';
  data?: string;
}

/** CloudFront の要求のうち、このハンドラーが使う部分 */
export interface EdgeRequest {
  method: string;
  headers: Record<string, Array<{ key?: string; value: string }>>;
  body?: EdgeRequestBody;
}

/** CloudFront へ直接返すレスポンス */
export interface EdgeResponse {
  status: string;
  statusDescription: string;
  headers: Record<string, Array<{ key: string; value: string }>>;
  body: string;
}

/**
 * 本文の SHA256 を hex で返す。
 *
 * @param body CloudFront が渡す本文
 * @returns SHA256 の hex
 */
export function calculateBodyHash(body: EdgeRequestBody): string {
  const data = body.data ?? '';
  const buffer = Buffer.from(data, body.encoding === 'base64' ? 'base64' : 'utf8');
  return createHash('sha256').update(buffer).digest('hex');
}

/**
 * origin-request のイベントの要求を処理する。
 *
 * 切り詰められた本文からは正しいハッシュを作れず、署名が通らないまま不明瞭な失敗になるため、
 * その場で 413 を返す。
 *
 * @param request CloudFront の要求
 * @returns ヘッダーを足した (または消した) 要求、または 413 のレスポンス
 */
export function processRequest<T extends EdgeRequest>(request: T): T | EdgeResponse {
  const body = request.body;
  const hasBody = Boolean(body?.data);
  const requiresHash = METHODS_REQUIRING_HASH.includes(request.method.toUpperCase());

  if (!hasBody && !requiresHash) {
    // ビューアーが付けた値が残ると、署名に使われて不一致になるため消す
    delete request.headers[CONTENT_SHA256_HEADER];
    return request;
  }

  if (body?.inputTruncated) {
    return {
      status: '413',
      statusDescription: 'Payload Too Large',
      headers: {
        'content-type': [{ key: 'Content-Type', value: 'text/plain; charset=utf-8' }],
      },
      body: ERROR_MESSAGES.BODY_TOO_LARGE,
    };
  }

  request.headers[CONTENT_SHA256_HEADER] = [
    { key: CONTENT_SHA256_HEADER, value: calculateBodyHash(body ?? {}) },
  ];
  return request;
}

/**
 * Lambda@Edge のエントリーポイント。
 *
 * @param event CloudFront のイベント
 * @returns 要求またはレスポンス
 */
export async function handler(event: {
  Records: Array<{ cf: { request: EdgeRequest } }>;
}): Promise<EdgeRequest | EdgeResponse> {
  return processRequest(event.Records[0].cf.request);
}
