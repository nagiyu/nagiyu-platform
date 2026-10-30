/**
 * Web Push Subscribe API Endpoint
 *
 * POST /api/push/subscribe - Web Push サブスクリプション登録
 */

import { createPushSubscribeRoute } from '@nagiyu/nextjs';
import { errorReporter } from '../../../../lib/api-error-reporting';
import { getSession } from '../../../../lib/auth/session';

export const POST = createPushSubscribeRoute({
  getSession,
  onError: errorReporter.onError('Web API: Push 購読登録エラー'),
});
