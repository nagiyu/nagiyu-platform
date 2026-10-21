import { createVapidPublicKeyRoute } from '@nagiyu/nextjs';
import { createPushRouteErrorReporter } from '@/lib/server/api-error-reporting';

export const GET = createVapidPublicKeyRoute({
  onError: createPushRouteErrorReporter('Web API: VAPID 公開鍵取得エラー'),
});
