---
title: 'Auth.js の signOut がリバースプロキシ背後で内部ホストにリダイレクトする問題'
description: 'Auth.js（NextAuth）の signOut が、ALB / CloudFront などのリバースプロキシ背後で `ip-10-2-0-48.ec2.internal` のような内部ホスト名にリダイレクトして ERR_NAME_NOT_RESOLVED になる原因と、サーバー側リダイレクト解決に頼らずクライアント側で遷移する確実な対処を解説します。'
slug: 'auth-signout-reverse-proxy-redirect'
publishedAt: '2026-06-14'
updatedAt: '2026-06-22'
author: 'なぎゆー'
tags: ['Next.js', 'Auth.js', 'NextAuth', '認証', 'リバースプロキシ']
categories: ['nextjs']
---

## はじめに

ログアウト（退会）処理の後にトップへ戻そうとして `signOut({ redirectTo: '/' })` を呼んだら、ブラウザが次の画面で止まりました。

```
このページに到達できません
ip-10-2-0-48.ec2.internal のサーバー IP アドレスが見つかりませんでした。
ERR_NAME_NOT_RESOLVED
```

アドレスバーには `http://ip-10-2-0-48.ec2.internal:3000/` という、明らかに **コンテナの内部ホスト名** が出ています。ローカルでは再現せず、ECS Fargate（CloudFront → ALB → ECS）にデプロイした dev 環境でだけ起きました。本記事は、この「signOut がなぜ内部ホストに飛ぶのか」と、環境に依存しない確実な直し方を整理します。

## 何が起きているか

`signOut({ redirectTo: '/' })` に渡している `'/'` は **相対パス** です。Auth.js（NextAuth v5）はこの相対パスを最終的な遷移先（絶対 URL）に組み立てるとき、**サーバーが認識している自分のオリジン**を基準に解決します。

問題は、ECS のアプリコンテナが認識する「自分のホスト」が公開ドメインではなく **コンテナの内部ホスト名**（`ip-10-2-0-48.ec2.internal:3000`）になりがちな点です。リクエストは実際には `CloudFront → ALB → ECS` と中継されてくるので、アプリから見た素の `Host` は内部のものになります。その結果、

```
'/' → http://ip-10-2-0-48.ec2.internal:3000/
```

と内部ホスト基準で絶対化され、その URL がブラウザに `Location` ヘッダーとして返ります。ブラウザは当然 `ip-10-2-0-48.ec2.internal` を名前解決できず `ERR_NAME_NOT_RESOLVED` になる、という流れです。

ポイントは **「サーバー側で絶対 URL を組み立てている」** こと。リバースプロキシ背後では、サーバーが自分の公開 URL を正しく知っているとは限りません。

## なぜ内部ホストになるのか

Auth.js のリダイレクト先解決は、ざっくり次のロジックです（`redirect` コールバックの既定挙動）。

```ts
// 概念コード
function resolveRedirect(url: string, baseUrl: string): string {
  if (url.startsWith('/')) return new URL(url, baseUrl).toString(); // 相対 → baseUrl 基準で絶対化
  if (new URL(url).origin === baseUrl) return url; // 同一オリジンの絶対 URL は許可
  return baseUrl; // それ以外（別オリジン）は baseUrl に握りつぶす
}
```

ここで使われる `baseUrl` は、`AUTH_URL`（または `NEXTAUTH_URL`）が設定されていればその値、無ければ **リクエストの `Host` / `X-Forwarded-Host` から推測** されます。`trustHost: true` のときは転送ヘッダーを信用しますが、プロキシが `X-Forwarded-Host` を正しく載せていなかったり、`AUTH_URL` を公開ドメインに固定していなかったりすると、`baseUrl` が内部ホストになります。

さらにこのロジックの最後の行に注意です。**別オリジンの絶対 URL を渡しても `baseUrl` に握りつぶされる**ため、「じゃあ公開オリジンの絶対 URL を渡せばいい」という回避も、`baseUrl` 自体が内部ホストだと効きません。`redirectTo` を相対にしても絶対にしても、`baseUrl` が壊れている限り内部ホストに引っ張られる、というのが厄介なところです。

## 対処：サーバー側の解決に頼らずクライアントで遷移する

一番確実なのは、**Auth.js にリダイレクトさせない**ことです。`redirect: false` でセッション破棄だけ行い、画面遷移は **ブラウザ側** に任せます。

```ts
// before（内部ホストに飛ぶ）
await signOut({ redirectTo: '/' });

// after（ブラウザが公開オリジン基準で遷移する）
await signOut({ redirect: false });
window.location.assign('/');
```

`window.location.assign('/')` の `'/'` は、**ブラウザがアドレスバーの現在の公開オリジンを基準に**解決します。サーバーの `baseUrl` も `X-Forwarded-Host` も一切関与しません。だから ALB / CloudFront の背後だろうが、`AUTH_URL` が未設定だろうが、必ず公開ドメインのトップに遷移します。環境設定に依存しないのが最大の利点です。

`signOut({ redirect: false })` は Promise を返すので、`await` してセッション破棄（Cookie 失効）が終わってから遷移させます。

