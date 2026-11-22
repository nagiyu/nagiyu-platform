---
sources:
  - libs/ui/src/components/legal/LegalSections.tsx
  - libs/ui/src/components/legal/CommercialTransactionsTable.tsx
  - libs/ui/src/components/dialogs/LegalDialog.tsx
  - libs/ui/src/components/dialogs/PrivacyPolicyDialog.tsx
  - libs/ui/src/components/dialogs/TermsOfServiceDialog.tsx
  - libs/ui/src/data/termsOfServiceData.ts
  - libs/ui/src/data/privacyPolicyData.ts
  - libs/ui/src/data/commercialTransactionsData.ts
  - libs/ui/src/types/legal.ts
sources_hash: d0093634635fad56a56d7191e136fed4eb38d7725f2ce23e87e5b3d178e974ec
---

# 法務の文書

利用規約・プライバシーポリシー・特定商取引法に基づく表記の、共通の文面と、それを描く部品。条文のデータと部品を共有することで、どのサービスでも同じ文面を出す。`@nagiyu/ui` から import する。

`PrivacyPolicyDialog` と `TermsOfServiceDialog` は、サービスからは直接は使われていない ([Footer](./footer.md) が中で使う)。

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
    | `plans` | `linkText` と最初に一致する部分だけを `plansHref` へのリンクにする。`linkText` がなければリンクにしない |
    | なし | 文字列のまま |

### ダイアログ

- 規約とポリシーで枠・タイトル・閉じるボタンをそろえる (枠は内部の部品 `LegalDialog`。公開しない)
- タイトルは固定で、「利用規約」「プライバシーポリシー」
- 幅は `md` の最大幅で、横いっぱいに広げる。本文が長いときはダイアログの中でスクロールする
- 右上の閉じるアイコンと、下の「閉じる」ボタンのどちらでも `onClose` を呼ぶ。背景のクリックでも呼ぶ
- 本文は `LegalSections` で描く

## 理由

- 規約・ポリシー・特定商取引の文面を、データとして 1 か所に持つ。サービスごとに写しを持つと、文面がずれるため。サービスごとに変えたいときは、`sections` を差し替える
