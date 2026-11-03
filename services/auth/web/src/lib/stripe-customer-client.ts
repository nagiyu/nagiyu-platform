/**
 * ユーザー編集画面が Stripe の顧客との対応を外す API を呼ぶ処理。
 *
 * 画面部品から切り離し、通信の失敗と API のエラーを日本語の文言にそろえてテストできるようにする。
 */

export const STRIPE_CUSTOMER_CLIENT_MESSAGES = {
  REQUEST_FAILED: '通信に失敗しました。時間をおいてもう一度お試しください',
  UNLINK_FAILED: 'Stripe の顧客との対応を外すことに失敗しました',
} as const;

export type UnlinkStripeCustomerResult =
  { ok: true; user: unknown } | { ok: false; message: string };

/**
 * Stripe の顧客との対応を外す。
 *
 * @param userId - 対象のユーザー ID
 */
export async function unlinkStripeCustomer(userId: string): Promise<UnlinkStripeCustomerResult> {
  let response: Response;
  try {
    response = await fetch(`/api/users/${encodeURIComponent(userId)}/stripe-customer`, {
      method: 'DELETE',
    });
  } catch {
    return { ok: false, message: STRIPE_CUSTOMER_CLIENT_MESSAGES.REQUEST_FAILED };
  }

  const data: { error?: unknown } | null = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.error === 'string' ? data.error : STRIPE_CUSTOMER_CLIENT_MESSAGES.UNLINK_FAILED;
    return { ok: false, message };
  }
  return { ok: true, user: data };
}
