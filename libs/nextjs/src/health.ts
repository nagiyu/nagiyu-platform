import { NextResponse } from 'next/server';

/**
 * Health check レスポンスの付加情報
 */
export interface HealthRouteOptions {
  service?: string;
  version?: string;
}

/**
 * サービス共通の health route ハンドラーを生成する。
 *
 * @param options - service/version の任意メタ情報
 * @returns Next.js Route Handler (GET)
 *
 * @example
 * ```typescript
 * export const GET = createHealthRoute({ service: 'admin', version: '1.0.0' });
 * ```
 */
export function createHealthRoute(options?: HealthRouteOptions) {
  return async function GET() {
    return NextResponse.json({
      status: 'ok',
      ...(options?.service && { service: options.service }),
      ...(options?.version && { version: options.version }),
      timestamp: new Date().toISOString(),
    });
  };
}
