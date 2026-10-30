/**
 * Web Push Subscribe API Endpoint
 *
 * POST /api/push/subscribe - Web Push サブスクリプション登録
 *
 * Required Permission: stocks:write-own
 */

import { createPushSubscribeRoute } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';
import { errorReporter } from '../../../../lib/api-error-reporting';

export const POST = createPushSubscribeRoute({
  getSession,
  requiredPermission: 'stocks:write-own',
  onError: errorReporter.onError('Web API: Push 購読登録エラー'),
});
