import { createVapidPublicKeyRoute } from '@nagiyu/nextjs';
import { createPushRouteOnError } from '../../../../lib/api-error-reporting';

export const GET = createVapidPublicKeyRoute({
  onError: createPushRouteOnError('Web API: VAPID 公開鍵取得エラー'),
});
