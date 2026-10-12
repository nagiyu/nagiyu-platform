import { createVapidPublicKeyRoute } from '@nagiyu/nextjs';
import { createRouteErrorReporter } from '@/lib/api-error-reporting';

export const GET = createVapidPublicKeyRoute({
  onError: createRouteErrorReporter('Web API: VAPID 公開鍵取得エラー'),
});
