export const BILLING_CLIENT_MESSAGES = {
  REQUEST_FAILED: '通信に失敗しました。時間をおいてもう一度お試しください',
  UNEXPECTED: '予期しない応答でした。時間をおいてもう一度お試しください',
} as const;

export type RedirectUrlResult = { ok: true; url: string } | { ok: false; message: string };

export type CancelScheduledChangeResult = { ok: true } | { ok: false; message: string };

type PostResult =
  | { ok: true; data: { url?: unknown; scheduled?: unknown } | null }
  | { ok: false; message: string };

async function postJson(path: string, body: Record<string, unknown>): Promise<PostResult> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    return { ok: false, message: BILLING_CLIENT_MESSAGES.REQUEST_FAILED };
  }

  const data: { url?: unknown; scheduled?: unknown; error?: unknown } | null = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.error === 'string' ? data.error : BILLING_CLIENT_MESSAGES.UNEXPECTED;
    return { ok: false, message };
  }
  return { ok: true, data };
}

export async function requestRedirectUrl(
  path: string,
  body: Record<string, unknown>
): Promise<RedirectUrlResult> {
  const result = await postJson(path, body);
  if (!result.ok) {
    return result;
  }
  if (typeof result.data?.url !== 'string') {
    return { ok: false, message: BILLING_CLIENT_MESSAGES.UNEXPECTED };
  }
  return { ok: true, url: result.data.url };
}

/** 下げの予約を取り消す。成功は本文を読まず HTTP の成否だけで決める */
export async function requestCancelScheduledChange(
  serviceId: string
): Promise<CancelScheduledChangeResult> {
  const result = await postJson('/api/billing/scheduled-change/cancel', { serviceId });
  return result.ok ? { ok: true } : result;
}

/** 下げを請求期間の終わりに予約する。成功は予約が作られたことを示す応答で決める */
export async function requestScheduleDowngrade(
  roleId: string,
  callbackUrl: string | null
): Promise<CancelScheduledChangeResult> {
  const result = await postJson('/api/billing/plan-change', {
    roleId,
    ...(callbackUrl ? { callbackUrl } : {}),
  });
  if (!result.ok) {
    return result;
  }
  return result.data?.scheduled === true
    ? { ok: true }
    : { ok: false, message: BILLING_CLIENT_MESSAGES.UNEXPECTED };
}
