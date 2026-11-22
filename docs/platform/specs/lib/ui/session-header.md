---
sources:
  - libs/ui/src/components/layout/SessionHeader.tsx
  - libs/ui/src/components/providers/SessionProviderWrapper.tsx
  - libs/ui/src/session-provider.ts
  - libs/ui/package.json
sources_hash: fef5da8455bafdb6c8c97180b0c87c7e10c80f824264d154966fb414df297ac0
---

# SessionHeader とセッションの Provider

next-auth のセッションからヘッダーを組み立てる `SessionHeader` と、セッションを配る `SessionProviderWrapper`。どちらも `@nagiyu/ui/session-provider` から import する。メインの `@nagiyu/ui` には含まれない。

## 使い方

```tsx
import { SessionHeader, SessionProviderWrapper } from '@nagiyu/ui/session-provider';

<SessionProviderWrapper>
    <SessionHeader title="Admin" authUrl={authUrl} />
    {children}
</SessionProviderWrapper>
```

### SessionHeader

[Header](./header.md) の props から `user` / `roles` / `onLogout` を除いたものに、次を足した props を受け取る。

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `authUrl` | string | 必須 | auth サービスのベース URL |
| `showSignIn` | boolean | `false` | 未ログインのとき、ログインボタンを `actions` に出すか |

### SessionProviderWrapper

`children` だけを受け取り、next-auth の `SessionProvider` で包む。`useSession` を使う部品 (`SessionHeader` を含む) は、この内側に置く。

## 振る舞い

### SessionHeader

| セッションの状態 | 描くもの |
|---|---|
| ユーザーがいる | `user` (名前・メール・画像)、`roles`、`onLogout` を組み立てて渡した Header |
| ユーザーがいない、`showSignIn` が偽 | `user` を渡さない Header |
| ユーザーがいない、`showSignIn` が真、状態が `unauthenticated` | `actions` の末尾に「ログイン」ボタンを足した Header |
| ユーザーがいない、`showSignIn` が真、状態が読み込み中 | `user` を渡さない Header (ログインボタンは出さない) |

- 名前がなければ空文字、メールと画像がなければ未指定にする
- `roles` は、セッションのユーザーに配列として入っているときだけ渡す
- ログアウトは、現在のオリジンを戻り先にして、auth サービスのサインアウトへ遷移する。ログインは、現在の URL を戻り先にして、auth サービスのサインインへ遷移する (URL の作り方は [auth サービスへの URL](./auth-urls.md))
- 呼び出し側が渡した `actions` は、ログインボタンの手前に残す

### authUrl

`authUrl` は、クライアントでは読まず、サーバー側のレイアウトが解決した値を props で受け取る。

## 理由

- next-auth に依存する部品を専用のサブパスに分ける。メインの入口 (`@nagiyu/ui`) に混ぜると、import の連鎖で next-auth が読み込まれてしまうため。`next-auth` は `peerDependencies` に置き、optional ではないので、`@nagiyu/ui` を使うサービスはどれも満たす必要がある。サブパスで防げるのは、メインの入口から next-auth が読み込まれることだけ
- 読み込み中にログインボタンを出さない。ログイン済みの利用者に、一瞬ログインボタンが見えてしまうため

## 手順

`SessionHeader` を置くルートレイアウトは、動的にレンダリングする (`export const dynamic = 'force-dynamic'`)。`authUrl` は実行時の環境変数から読むので、静的にプリレンダすると、ビルド時に空文字で評価された値が HTML に固定されて、サインアウトの遷移先が壊れる。
