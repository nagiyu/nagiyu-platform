---
name: task-proposal
description: 大規模対応で tasks/{feature-name}/ 配下に仕様ドキュメント（requirements.md / external-design.md / design.md）を起こす。Issue から実装の指針を文書化するときに使う。小規模・中規模はこの skill を使わず Issue 本文 + セッション内コンテキストに集約する。
---

# tasks/ 提案ドキュメント起こし

Issue から実装の指針となる仕様ドキュメントを `tasks/{feature-name}/` に生成する手順。**大規模対応のみ**が対象。

## 適用範囲（規模判定）

| 規模 | 条件 | tasks/ ドキュメント |
|---|---|---|
| 小規模 | バグ修正・1 ファイル修正・設定追加 | **作らない**（Issue 本文 + コンテキストに集約） |
| 中規模 | 既存サービスへの機能追加 | 原則作らない（必要な範囲のみ。HOW はオーケスト内で導く） |
| 大規模 | 新規サービス・大規模リファクタリング | `requirements.md` + `design.md`（必須）、`external-design.md`（UI 変更時） |

> 実装タスクのフェーズ分け・進捗管理は **Issue 本文 + サブ Issue** で行う（`tasks.md` は廃止）。

## 生成ファイルとテンプレート

`tasks/{feature-name}/` を切り、規模に応じて作成する。

| ファイル | ベーステンプレート | 内容 |
|---|---|---|
| `requirements.md` | `docs/templates/services/requirements.md` | この作業スコープの要件（機能要件・非機能要件・ドメインオブジェクト） |
| `external-design.md` | `docs/templates/services/external-design.md` | 画面設計・概念データモデル（UI 変更がある場合のみ） |
| `design.md` | `tasks/templates/design.md` | 技術設計（API・データモデル・コンポーネント）。**「docs/ への移行メモ」も記入する** |

`requirements.md` / `external-design.md` は冒頭に開発時ドキュメントである旨のコメントを付ける：

```markdown
<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/{service}/requirements.md に統合して削除します。
-->
```

## 執筆ルール

- 4スペースインデント・最小限のルール・概念的表現・単体完結（実コード参照を最小化）。
- 要件には識別子（FR1 / NFR1 等）を付け、測定可能・テスト可能に書く。
- 物理的な DB 設計（DynamoDB の PK/SK 等）は `design.md` に書き、完了後に削除する。
- 永続化すべき「なぜ」は、完了後に `docs-write` スキルで `docs/` へ移行する。

## 関連

- [`docs/development/flow.md`](../../../docs/development/flow.md) — 開発フロー・V 字モデル・用語説明
- [`tasks/templates/README.md`](../../../tasks/templates/README.md) — tasks/ テンプレートの使い方
- `docs-write` スキル — 完了後の docs/ 移行
