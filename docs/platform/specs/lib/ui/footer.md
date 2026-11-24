---
sources:
  - libs/ui/src/components/layout/Footer.tsx
sources_hash: 71fc22e39e0bd44cfc8c4639aa643805d2cebef6990fbde966e64f9b1a3da966
---

# Footer

ページ下部のフッター。バージョン、法務ページへのリンク、ナビゲーションのリンク集、著作権表記を出す。`@nagiyu/ui` から `Footer` を import する。

## 使い方

```tsx
<Footer version="1.2.0" contactHref="/contact" copyright="© 2026 nagiyu" />
```

| Props | 型 | 既定値 | 内容 |
|---|---|---|---|
| `version` | string | `1.0.0` | `v{version}` の形で表示する |
| `contactHref` | string | なし | 指定すると「お問い合わせ」のリンクを出す |
| `commercialTransactionsHref` | string | なし | 指定すると「特定商取引法に基づく表記」のページへのリンクを出す |
| `showLegalLinks` | boolean | `true` | 「プライバシーポリシー」「利用規約」のリンクとダイアログを出すか |
| `privacyContent` | `LegalSection[]` | 共通のプライバシーポリシー | ダイアログの内容の差し替え |
| `termsContent` | `LegalSection[]` | 共通の利用規約 | ダイアログの内容の差し替え |
| `licenseText` | ReactNode | なし | バージョン行の下に出すライセンス表記 |
| `links` | `FooterLinkGroup[]` | なし | リンク集 |
| `copyright` | string | なし | 最下部に出す著作権表記 |

`FooterLinkGroup` は `{ title?, items: { label, href }[] }`。

## 振る舞い

- 上から、リンク集 (`links` があるとき)、バージョン行、`licenseText`、`copyright` の順に並べる
- バージョン行は `v{version}` の後ろに、次のリンクを ` | ` で区切って並べる

    | 順 | リンク | 出る条件 | 動作 |
    |---|---|---|---|
    | 1 | プライバシーポリシー | `showLegalLinks` | ダイアログを開く |
    | 2 | 利用規約 | `showLegalLinks` | ダイアログを開く |
    | 3 | 特定商取引法に基づく表記 | `commercialTransactionsHref` | 指定先へ遷移する |
    | 4 | お問い合わせ | `contactHref` | 指定先へ遷移する |

- `showLegalLinks` が偽のとき、ダイアログ本体も描かない。法務ページへのリンクを `links` に並べて、同じリンクが重複するのを避けたいときに使う
- 2 つのダイアログは [法務の文書](./legal.md) の条文を表示する。`privacyContent` / `termsContent` を渡すと、その内容に差し替える
- リンク集は、グループごとに小見出し (`title`) とリンクの縦並びを出し、グリッドに並べる。幅は `xs` で 2 列、`sm` で 3 列、`md` 以上で 4 列
- `licenseText` があるとき、縦の余白を詰めて小さい文字で出す (長いクレジットがモバイルで見切れないようにするため)
