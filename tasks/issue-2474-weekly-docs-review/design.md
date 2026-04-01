<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/ に反映し、
    tasks/issue-2474-weekly-docs-review/ ディレクトリごと削除します。

    入力: tasks/issue-2474-weekly-docs-review/requirements.md
    次に作成するドキュメント: tasks/issue-2474-weekly-docs-review/tasks.md
-->

# 2026年第13週 週次ドキュメントレビュー 対応 - 技術設計

## API 仕様

<!-- 本タスクはドキュメント修正のみ。外部 API なし。 -->

---

## データモデル

<!-- 本タスクはドキュメント修正のみ。データモデル変更なし。 -->

---

## コンポーネント設計

### 修正対象ファイル一覧

| ファイル | パス | 変更内容 |
| ------- | ---- | -------- |
| copilot-instructions.md | `.github/copilot-instructions.md` | モノレポ構成のサービス一覧に admin, auth, codec-converter, tools を追加 |
| jest.config.ts | `services/stock-tracker/web/jest.config.ts` | 100% 設定が意図的であることを示すコメントを追加 |

### 変更方針の詳細

#### 1. copilot-instructions.md のサービス一覧更新

**現在の記述**:

```text
services/          # アプリケーション
├── stock-tracker/            # 株価トラッカー（core + web + batch）
├── niconico-mylist-assistant/ # ニコニコマイリスト管理（core + web + batch）
└── share-together/           # みんなでシェアリスト（core + web）
```

**修正後**:

```text
services/          # アプリケーション
├── admin/                    # 管理画面（core + web）
├── auth/                     # 認証サービス（core + web）
├── codec-converter/          # コーデック変換（core + web + batch）
├── niconico-mylist-assistant/ # ニコニコマイリスト管理（core + web + batch）
├── share-together/           # みんなでシェアリスト（core + web）
├── stock-tracker/            # 株価トラッカー（core + web + batch）
└── tools/                    # 管理ツール
```

**サービスの実際の構成**（`ls services/{name}/` にて確認済み）:
- `services/admin/`: core + web
- `services/auth/`: core + web
- `services/codec-converter/`: core + web + batch
- `services/tools/`: 単一パッケージ（`@nagiyu/tools`）

#### 2. stock-tracker/web の jest.config.ts コメント追加

**背景**:

`services/stock-tracker/web/jest.config.ts` では以下の設定となっている:

- `collectCoverageFrom`: `['lib/repository-factory.ts', 'lib/percentage-helper.ts']` のみ
- `coverageThreshold`: `100%`

これは「カバレッジ計測対象を特定のユーティリティファイル 2 本に絞り、
その 2 本については 100% を要求する」という意図的な設計である。
testing.md の「80% 以上」基準に反するものではない（100% は 80% 以上を満たす）。

**修正方針**: 意図が伝わるよう、jest.config.ts にコメントを追加する。

---

## 実装上の注意点

### 依存関係・前提条件

- copilot-instructions.md の変更前に、`services/` 配下の全サービスの実際の構成を確認すること
- Copilot Instructions は Copilot Review に直接影響するため、正確な情報を記載すること

### セキュリティ考慮事項

- ドキュメント修正のみのため、セキュリティ上のリスクはない

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `.github/copilot-instructions.md` の修正はそのまま永続化（tasks/ 外のファイル）
- [ ] `services/stock-tracker/web/jest.config.ts` の修正はそのまま永続化（tasks/ 外のファイル）
- [ ] Issue #2474 のチェックリスト状態を更新し、発見した不整合の対応完了を記録する
