export const BILLING_CLIENT_MESSAGES = {
  REQUEST_FAILED: '通信に失敗しました。時間をおいてもう一度お試しください',
  UNEXPECTED: '予期しない応答でした。時間をおいてもう一度お試しください',
} as const;

export type RedirectUrlResult = { ok: true; url: string } | { ok: false; message: string };

export async function requestRedirectUrl(
  path: string,
  body: Record<string, unknown>
): Promise<RedirectUrlResult> {
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

  const data: { url?: unknown; error?: unknown } | null = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      typeof data?.error === 'string' ? data.error : BILLING_CLIENT_MESSAGES.UNEXPECTED;
    return { ok: false, message };
  }
  if (typeof data?.url !== 'string') {
    return { ok: false, message: BILLING_CLIENT_MESSAGES.UNEXPECTED };
  }
  return { ok: true, url: data.url };
}
