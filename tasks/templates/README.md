# tasks/ テンプレート

開発時ドキュメントのテンプレートガイド。

**大規模対応**で `tasks/{feature-name}/` ディレクトリを切り、以下のテンプレートから必要なファイルを作成する。

**小規模対応**では `tasks/` を作成しない。Issue 本文に必要情報（実装方針・対象ファイル・依存関係・実装上の注意点）を集約する。

開発が完了したら `docs/` に永続化すべき情報を反映し、`tasks/{feature-name}/` を削除する。

実装タスクのフェーズ分け・進捗管理は **Issue 本文 + サブ Issue** で行う（`tasks.md` は廃止）。

詳細なフローは [docs/development/flow.md](../../docs/development/flow.md) を参照。

---

## テンプレート一覧

| ファイル | テンプレート | 作成条件 |
|---------|------------|---------|
| `requirements.md` | [docs/templates/services/requirements.md](../../docs/templates/services/requirements.md) | 大規模時は常に作成 |
| `external-design.md` | [docs/templates/services/external-design.md](../../docs/templates/services/external-design.md) | 画面の追加・削除・大きな変更がある場合のみ |
| `design.md` | [tasks/templates/design.md](./design.md) | 大規模時は常に作成 |

`requirements.md` と `external-design.md` は `docs/templates/services/` のテンプレートをそのまま使い、冒頭に以下のコメントを追加する：

```markdown
<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/{service}/{filename} に統合して削除します。
-->
```

---

## 作業規模別ガイド

### 小規模対応（バグ修正・細かな機能追加）

`tasks/` ディレクトリは作成しない。Issue 本文に以下を集約する：

- 実装方針・アプローチ
- 対象ファイル・モジュール
- 依存関係・前提条件
- 実装上の注意点

### 中規模対応（既存サービスへの機能追加）

`tasks/{feature-name}/` に以下を作成する：

- `requirements.md`
- `external-design.md`（UI の変更がある場合）
- `design.md`

### 大規模対応（新規サービス・大規模リファクタリング）

`tasks/{feature-name}/` に以下を作成する：

- `requirements.md`
- `external-design.md`
- `design.md`
