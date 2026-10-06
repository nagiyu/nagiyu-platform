/**
 * POST /api/push/subscribe — Web Push サブスクリプション登録。
 *
 * 検証と ID 生成は共通ファクトリに任せ、リブトーク固有の保存先 (USER# 配下) への
 * 書き込みだけを onSubscribe で行う。
 */
import { createPushSubscribeRoute } from '@nagiyu/nextjs';
import { getSession } from '@/lib/server/session';
import { getPushSubscriptionRepository } from '@/lib/server/repositories';

export const POST = createPushSubscribeRoute({
  getSession,
  requiredPermission: 'livetalk:chat',
  onSubscribe: async ({ session, subscription, subscriptionId }) => {
    await getPushSubscriptionRepository().put({
      UserID: session.user.googleId,
      SubscriptionID: subscriptionId,
      Endpoint: subscription.endpoint,
      P256dhKey: subscription.keys.p256dh,
      AuthKey: subscription.keys.auth,
    });
  },
});
