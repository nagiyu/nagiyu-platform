---
id: livetalk/screen/privacy
title: プライバシーポリシー画面
kind: screen
service: livetalk
sources:
  - services/livetalk/web/src/app/legal/privacy/page.tsx
  - services/livetalk/web/src/lib/legal/privacy-data.ts
  - libs/ui/src/components/legal/LegalSections.tsx
sources_hash: baf9da9ffb6493b18d8dd7291e276c0028063a18b77f574b8221fc9191f2d982
terms: [livetalk/term/consent]
related_cards: [livetalk/screen/terms, livetalk/screen/home]
---

# プライバシーポリシー画面

リブトークのプライバシーポリシーを載せた公開ページ。

## 入口

- パスは `/legal/privacy`。ログインなしで開ける (ミドルウェアが `/legal/` 配下を通す)
- ホーム画面の同意のダイアログのリンク (別のタブで開く) から来る。もう一方のページの下部のリンクからも来る

## 表示するもの

- 見出し「プライバシーポリシー」と「バージョン 1.0.0」
- 条文。プライバシーポリシーは 9 条 (収集する情報の種類、情報の利用目的、情報の保管・削除、外部サービスの利用、セーフティログの取り扱い、ユーザーの権利、Cookie・セッション情報の取り扱い、個人情報保護法への準拠、プライバシーポリシーの変更)。条番号は並び順で振る
- 下部に、利用規約へのリンク「利用規約を見る」
- ホーム画面を含む全画面のフッターのリンクは、同じ内容を、このページへ移らずダイアログで開く

## 操作

| 操作 | 結果 |
|---|---|
| 「利用規約を見る」 | [利用規約画面](./terms.md)を開く |

- バージョンは、[同意](../term/consent.md)で保存する版と同じ値

## 画面の見た目

### 通常表示

画面の上部。本文は長く、条文が続く。

| スマホ |
|---|
| ![プライバシーポリシー画面 通常表示 (スマホ)](../../../images/specs/livetalk/screen/privacy-default-mobile.png) |

## つながり

```mermaid
flowchart TD
    C[ホーム画面の同意のダイアログ] --> S[プライバシーポリシー画面]
    S -->|下部のリンク| O[利用規約画面]
```
