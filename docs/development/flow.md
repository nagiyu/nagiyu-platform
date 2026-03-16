# 開発フロー

## 目的

ドキュメントを 2 層に分離し、開発時ドキュメントと永続化ドキュメントの役割・ライフサイクル・使い方を定義する。

---

## 2 層ドキュメント構成

```
tasks/          ← 開発時ドキュメント（ephemeral）
  └ 開発完了後に削除する

docs/           ← 永続化ドキュメント（permanent）
  └ コードを読んでも得られない「なぜ」を残す
```

「コードを読めばわかること」は書かない。ドキュメントに残す価値があるのは、コードからは読み取れないビジネス的な背景・意思決定の理由・UI 設計の判断根拠である。

### ファイルの役割と配置

| ファイル | tasks/ | docs/ | 役割 |
|---------|:------:|:-----:|------|
| `requirements.md` | ○（機能スコープ） | ○（サービス全体） | 何を作るか |
| `external-design.md` | ○（UI 変更がある場合のみ） | ○ | どんな UI・データ構造にするか |
| `design.md` | ○ | なし | どう実装するか（API・コンポーネント・型定義） |
| `architecture.md` | なし | ○ | なぜその設計を選んだか（ADR） |
| `tasks.md` | ○ | なし | 実装タスクリスト |

---

## 開発フロー

```
Issue / 要件
    ↓
tasks/{feature-name}/ に開発時ドキュメントを作成
    ↓
実装（AI エージェントは tasks/ のドキュメントのみを参照）
    ↓
開発完了後：docs/ に永続化すべき情報を反映
    ↓
tasks/{feature-name}/ を削除
    ↓
PR マージ
```

### 開発時ドキュメントの作成

`tasks/{feature-name}/` ディレクトリを切り、以下のファイルを作成する。小規模改修であれば `requirements.md` と `tasks.md` のみでよい。

| ファイル | 使用テンプレート | 作成条件 |
|---------|--------------|---------|
| `requirements.md` | `docs/templates/services/requirements.md` | 常に作成（機能スコープで記述） |
| `external-design.md` | `docs/templates/services/external-design.md` | 画面の追加・削除・大きな変更がある場合のみ |
| `design.md` | `tasks/templates/design.md` | 常に作成 |
| `tasks.md` | `tasks/templates/tasks.md` | 常に作成 |

`requirements.md` と `external-design.md` は `docs/templates/services/` のテンプレートをそのまま使い、冒頭に開発時ドキュメントである旨のコメントを追加する。

### docs/ への移行

開発が完全に完了したら `tasks/{feature-name}/design.md` の末尾にある「docs/ への移行メモ」を確認し、以下を行ってから tasks/ を削除する。

- `tasks/requirements.md` → `docs/services/{service}/requirements.md` に統合
- `tasks/external-design.md` → `docs/services/{service}/external-design.md` に統合（あれば）
- `tasks/design.md` の重要な設計決定 → `docs/services/{service}/architecture.md` に ADR として追記

---

## V字モデルとテストの対応

ドキュメントとテストは V字モデルで対応する。

```
要件定義（requirements.md）    ──── E2E テスト（受け入れ）
  外部設計（external-design.md） ──── 結合テスト（Integration）
    内部設計（design.md）          ──── 単体テスト（Unit）
              実装
```

各テストの観点：

| テスト種別 | 対応ドキュメント | 確認すること |
|-----------|--------------|------------|
| 単体テスト | `design.md` | API の各エンドポイント・ビジネスロジックの関数が正しく動作するか |
| 結合テスト | `external-design.md` | 画面遷移・コンポーネント間の連携が正しく動作するか |
| E2E テスト | `requirements.md` | ユースケースがエンドツーエンドで満たされるか |

---

## テンプレート一覧

### tasks/ テンプレート

| テンプレート | 説明 |
|------------|------|
| `tasks/templates/design.md` | 開発時技術設計（API・データモデル・コンポーネント） |
| `tasks/templates/tasks.md` | 実装タスクリスト |

