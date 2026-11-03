// callbackUrl は検証済みの値だけを渡す

const PLANS_PATH = '/plans';

function withCallback(path: string, params: Record<string, string>, callbackUrl: string | null) {
  const query = new URLSearchParams(params);
  if (callbackUrl) {
    query.set('callbackUrl', callbackUrl);
  }
  const queryString = query.toString();
  return queryString ? `${path}?${queryString}` : path;
}

export function buildPlansPath(callbackUrl: string | null): string {
  return withCallback(PLANS_PATH, {}, callbackUrl);
}

export function buildCheckoutUrls(
  baseUrl: string,
  callbackUrl: string | null
): { successUrl: string; cancelUrl: string } {
  return {
    successUrl: `${baseUrl}${withCallback(PLANS_PATH, { checkout: 'success' }, callbackUrl)}`,
    cancelUrl: `${baseUrl}${buildPlansPath(callbackUrl)}`,
  };
}

export function buildPortalReturnUrl(baseUrl: string, callbackUrl: string | null): string {
  return `${baseUrl}${buildPlansPath(callbackUrl)}`;
}

export function buildRefreshPath(baseUrl: string, callbackUrl: string | null): string {
  const target = callbackUrl ?? `${baseUrl}${PLANS_PATH}`;
  return `/refresh?${new URLSearchParams({ callbackUrl: target }).toString()}`;
}

export function buildSignInPath(callbackUrl: string | null): string {
  return `/signin?${new URLSearchParams({ callbackUrl: buildPlansPath(callbackUrl) }).toString()}`;
}
