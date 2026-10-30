import { createVapidPublicKeyRoute } from '@nagiyu/nextjs';
import { errorReporter } from '@/lib/api-error-reporting';

export const GET = createVapidPublicKeyRoute({
  onError: errorReporter.onError('Web API: VAPID 公開鍵取得エラー'),
});
