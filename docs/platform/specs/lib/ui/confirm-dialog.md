---
sources:
  - libs/ui/src/components/dialogs/ConfirmDialog.tsx
sources_hash: 060e4e8efe29a77a4b080a30de45d25bd65be7e879d9e28380afa7fda9cf15b4
---

# ConfirmDialog

削除などの操作の前に出す確認ダイアログ。MUI の `Dialog` と、[Button](./button.md) で描く。`@nagiyu/ui` から `ConfirmDialog` を import する。

## 使い方

```tsx
<ConfirmDialog
    open={open}
    title="ユーザーを削除しますか"
    description="この操作は取り消せません。"
    loading={deleting}
    onConfirm={handleDelete}
    onCancel={() => setOpen(false)}
/>
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `open` | boolean | 必須 | 開いているか |
| `title` | string | 必須 | タイトル |
| `description` | string | なし | 本文の説明文。省略すると `children` だけを出す |
| `children` | ReactNode | なし | 説明文の下に置く本文 (対象の詳細、注意書き、同意のチェックなど) |
| `confirmLabel` | string | `削除` | 確定ボタンの表示名 |
| `cancelLabel` | string | `キャンセル` | 取り消しボタンの表示名 |
| `confirmColor` | `ButtonColor` | `danger` | 確定ボタンの色 |
| `confirmDisabled` | boolean | `false` | 確定ボタンだけを無効にする (同意のチェック待ちなど) |
| `confirmTestId` | string | なし | 確定ボタンの `data-testid` |
| `loading` | boolean | `false` | 処理中 |
| `onConfirm` | `() => void` | 必須 | 確定したとき |
| `onCancel` | `() => void` | 必須 | 取り消したとき |

## 振る舞い

- 幅は `sm` の最大幅で、横いっぱいに広げる。タイトルは `aria-labelledby` でダイアログの名前にする
- 取り消しボタンは `ghost`、確定ボタンは `solid` で描く
- 背景のクリックと Escape キーは `onCancel` を呼ぶ
- `loading` が真のとき、確定ボタンはスピナーを出し、取り消しボタンは無効になる。背景のクリックと Escape キーによる閉じる操作も無視する
- `confirmDisabled` は確定ボタンだけに効く。取り消しは常にできる (`loading` 中を除く)

## 理由

- 処理中の閉じる操作を無視する。処理の途中で閉じると、進行中の処理と画面の状態が食い違うため
