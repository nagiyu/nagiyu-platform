import { hasPermission } from '@nagiyu/common';

/**
 * 申し込み (決済画面へ進むこと) を始めてよいかを返す。
 *
 * 本番だけ制限を外す。dev は Stripe のサンドボックスにつながり、誰でもログインできるため、
 * テスト用カードで無料のまま有料の段が付く。
 * 環境の値が無い・想定外のときは制限をかける側に倒す。誤設定が本番なら誰も買えずすぐ気づくが、
 * dev なら無料で有料の段が付いても気づけないため。Cookie のドメイン判定 (未設定なら本番扱い)
 * とは逆向きにしてある。
 *
 * @param env 環境の値 (`NAGIYU_ENV`)
 * @param roles 利用者のロール。未ログインは undefined
 */
export function canStartCheckout(
  env: string | undefined,
  roles: readonly string[] | undefined
): boolean {
  if (env === 'prod') {
    return true;
  }
  return roles !== undefined && hasPermission([...roles], 'billing:test');
}
