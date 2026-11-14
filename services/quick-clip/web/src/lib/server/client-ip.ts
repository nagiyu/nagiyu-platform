/**
 * CloudFront の viewer-request で接続元 IP を載せるヘッダー名。
 * infra/quick-clip の CloudFront Function が同じ名前で書き込む。
 */
export const VIEWER_IP_HEADER_NAME = 'x-nagiyu-viewer-ip';

const IPV4_MAPPED_IPV6 = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

/**
 * IPv6 は先頭 64 ビット (/64) にまとめる。
 * 1 つの回線には /64 が割り当てられ、末尾の 64 ビットは端末が自由に変えられるため、
 * アドレス全体で数えると同じ回線から無限に別の接続元として数えられてしまう。
 * IPv4 とそのマップ表記はそのまま返す。
 */
const toLimitKey = (ip: string): string => {
  const withoutZone = ip.split('%')[0];
  const mapped = IPV4_MAPPED_IPV6.exec(withoutZone);
  if (mapped) {
    return mapped[1];
  }
  if (!withoutZone.includes(':')) {
    return withoutZone;
  }

  const [head, tail] = withoutZone.split('::');
  const headGroups = head ? head.split(':') : [];
  const tailGroups = tail ? tail.split(':') : [];
  const missing = withoutZone.includes('::') ? 8 - headGroups.length - tailGroups.length : 0;
  const groups = [...headGroups, ...Array<string>(Math.max(missing, 0)).fill('0'), ...tailGroups];
  if (groups.length !== 8) {
    return withoutZone;
  }
  const prefix = groups
    .slice(0, 4)
    .map((group) => group.toLowerCase().padStart(4, '0'))
    .join(':');
  return `${prefix}::/64`;
};

/**
 * 接続元の IP (IP の上限で数えるためのキー) を返す。取れなければ undefined (IP の上限は数えない)。
 *
 * 専用ヘッダーだけを読む。CloudFront Function が毎回上書きするため、CloudFront 経由のときだけ信頼できる。
 * Lambda の Function URL を直接呼ばれると、利用者がこのヘッダーを自由に付けられ、IP の上限を回避できる。
 * `X-Forwarded-For` は先頭をクライアントが偽れるので、代替にすると上限を素通りされる。
 */
export const getClientIp = (headers: Headers): string | undefined => {
  const value = headers.get(VIEWER_IP_HEADER_NAME)?.trim();
  return value ? toLimitKey(value) : undefined;
};
