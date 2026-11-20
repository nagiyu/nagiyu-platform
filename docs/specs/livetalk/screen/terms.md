---
id: livetalk/screen/terms
title: 利用規約画面
kind: screen
service: livetalk
sources:
  - services/livetalk/web/src/app/legal/terms/page.tsx
  - services/livetalk/web/src/lib/legal/terms-data.ts
  - services/livetalk/web/src/lib/legal/revisions.ts
  - services/livetalk/web/src/components/LegalRevisionHistory.tsx
  - libs/ui/src/components/legal/LegalSections.tsx
sources_hash: 33c76c4dad5172d08ab053002ed113ec856f601faf6b4b4c409fb11f105497b4
terms: [livetalk/term/consent]
related_cards: [livetalk/screen/privacy, livetalk/screen/home]
---

# 利用規約画面

リブトークの利用規約を載せた公開ページ。

## 入口

- パスは `/legal/terms`。ログインなしで開ける (ミドルウェアが `/legal/` 配下を通す)
- ホーム画面の同意のダイアログのリンク (別のタブで開く) から来る。もう一方のページの下部のリンクからも来る

## 表示するもの

- 見出し「利用規約」と「バージョン 1.1.0」
- 条文。利用規約は 12 条 (サービス概要と適用、年齢制限、利用登録・Google アカウント、AI の性質と医療目的でない旨、危機時の対応とリソース案内、禁止事項、データ取り扱い、データ削除請求、本サービスの提供停止・変更、免責事項、利用規約の変更、準拠法・裁判管轄)。条番号は並び順で振る
- 条文の後に「改定履歴」。版ごとに「バージョン {版}({施行日}施行)」と改定の要点の箇条書きを、新しい版を上にして並べる。初版は「制定」の 1 行。ホーム画面の改定のお知らせと同じデータから出す。条番号は振らない
- 下部に、プライバシーポリシーへのリンク「プライバシーポリシーを見る」
- ホーム画面を含む全画面のフッターのリンクは、同じ内容を、このページへ移らずダイアログで開く

## 操作

| 操作 | 結果 |
|---|---|
| 「プライバシーポリシーを見る」 | [プライバシーポリシー画面](./privacy.md)を開く |

- 改定履歴の最新の版は、同意で保存する版と同じ値
- バージョンは、[同意](../term/consent.md)で保存する版と同じ値

## 画面の見た目

### 通常表示

画面の上部。本文は長く、条文が続く。

| スマホ |
|---|
| ![利用規約画面 通常表示 (スマホ)](../../../images/specs/livetalk/screen/terms-default-mobile.png) |

### 改定履歴

条文の末尾。

| スマホ |
|---|
| ![利用規約画面 改定履歴 (スマホ)](../../../images/specs/livetalk/screen/terms-revision-history-mobile.png) |

## つながり

```mermaid
flowchart TD
    C[ホーム画面の同意のダイアログ] --> S[利用規約画面]
    S -->|下部のリンク| O[プライバシーポリシー画面]
```
