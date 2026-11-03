/**
 * 課金の画面遷移で使う URL の組み立て。
 *
 * 戻り先 (`callbackUrl`) は検証済みの値だけを受け取る。
 */

const PLANS_PATH = '/plans';

function withCallback(path: string, params: Record<string, string>, callbackUrl: string | null) {
  const query = new URLSearchParams(params);
  if (callbackUrl) {
    query.set('callbackUrl', callbackUrl);
  }
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

/** プランの画面の相対パス。ログイン後の戻り先などに使う */
export function buildPlansPath(callbackUrl: string | null): string {
  return withCallback(PLANS_PATH, {}, callbackUrl);
}

/** 申し込みの成功時と中止時の戻り先 */
export function buildCheckoutUrls(
  baseUrl: string,
  callbackUrl: string | null
): { successUrl: string; cancelUrl: string } {
  return {
    successUrl: `${baseUrl}${withCallback(PLANS_PATH, { checkout: 'success' }, callbackUrl)}`,
    cancelUrl: `${baseUrl}${buildPlansPath(callbackUrl)}`,
  };
}

/** 契約の管理から戻る先 */
export function buildPortalReturnUrl(baseUrl: string, callbackUrl: string | null): string {
  return `${baseUrl}${buildPlansPath(callbackUrl)}`;
}

/**
 * 決済直後に、権限の再取得 (`/refresh`) へ送る相対パス。
 *
 * 戻り先が無いときはプランの画面に戻す。
 */
export function buildRefreshPath(baseUrl: string, callbackUrl: string | null): string {
  const target = callbackUrl ?? `${baseUrl}${PLANS_PATH}`;
  return `/refresh?${new URLSearchParams({ callbackUrl: target }).toString()}`;
}

/** サインインの画面への相対パス。戻り先は今のプランの画面 */
export function buildSignInPath(callbackUrl: string | null): string {
  return `/signin?${new URLSearchParams({ callbackUrl: buildPlansPath(callbackUrl) }).toString()}`;
}
