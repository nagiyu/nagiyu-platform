/**
 * 認証関連のユーティリティ関数
 *
 * auth サービスへの URL 構築など、サービス横断で共通利用する純粋関数を集める。
 * libs 内のため、パスエイリアス（@/）は使用せず相対 import のみを使用する。
 */

/**
 * auth サービスの指定エンドポイント URL を生成する内部ヘルパー。
 *
 * @param authUrl - auth サービスのベース URL
 * @param endpointPath - エンドポイントのパス（例: "/api/auth/signout"）
 * @param callbackUrl - リダイレクト後の戻り先 URL（省略時はクエリパラメータなし）
 * @returns 完全な URL 文字列
 */
function buildAuthUrl(authUrl: string, endpointPath: string, callbackUrl?: string): string {
  // 末尾スラッシュを正規化して二重スラッシュを防ぐ
  const base = authUrl.replace(/\/+$/, '');
  const endpoint = `${base}${endpointPath}`;

  if (callbackUrl === undefined || callbackUrl === '') {
    return endpoint;
  }

  return `${endpoint}?callbackUrl=${encodeURIComponent(callbackUrl)}`;
}

/**
 * auth サービスのサインアウト URL を生成する。
 *
 * サインアウト処理は Cookie 発行元である auth サービスに集約する方針のため、
 * 各 consumer サービスは自前で NextAuth の signout POST を受けず、
 * この関数で生成した URL へリダイレクトする。
 *
 * @param authUrl - auth サービスのベース URL（例: "https://auth.nagiyu.com"）
 * @param callbackUrl - サインアウト後のリダイレクト先 URL（省略時は付与しない）
 * @returns auth サービスの signout エンドポイント URL
 */
export function buildSignOutUrl(authUrl: string, callbackUrl?: string): string {
  return buildAuthUrl(authUrl, '/api/auth/signout', callbackUrl);
}

/**
 * auth サービスのセッションリフレッシュ URL を生成する。
 *
 * 管理者によるロール付与後などに、ユーザーが最新のセッション情報を取得するために
 * auth サービスの refresh エンドポイントへリダイレクトする。
 * リフレッシュ完了後は callbackUrl に指定した URL へ戻る。
 *
 * @param authUrl - auth サービスのベース URL（例: "https://auth.nagiyu.com"）
 * @param callbackUrl - リフレッシュ後のリダイレクト先 URL（省略時は付与しない）
 * @returns auth サービスの refresh エンドポイント URL
 */
export function buildRefreshUrl(authUrl: string, callbackUrl?: string): string {
  return buildAuthUrl(authUrl, '/refresh', callbackUrl);
}
