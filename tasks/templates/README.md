# tasks/ テンプレート

開発時ドキュメントのテンプレートガイド。`tasks/{feature-name}/` ディレクトリを切り、以下のテンプレートから必要なファイルを作成する。

開発が完了したら `docs/` に永続化すべき情報を反映し、`tasks/{feature-name}/` を削除する。

詳細なフローは [docs/development/flow.md](../../docs/development/flow.md) を参照。

---

## テンプレート一覧

| ファイル | テンプレート | 作成条件 |
|---------|------------|---------|
| `requirements.md` | [docs/templates/services/requirements.md](../../docs/templates/services/requirements.md) | 常に作成 |
| `external-design.md` | [docs/templates/services/external-design.md](../../docs/templates/services/external-design.md) | 画面の追加・削除・大きな変更がある場合のみ |
| `design.md` | [tasks/templates/design.md](./design.md) | 常に作成 |
| `tasks.md` | [tasks/templates/tasks.md](./tasks.md) | 常に作成 |

`requirements.md` と `external-design.md` は `docs/templates/services/` のテンプレートをそのまま使い、冒頭に以下のコメントを追加する：

```markdown
<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/{service}/{filename} に統合して削除します。
-->
```

---

## 作業規模別ガイド

### 小規模改修（バグ修正・細かな機能追加）

作成するファイル：
- `requirements.md`（変更するユースケース・機能のみ記述）
- `design.md`
- `tasks.md`

### 中規模改修（既存サービスへの機能追加）

作成するファイル：
- `requirements.md`
- `external-design.md`（UI の変更がある場合）
- `design.md`
- `tasks.md`

### 大規模開発（新規サービス・大規模リファクタリング）

作成するファイル：
- `requirements.md`（サービス全体スコープで記述）
- `external-design.md`
- `design.md`
- `tasks.md`
