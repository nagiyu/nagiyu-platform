/**
 * ブラウザ側でトップ（公開オリジンの `/`）へ遷移する。
 *
 * next-auth の signOut が行うサーバ側リダイレクト解決は、リバースプロキシ背後で
 * 内部ホスト名（例: ip-10-2-0-48.ec2.internal:3000）に化けて到達不能になる。
 * そのため遷移はブラウザに委ね、その副作用をこの関数に隔離してテストでモック可能にする。
 */
export function redirectToTop(): void {
  window.location.assign('/');
}
