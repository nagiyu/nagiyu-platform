/**
 * Web Push Subscribe API Endpoint
 *
 * POST /api/push/subscribe - Web Push サブスクリプション登録
 */

import { createPushSubscribeRoute } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth/session';

export const POST = createPushSubscribeRoute({
  getSession,
});