## テストでハマる：jsdom では window.location を差し替えられない

この遷移をユニットテストで検証しようとすると、もう一段ハマりどころがあります。jsdom の `window.location` は **再定義不可**で、`assign` も **読み取り専用**です。

```ts
// どちらも失敗する
Object.defineProperty(window, 'location', { value: { assign: jest.fn() } });
// → TypeError: Cannot redefine property: location
jest.spyOn(window.location, 'assign');
// → TypeError: Cannot assign to read only property 'assign'
```

そこで、**副作用を小さな関数に隔離してモジュール境界でモック**します。`fetch` をラップして API クライアントに閉じ込めるのと同じ発想です。

```ts
// navigation.ts —— ブラウザ遷移という副作用をここに隔離する
export function redirectToTop(): void {
  window.location.assign('/');
}
```

```ts
// useAccountDeletion.ts —— ロジック側は redirectToTop を呼ぶだけ
import { redirectToTop } from './navigation';

await signOut({ redirect: false });
redirectToTop();
```

```ts
// テスト —— navigation モジュールごとモックすれば window.location に触れずに検証できる
jest.mock('@/lib/account/navigation', () => ({ redirectToTop: jest.fn() }));
import { redirectToTop } from '@/lib/account/navigation';

it('成功時はセッション破棄後にトップへ遷移する', async () => {
  await result.current.requestDeletion();
  expect(signOut).toHaveBeenCalledWith({ redirect: false });
  expect(redirectToTop).toHaveBeenCalledTimes(1);
});
```

`window.location.assign` を呼ぶ一行だけがテスト対象外になりますが、その一行は「ブラウザに遷移を委ねる」という意図そのものなので、関数に切り出して名前を付けておく価値があります。

## 別解と、なぜクライアント遷移を選んだか

サーバー側で正しく解決させる方向の対処もあります。

- **`AUTH_URL`（`NEXTAUTH_URL`）を公開ドメインに固定する**。`baseUrl` が確定するので相対 `redirectTo` も正しく絶対化される。
- **プロキシで `X-Forwarded-Host` / `X-Forwarded-Proto` を正しく転送し、`trustHost: true` にする**。アプリが公開ホストを復元できる。

これらは「ログイン後のコールバック URL」など他のリダイレクトも一緒に直るので、本来は併せて整えるべきものです。ただし環境変数やプロキシ設定に依存するため、**どこか一箇所でも欠けると再発**します。ログアウト後の遷移のように「行き先がトップで固定」のケースは、サーバーの URL 解決を経由せず `window.location` でブラウザに任せてしまうのが、環境に左右されず一番壊れにくい、というのが今回の結論です。用途で使い分けるのがよいと思います。

## 実装ノート

この問題は個人開発で運用している AI 対話サービスで「退会・データ削除」を実装し、dev 環境で動作確認していたときに踏みました。退会ボタンを押すと、データ削除 API は成功しているのに、その後の `signOut({ redirectTo: '/' })` の遷移先が `ip-10-2-0-48.ec2.internal:3000` になって画面が死ぬ、という症状でした。

紛らわしかったのは、**削除自体は正常に動いていた**ことです。`signOut` は API 呼び出しが成功した後に走るので、「遷移が壊れている＝削除も失敗しているのでは」と最初は不安になりました。実際には DynamoDB と CloudWatch のアプリログ（`deletedCount` を出していた）を突き合わせて、対象ユーザーのデータだけがきちんと消えていることを確認できました。**「画面の遷移バグ」と「データ処理の成否」は切り分けて確認する**、というのを改めて学んだ箇所です。

## ハマったポイント

- **ローカルで再現しない**: ローカルは `localhost` がそのまま `baseUrl` になるので正しく動く。リバースプロキシを挟む dev / prod でだけ顕在化するため、ローカルの動作確認だけだと見落とす。
- **絶対 URL を渡しても直らない**: 「公開オリジンの絶対 URL を `redirectTo` に渡せばいい」と思ったが、`baseUrl` が内部ホストだと別オリジン扱いで握りつぶされる。サーバーの URL 解決を通す限り根本解決にならない。
- **`redirect: false` の戻りを `await` する**: セッション破棄が終わる前に遷移すると Cookie が中途半端に残りうる。`await signOut({ redirect: false })` してから遷移する。
- **jsdom の location は差し替え不可**: テストのために `window.location` を直接モックしようとすると詰まる。副作用を関数に切り出してモジュール単位でモックするのが結局いちばん素直だった。

## まとめ

Auth.js の `signOut({ redirectTo })` は、相対パスを **サーバーが認識するオリジン**基準で絶対化します。ALB / CloudFront の背後ではそのオリジンが内部ホスト名になりやすく、`ERR_NAME_NOT_RESOLVED` を引き起こします。行き先が固定のログアウト遷移なら、`signOut({ redirect: false })` でセッションだけ破棄し、`window.location` でブラウザに遷移を委ねるのが、環境設定に依存しない確実な直し方です。`AUTH_URL` の固定や `X-Forwarded-Host` の整備も併せて行うと、ログインコールバックなど他のリダイレクトも含めて健全になります。