`requirements.md` と `external-design.md` は `docs/templates/services/` のテンプレートを流用する（→ [tasks/templates/README.md](../../tasks/templates/README.md)）。

### docs/ テンプレート

| テンプレート | 説明 |
|------------|------|
| `docs/templates/services/README.md` | サービス概要・クイックスタート |
| `docs/templates/services/requirements.md` | ビジネス要件・ユースケース・ドメインオブジェクト |
| `docs/templates/services/external-design.md` | 画面設計・概念データモデル・設計上の決定事項 |
| `docs/templates/services/architecture.md` | アーキテクチャ設計決定記録（ADR） |

---

## 用語説明

### ドメインオブジェクト

ユースケースの文章に登場する「名詞」がドメインオブジェクト。システムで扱う概念的な「もの」を指す。

```
例：「ユーザーがアラートを設定する」
→ ドメインオブジェクト: ユーザー、アラート
```

型定義や DB スキーマとは独立した概念レベルの記述であり、`requirements.md` で洗い出す。

### 概念データモデル

ドメインオブジェクト間の関係を図示したもの。実装に依存しない（DB・型定義・フレームワーク非依存）。`external-design.md` で記述する。

```
例：「ユーザーは複数のアラートを持つ」
    「アラートは 1 つの銘柄に紐づく」
```

物理的な DB 設計（DynamoDB の PK/SK 設計など）は `tasks/design.md` に記述し、完了後に削除する。

### ADR（Architecture Decision Record）

「なぜその設計を選んだか」を記録するドキュメントの書き方。以下の構成で記述する：

- **背景・問題**：どんな状況でこの決定が必要だったか
- **決定**：何を選んだか
- **根拠・トレードオフ**：なぜそれを選んだか、他の選択肢と比べて何を犠牲にしたか

`docs/architecture.md` にはこの形式の記述のみを残す。コードを読めばわかる実装詳細は書かない。

ADR として記録すべき決定の例：
- DB・ストレージの選定（DynamoDB vs RDS、なぜ Single Table Design か）
- 認証方式（NextAuth、Cookie 設計）
- 外部サービス依存の設計方針
- スケーリング・パフォーマンスのトレードオフ
- セキュリティ上の設計判断

記録しなくていい例：
- API のエンドポイント設計（コードを読めばわかる）
- コンポーネント分割の詳細（コードを読めばわかる）
- 型定義・インターフェースの詳細（コードを読めばわかる）

---

## FAQ

**Q: 小規模なバグ修正の場合、tasks/ ドキュメントは必要か？**
A: コードのみで完結するバグ修正は不要。ただし、バグの原因が設計上の問題であり `docs/architecture.md` に追記すべき教訓がある場合は、直接 `docs/` を更新する。

**Q: 既存サービスへの機能追加の場合、どのファイルを作成するか？**
A: 変更する範囲に応じて必要なファイルを作成する。ユースケースが変わるなら `requirements.md`、UI が変わるなら `external-design.md`、実装が伴うなら `design.md` と `tasks.md`。

**Q: 開発中に仕様が変わった場合はどうするか？**
A: `tasks/` のドキュメントのみを更新する。`docs/` は開発完了後に一括で更新する。途中で `docs/` を更新すると、仕様変更のたびに `tasks/` と `docs/` の両方を更新する二重管理になるため行わない。

**Q: 同一サービスに複数の tasks が並行する場合はどうするか？**
A: トピックブランチを分けて作業するため、`tasks/` の内容はブランチ間で干渉しない。`develop` へのマージ時には tasks/ が削除されていることを確認する。

---

## 関連ドキュメント

- [tasks/templates/README.md](../../tasks/templates/README.md) — tasks/ テンプレートの使い方
- [docs/templates/services/](../templates/services/) — サービスドキュメントテンプレート
- [docs/branching.md](../branching.md) — ブランチ戦略・CI/CD
- [docs/development/testing.md](testing.md) — テスト戦略
