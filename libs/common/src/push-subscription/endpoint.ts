/**
 * Push サービスの endpoint として許可するホスト。
 *
 * web-push は endpoint のスキームを見ず hostname と port だけで常に https 送信するため、
 * 任意の URL を受けると任意ホストへの送信 (SSRF) に使われる。宛先を既知の Push サービスに限る。
 * 新しい Push サービスが現れたら、ここに足す。
 */
const ALLOWED_PUSH_HOSTS: readonly string[] = [
  'fcm.googleapis.com',
  'updates.push.services.mozilla.com',
  'web.push.apple.com',
];

/**
 * 許可するホストのサフィックス。Windows Push Notification Service はリージョンごとに
 * サブドメインが変わる (例: wns2-par02p.notify.windows.com) ため、サフィックスで許可する。
 * 先頭のドットを含めることで、`evilnotify.windows.com` のような別ドメインを弾く。
 */
const ALLOWED_PUSH_HOST_SUFFIXES: readonly string[] = ['.notify.windows.com'];

/** endpoint を拒否した理由 */
export type PushEndpointRejectReason =
  'INVALID_URL' | 'NOT_HTTPS' | 'PORT_SPECIFIED' | 'HOST_NOT_ALLOWED';

/** endpoint 判定の結果。拒否のうち HOST_NOT_ALLOWED のときだけ hostname を持つ */
export type PushEndpointCheckResult =
  | { allowed: true; hostname: string }
  | { allowed: false; reason: Exclude<PushEndpointRejectReason, 'HOST_NOT_ALLOWED'> }
  | { allowed: false; reason: 'HOST_NOT_ALLOWED'; hostname: string };

/**
 * Push endpoint が https かつ既知の Push サービスのホストかを判定する。
 * 既定の 443 以外のポート指定は拒否する (`:443` 明示は URL 解析で空になるため通る)。
 */
export function checkPushEndpoint(endpoint: string): PushEndpointCheckResult {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return { allowed: false, reason: 'INVALID_URL' };
  }

  if (url.protocol !== 'https:') {
    return { allowed: false, reason: 'NOT_HTTPS' };
  }

  if (url.port !== '') {
    return { allowed: false, reason: 'PORT_SPECIFIED' };
  }

  const hostname = url.hostname.toLowerCase();
  const hostAllowed =
    ALLOWED_PUSH_HOSTS.includes(hostname) ||
    ALLOWED_PUSH_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix));

  if (!hostAllowed) {
    return { allowed: false, reason: 'HOST_NOT_ALLOWED', hostname };
  }

  return { allowed: true, hostname };
}
