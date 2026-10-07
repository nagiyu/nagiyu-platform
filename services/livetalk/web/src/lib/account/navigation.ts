import { buildSignOutUrl } from '@nagiyu/ui';

/**
 * ブラウザ側で auth サービスのサインアウト URL へ遷移する。
 *
 * サインアウトは Cookie 発行元の auth サービスに集約しており、自サービスは
 * signout の POST を受け付けない。また next-auth の signOut が行うサーバ側
 * リダイレクト解決は、リバースプロキシ背後で内部ホスト名
 * （例: ip-10-2-0-48.ec2.internal:3000）に化けて到達不能になる。
 * そのため遷移はブラウザに委ね、その副作用をこの関数に隔離してテストでモック可能にする。
 * callbackUrl には公開オリジンを渡し、サインアウト後に自サービスへ戻れるようにする。
 *
 * @param authUrl - auth サービスのベース URL（サーバーコンポーネントでランタイム env から解決したもの）
 */
export function redirectToSignOut(authUrl: string): void {
  window.location.assign(buildSignOutUrl(authUrl, window.location.origin));
}
