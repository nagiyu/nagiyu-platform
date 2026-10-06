/**
 * Push サブスクリプション endpoint から一意な ID を生成する。
 *
 * 同じ端末の再登録で行が増えないよう、endpoint から決定的に決める。
 * 既存サービスの購読 ID と互換を保つため、SHA-256 の hex 先頭 32 文字に `sub_` を付ける形式を変えてはならない。
 * Edge ランタイムの middleware が `node:crypto` を引き込まないよう、Web Crypto で実装する。
 * endpoint が検証済みであることを呼び出し側が保証する。
 */
export async function createSubscriptionId(endpoint: string): Promise<string> {
  const endpointBytes = new TextEncoder().encode(endpoint);
  const hashBuffer = await globalThis.crypto.subtle.digest('SHA-256', endpointBytes);
  const hashHex = Array.from(new Uint8Array(hashBuffer))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');

  return `sub_${hashHex.substring(0, 32)}`;
}
