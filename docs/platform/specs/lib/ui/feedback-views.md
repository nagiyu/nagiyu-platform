---
sources:
  - libs/ui/src/components/feedback/AccessDeniedView.tsx
  - libs/ui/src/components/feedback/NotFoundView.tsx
  - libs/ui/src/components/feedback/ErrorView.tsx
  - libs/ui/src/components/feedback/GlobalErrorView.tsx
sources_hash: 7fffab378cd58cca06d4b37c66cac0ba4f99245cb6af4840156f53c3e4e29afa
---

# エラー画面

権限なし (403)、ページなし (404)、画面表示中のエラー、ルートレイアウトのエラーの 4 つの画面。中央にタイトル・説明・ボタンを縦に並べる。`@nagiyu/ui` から import する。

| 部品 | 使う場面 |
|---|---|
| `AccessDeniedView` | 権限がないとき |
| `NotFoundView` | `not-found.tsx` |
| `ErrorView` | `error.tsx` |
| `GlobalErrorView` | `global-error.tsx` |

## 使い方

```tsx
// error.tsx
export default function Error({ reset }: { reset: () => void }) {
    return <ErrorView onRetry={reset} />;
}
```

| 部品 | Props | 既定値 |
|---|---|---|
| `AccessDeniedView` | `authUrl` (必須)、`callbackUrl`、`title`、`description`、`onRefresh`、`onSignOut` | タイトルは `アクセス権限がありません`、説明は `この機能を利用する権限がありません。管理者の承認後、下のボタンでアクセスを更新してください。` |
| `NotFoundView` | `title`、`description`、`homeHref` | タイトルは `ページが見つかりません`、説明は `お探しのページは移動または削除されたか、URL が間違っている可能性があります。`、`homeHref` は `/` |
| `ErrorView` | `onRetry`、`title`、`description`、`homeHref` | タイトルは `エラーが発生しました`、説明は `画面の表示中に問題が発生しました。もう一度お試しいただくか、トップページへ戻ってください。`、`homeHref` は `/` |
| `GlobalErrorView` | `ErrorView` と同じ | 同じ |

## 振る舞い

### AccessDeniedView

2 つのボタンを縦に並べる。

| ボタン | 動作 | 遷移先 |
|---|---|---|
| アクセスを更新 (強調) | auth サービスのセッション更新へ遷移する。管理者がロールを付与した後に、権限を取り直すためのもの | `buildRefreshUrl` |
| 再ログイン | auth サービスのサインアウトへ遷移する。サインインし直して権限を取り直す | `buildSignOutUrl` |

- 戻り先は `callbackUrl`。省略すると、ボタンを押した時点の現在の URL を使う。サーバー側のレンダリングでは `window` がなく、画面遷移で URL が変わることもあるため、押した時点で決める
- `onRefresh` / `onSignOut` に関数を渡すと、`window.location.assign` の代わりにその関数が (作った URL を引数に) 呼ばれる
- auth サービス自身で使うときは `authUrl` に空文字を渡す。同じオリジンの相対 URL になる ([auth サービスへの URL](./auth-urls.md))
- 本文の枠に `role="main"` を付ける

### NotFoundView

「トップページへ戻る」のボタンを 1 つ出す。遷移先は `homeHref`。リンクは素の `<a>` で描く (`next/link` に依存しないため)。

### ErrorView

| `onRetry` | ボタン |
|---|---|
| あり | 「もう一度試す」(強調) と、「トップページへ戻る」(控えめな見た目) |
| なし | 「トップページへ戻る」だけ (強調) |

- 強調のボタンは、画面でいちばん取ってほしい操作の 1 つだけ。再試行があれば再試行、なければトップへ戻る
- エラーのメッセージや digest は表示しない。ログも出さない。ログの出力はサービスの `error.tsx` が行う
- `NotFoundView` と `ErrorView` には `role="main"` を付けない。サービスのレイアウトがすでに `main` を持ち、この画面はその内側に描かれるため

### GlobalErrorView

- `<html lang="ja">` と `<body>` を自分で描き、`AppThemeProvider` で MUI のテーマを当て、`main` の中に `ErrorView` を置く。ヘッダー・フッターは描かない
- ルートレイアウトの CSS は引き継がれない。呼び出し側の `global-error.tsx` で必要な CSS を import する ([デザイントークン](./design-tokens.md) の手順)

## 理由

- `global-error.tsx` はルートレイアウトを置き換える。そのため `GlobalErrorView` は `html` / `body` とテーマを自分で用意し、壊れているかもしれないレイアウトの部品 (ヘッダー・フッター) に依存しない
- エラーの詳細を出さない。本番では Next.js が詳細を伏せるうえ、利用者に見せる情報ではないため
