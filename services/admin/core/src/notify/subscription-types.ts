import type { PushSubscription } from '@nagiyu/common';

/** 保存済みの Web Push 購読。時刻は数値ミリ秒 */
export type PushSubscriptionRecord = {
  subscriptionId: string;
  userId: string;
  subscription: PushSubscription;
  createdAt: number;
  updatedAt: number;
};
