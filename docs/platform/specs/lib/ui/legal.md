---
sources:
  - libs/ui/src/components/legal/LegalSections.tsx
  - libs/ui/src/components/legal/CommercialTransactionsTable.tsx
  - libs/ui/src/components/dialogs/LegalDialog.tsx
  - libs/ui/src/components/dialogs/PrivacyPolicyDialog.tsx
  - libs/ui/src/components/dialogs/TermsOfServiceDialog.tsx
  - libs/ui/src/data/commercialTransactionsData.ts
  - libs/ui/src/types/legal.ts
sources_hash: a168699c3ed4ae0c52e0191259b6e93885520a0b77a54732a3b0fe8a9fc081dc
---

# 法務の文書

利用規約・プライバシーポリシー・特定商取引法に基づく表記の、共通の文面と、それを描く部品。条文のデータと部品を共有することで、どのサービスでも同じ文面を出す。`@nagiyu/ui` から import する。

## 使い方

| 名前 | 種類 | 内容 |
|---|---|---|
| `termSections` | データ | 利用規約の条文 (`LegalSection[]`) |
| `privacyPolicySections` | データ | プライバシーポリシーの条文 (`LegalSection[]`) |
| `commercialTransactionItems` | データ | 特定商取引法に基づく表記の行 (`CommercialTransactionItem[]`) |
| `LegalSections` | 部品 | 条文を描く |
| `CommercialTransactionsTable` | 部品 | 特定商取引法に基づく表記を表で描く |
| `PrivacyPolicyDialog` / `TermsOfServiceDialog` | 部品 | 条文を出すダイアログ |

```tsx
<LegalSections sections={privacyPolicySections} />
<CommercialTransactionsTable plansHref="https://auth.example.com/plans" />
```

| 部品 | Props | 内容 |
|---|---|---|
| `LegalSections` | `sections` | 描く条文 |
| `CommercialTransactionsTable` | `plansHref` (必須) | 料金ページへのリンク先。ほかのサービスから表示するとき絶対 URL を渡せるよう、外から受け取る |
| `PrivacyPolicyDialog` / `TermsOfServiceDialog` | `open`、`onClose`、`sections` (省略可) | `sections` を省略すると、それぞれ `privacyPolicySections` / `termSections` を出す |

### 型

| 型 | 項目 |
|---|---|
| `LegalSection` | `title`、`contents` (`LegalContent[]`) |
| `LegalContent` | `mainContent`、`subContents` (任意)、`link` (任意) |
| `LegalSubContent` | `subContent`、`subItems` (任意。文字列の配列) |
| `CommercialTransactionItem` | `label`、`value`、`linkKind` (任意)、`linkText` (任意) |

## 振る舞い

### LegalSections

- 条ごとに「第 n 条」の見出しとタイトルを出す。条番号は `sections` の並び順から採番する (データに番号を持たない)
- `mainContent` は段落で、本文中の改行をそのまま改行として表示する
- `subContents` は番号付きリストで、その下に `subItems` を入れ子の番号付きリストで出す
- `link` があれば、段落の下に URL をリンクで出す。新しいタブで開く

### CommercialTransactionsTable

- 項目名と内容の 2 列の表。項目名は行の見出しにして、スクリーンリーダーが内容と対応づけて読めるようにする
- モバイルの幅 (`xs`) では項目名と内容を縦に積む。内容の列が潰れないようにするため。`sm` 以上は項目名の列が 30% の幅
- 内容の長い本文や URL は折り返す
- `linkKind` による内容の描き方

    | `linkKind` | 描き方 |
    |---|---|
    | `mailto` | 内容の全体をメールアドレスのリンクにする |
    | `plans` | `linkText` が内容に含まれれば、最初に一致する部分だけを `plansHref` へのリンクにする。含まれなければ、内容の後ろにリンクを足す。`linkText` がなければリンクにしない |
    | なし | 文字列のまま |

### ダイアログ

- 規約とポリシーで枠・タイトル・閉じるボタンをそろえる (枠は内部の部品 `LegalDialog`。公開しない)
- タイトルは固定で、「利用規約」「プライバシーポリシー」
- 幅は `md` の最大幅で、横いっぱいに広げる。本文が長いときはダイアログの中でスクロールする
- 右上の閉じるアイコンと、下の「閉じる」ボタンのどちらでも `onClose` を呼ぶ。背景のクリックと Escape キーでも呼ぶ
- 本文は `LegalSections` で描く

## 理由

- 規約・ポリシー・特定商取引の文面を、データとして 1 か所に持つ。サービスごとに写しを持つと、文面がずれるため。利用規約とプライバシーポリシーは、サービスごとに変えたいときに `sections` を差し替えられる (`CommercialTransactionsTable` には差し替えの props がない)
- 特定商取引法に基づく表記の中身を共通の部品にするのは、課金を受けるサービスが増えても、表記が食い違わないようにするため。規約とプライバシーポリシーも共通のデータと部品を使う作りで、それにそろえる
- 販売事業者・運営責任者・所在地・電話番号は「請求があれば遅滞なく開示いたします」とする。運営者は個人で、本名・住所・電話番号をログインなしで見られる場所に出したくないため。代わりに「運営」の行に屋号「なぎゆー」を載せる。規約の「当方」と呼び名をそろえるため
- 販売価格は金額を持たず、プランのページ (税込) へ案内する。価格は Stripe の 1 か所に持ち、プランのページはそこから読んで表示するので、表記に金額を書くと Stripe と食い違うため
- 返金は「原則として返金せず、日割りの返金もしない。当方の責による不具合で使えなかった場合は、個別に相談に応じる」と書く。「一切返金しない」とすると、当方の落ち度でも返金しないと読め、消費者契約法で無効になるおそれがあるため
- 規約の利用料金の条に、遅延損害金の項を置かない。支払いはカードの前払いで支払いの遅れが起きず、更新時に支払いを確認できなければ有料プランの提供を止めるため
- 開示を請求に応じる形にしても、Stripe が送る領収書のメールには、正式な事業者名 (個人では本名) とサポート用の住所が載る。払った本人にだけ見える範囲なので、許容している
