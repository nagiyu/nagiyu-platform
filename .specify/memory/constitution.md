<!--
Sync Impact Report
==================
Version change: N/A → 1.0.0 (テンプレートからの初回作成)

Modified principles: N/A (初回作成)

Added sections:
  - I. TypeScript 型安全性
  - II. アーキテクチャ・レイヤー分離
  - III. コード品質・Lint・フォーマット
  - IV. テスト戦略
  - V. ブランチ戦略・CI/CD
  - VI. 共通ライブラリ設計
  - VII. ドキュメント駆動開発
  - 開発ガイドライン (Section 2)
  - 開発ワークフロー (Section 3)
  - ガバナンス

Removed sections: N/A (初回作成)

Templates requiring updates:
  - ✅ .specify/templates/plan-template.md (日本語対応)
  - ✅ .specify/templates/spec-template.md (日本語対応)
  - ✅ .specify/templates/tasks-template.md (日本語対応)
  - ✅ .specify/templates/checklist-template.md (日本語対応)
  - ✅ .specify/templates/commands/constitution.md (新規作成)

Follow-up TODOs: なし
-->

# Nagiyu Platform 憲法

## コア原則

### I. TypeScript 型安全性

本プラットフォームで実装されるすべてのコードは TypeScript の型安全性を最大限に活用しなければならない。

- `tsconfig.json` では `"strict": true` を MUST とする。`configs/tsconfig.base.json` を必ず継承すること。
- 型定義は `types/` ディレクトリに集約すること（MUST）。コンポーネントやモジュールに散在させてはならない。
- 型定義とデフォルト値は常にセットで定義すること（MUST）。
- クラスプロパティはコンストラクタパラメータで定義してはならない（MUST NOT）。
  クラスボディに明示的に宣言すること（ESLint ルール `@typescript-eslint/parameter-properties` で自動検出）。
- すべてのクラスメンバーにアクセス修飾子（`public` / `private` / `protected`）を明示すること（MUST）。
  コンストラクタへの `public` 付与は省略可。
- ライブラリ（`libs/*`）内部ではパスエイリアス（`@/`）を使用してはならない（MUST NOT）。相対パスを使用すること。
- サービスでは `src/**` を型チェック対象に含める。ライブラリでは `src/**` と `tests/**` のみを含める。

**根拠**: 実行時エラーの早期発見、コードの予測可能性向上、AI 支援開発における明確な型コントラクトの維持。

---

### II. アーキテクチャ・レイヤー分離

各サービスは責務に応じてパッケージを分離し、一方向の依存関係を維持しなければならない。

- サービスは `core`（ビジネスロジック）、`web`（UI）、`batch`（バッチ処理）に分離すること（MUST）。
- `core` はフレームワーク非依存でなければならない。`libs/ui`、`libs/browser`、`react`、`next` への依存は MUST NOT。
  ESLint ルール（`no-restricted-imports`）で自動検出。
- `core` 内のビジネスロジックは純粋関数として `src/libs/` に配置すること（MUST）。
- `web` と `batch` は `core` に依存可能だが、逆方向の依存は禁止（MUST NOT）。
- サービス間の直接依存は禁止（MUST NOT）。`services/{A}/* → services/{B}/*` は不可。
- 共通ライブラリ（`libs/*`）は固有パッケージ（`services/*`）に依存してはならない（MUST NOT）。
- `core` 内ではパスエイリアスを使用してはならない。相対パスのみを使用すること（MUST）。
- UI層（`components/`、`app/`）とビジネスロジック（`lib/`）を明確に分離すること（MUST）。

**根拠**: ユニットテストの容易性、コンポーネントの再利用性、責務の明確化、バッチ処理の追加が容易。

---

### III. コード品質・Lint・フォーマット

すべてのコードは ESLint と Prettier の定義するスタイルに準拠しなければならない。

- `configs/eslint.config.base.mjs` を継承した ESLint 設定を各パッケージで使用すること（MUST）。
  `eslint.configs.recommended` および `tseslint.configs.recommended` の全ルールに準拠すること。
- Prettier のフォーマットルールに従うこと（MUST）:
  - `semi: true`（セミコロン必須）
  - `singleQuote: true`（シングルクォート）
  - `printWidth: 100`（1行100文字以内）
  - `tabWidth: 2`（インデント2スペース）
  - `trailingComma: "es5"`（末尾カンマ）
- CI ではすべての PR に対して lint と format-check を実施すること（MUST）。失敗した場合は後続ジョブをブロックすること。
- ユーザー向けエラーメッセージは日本語で記述すること（MUST）。
- エラーメッセージは定数オブジェクト（`ERROR_MESSAGES`）で管理すること（MUST）。
- `dangerouslySetInnerHTML` は原則として使用禁止（MUST NOT）。
  やむを得ない場合は DOMPurify によるサニタイズを経由すること。

**根拠**: コードベース全体の一貫性維持、自動検出によるレビューコストの削減、セキュリティリスクの低減。

---

### IV. テスト戦略

本プラットフォームはスマホファーストのテスト戦略を採用し、品質とスピードのバランスを保つ。

- テストフレームワーク: Jest（ユニット）、Testing Library（React コンポーネント）、Playwright（E2E）を MUST とする。
- テストコードは `tests/` 配下に集約し、`src/` と明確に区分すること（MUST）。
  - サービス: `tests/unit/`、`tests/e2e/` を持つこと（MUST）。
  - ライブラリ: `tests/unit/` を持つこと（MUST）。
- ビジネスロジック（`lib/` または `core` パッケージ）のカバレッジは 80% 以上を確保すること（MUST）。
  `jest.config.ts` の `coverageThreshold` で自動強制すること。
  UI 層（`components/`、`app/`）はカバレッジ対象外とし、E2E テストでカバーすること。
- 純粋関数をモックしてはならない（MUST NOT）。副作用を持つ処理（ブラウザ API、外部 API、DB 等）はモックすること（MUST）。
- 共通ライブラリはインターフェースとモッククラスをセットで提供すること（MUST）。
- E2E テストは `chromium-desktop`、`chromium-mobile`（Pixel 5）、`webkit-mobile`（iPhone）で実施すること（MUST）。
  モバイル環境（`chromium-mobile`）を優先すること。
- テスト命名は `describe('機能名') > describe('関数名') > it('正常系/異常系/エッジケース: 説明')` の形式（MUST）。
- AAA パターン（Arrange / Act / Assert）を使用すること（MUST）。
- 1テストケースで1つの検証のみ行うこと（MUST）。
- テスト間で状態を共有してはならない（MUST）。

**根拠**: 品質保証、リグレッション防止、モバイル優先のユーザー体験確保。

---

### V. ブランチ戦略・CI/CD

本プラットフォームは2段階 CI 戦略を採用し、PR での品質保証を徹底する。

- ブランチ種別は `feature/**`（作業）、`integration/**`（機能統合）、`develop`（全体統合）、`master`（本番）の4種とする。
- `feature/**` → `integration/**` → `develop` → `master` の順でマージすること（MUST）。
- `integration/**` および `develop` へのプッシュで開発環境へ自動デプロイすること（MUST）。
- `master` へのマージで本番環境へ自動デプロイすること（MUST）。
- すべてのサービス・ライブラリで2段階の PR 検証ワークフローを実装すること（MUST）:
  - `{target}-verify-fast.yml`: `integration/**` ブランチ向け。
    ビルド、lint、format-check、ユニットテスト、E2E（chromium-mobile のみ）、PR コメント報告。
  - `{target}-verify-full.yml`: `develop` ブランチ向け。
    ビルド、lint、format-check、ユニットテスト、カバレッジチェック（80% 未満で失敗）、
    E2E（全3デバイス）、PR コメント報告。
  - E2E を持たないライブラリは単一の `{target}-verify.yml` で可。
- ワークフロー内でのワークスペース指定はパッケージ名（`@nagiyu/hoge`）を使用すること（MUST）。
  パス指定（`services/hoge`）は使用してはならない（MUST NOT）。
- `npm run build --workspaces`（並列ビルド）は使用してはならない（MUST NOT）。
  依存関係順（`common` → `aws` → `react` → `browser` → `ui`）に個別ビルドすること（MUST）。
- E2E テスト失敗時はスクリーンショット・動画・Playwright レポートを 30 日間保存すること（MUST）。

**根拠**: マージ後のデプロイ失敗リスクの最小化、開発速度と品質のバランス確保。

---

### VI. 共通ライブラリ設計

共通ライブラリは明確な責務と一方向の依存関係を持ち、サービス間で安全に共有されなければならない。

- ライブラリは責務に応じて分類すること（MUST）:
  - `@nagiyu/common`: 完全フレームワーク非依存の汎用ユーティリティ
  - `@nagiyu/browser`: ブラウザ API 依存のユーティリティ
  - `@nagiyu/react`: React 依存のユーティリティ
  - `@nagiyu/ui`: Next.js + Material-UI 依存の UI コンポーネント
  - `@nagiyu/aws`: AWS SDK 補助・拡張ライブラリ
- ライブラリ間の依存は一方向を維持すること（MUST）:
  `ui → browser → common`、`react → common`、`aws`（モノレポ内他ライブラリに依存しない）
- 下位ライブラリが上位ライブラリを参照する循環依存は禁止（MUST NOT）。
- `services/*/core` は `libs/common` のみに依存可能。`libs/ui`、`libs/browser` への依存は禁止（MUST NOT）。
- `services/*/web` は `libs/common`、`libs/browser`、`libs/ui` に依存可能。
- `services/*/batch` は `libs/common` のみに依存可能。
- セマンティックバージョニングを採用し、破壊的変更はメジャーバージョンアップとすること（MUST）。
- ライブラリ内部でパスエイリアスを使用してはならない（MUST NOT）。相対パスを使用すること。
- `libs/*/tsconfig.json` には `src/**` と `tests/**` を型チェック対象に含めること（MUST）。

**根拠**: 依存関係の明確化、再利用性の向上、破壊的変更の影響範囲の制御。

---

### VII. ドキュメント駆動開発

本プラットフォームはドキュメント駆動開発を採用し、AI 主体の開発における実装品質を保証する。

- 実装前に要件定義 → 基本設計 → 実装の順でドキュメントを作成すること（MUST）。
- Spec Kit による成果物（spec.md、plan.md、tasks.md 等）はすべて日本語で作成すること（MUST）。
- タスクはユーザーストーリー単位で整理し、各ストーリーが独立してテスト・デプロイ可能な状態を維持すること（MUST）。
- 原則として最小限のルールを保つこと（SHOULD）。
  過度な制約は開発の柔軟性を損なうため、必須事項のみを定め、実装詳細は各サービスの特性に応じて判断すること。
- 各サービスは `docs/services/{service-name}/` 配下にドキュメントを管理すること（SHOULD）。
  含めるべきドキュメント: `README.md`、`requirements.md`、`architecture.md`、
  `testing.md`、`deployment.md`（必要に応じて `api-spec.md`、`ui-design.md`）。

**根拠**: AI 支援開発において詳細なドキュメントが正確な実装を生成するための指示書となる。
設計の一貫性を保ち、AIへの指示が明確になる。

---

## 開発ガイドライン

本セクションは、上記コア原則を補完する開発上のガイドラインを定義する。

### 状態管理

- React の状態管理は React Hooks（`useState`、`useReducer`）を優先すること（SHOULD）。
  外部状態管理ライブラリへの依存を最小化する。
- `localStorage` はユーザー設定など永続化が必要な値のみに使用すること（SHOULD）。
  一時的な UI ステートに使用してはならない。
- `localStorage` へのアクセスは `useEffect` 内で行うこと（MUST）。SSR 時の `ReferenceError` を防ぐ。

### パフォーマンス

- 推測による最適化は行わず、計測に基づいて最適化すること（MUST）。
- 不要な `useMemo`、`useCallback` の乱用は避けること（SHOULD NOT）。
- スマホファーストでモバイル環境での動作を優先すること（SHOULD）。

### セキュリティ

- すべての外部入力を検証すること（MUST）。
- React のデフォルトエスケープ機能を活用すること（MUST）。
- `dangerouslySetInnerHTML` は DOMPurify なしに使用してはならない（MUST NOT）。
- 秘密情報（APIキー、シークレット等）をソースコードにハードコードしてはならない（MUST NOT）。

### ブラウザ API

- `@nagiyu/browser` に実装がある場合はそちらを優先的に使用すること（MUST）。
  直接ブラウザ API を呼び出してはならない。

---

## 開発ワークフロー

本セクションは、プラットフォーム全体の開発フローと品質ゲートを定義する。

### 実装フロー

1. **要件定義**: Issue を作成し、要件を日本語で記述する。
2. **ドキュメント作成**: `task.proposal` エージェントを使用して要件・設計ドキュメントを `tasks/` 配下に生成する。
3. **実装**: `task.implement` エージェントまたは手動で、ドキュメントに基づいて実装する。
4. **PR**: `feature/**` ブランチから `integration/**` へ PR を作成する。Fast CI が自動実行される。
5. **統合**: `integration/**` から `develop` へ PR を作成する。Full CI が自動実行される。
6. **リリース**: `develop` から `master` へ PR を作成し、マージ後に本番デプロイされる。

### 品質ゲート

| ゲート | タイミング | 必須条件 |
|--------|-----------|---------|
| lint / format-check | すべての PR | ESLint・Prettier エラーがないこと |
| ユニットテスト | すべての PR | 全テスト通過 |
| カバレッジチェック | develop への PR | ビジネスロジック 80% 以上 |
| E2E テスト（mobile） | integration への PR | chromium-mobile で通過 |
| E2E テスト（全デバイス） | develop への PR | 全3デバイスで通過 |

### 命名規則

| 対象 | 規則 | 例 |
|------|------|-----|
| 作業ブランチ | `feature/{AppName}/{description}` | `feature/Tools/add-clipboard` |
| 統合ブランチ | `integration/{AppName}` | `integration/Tools` |
| GitHub Actions | `{target}-verify-fast.yml` / `{target}-verify-full.yml` | `tools-verify-fast.yml` |
| パッケージ名 | `@nagiyu/{name}` | `@nagiyu/common` |

---

## ガバナンス

本憲法はプラットフォーム開発のすべての成果物に対して優先される。
他のガイドラインや慣習と矛盾する場合、本憲法が優先される。

### 改正手続き

1. 改正の必要性を Issue で提起し、変更内容を日本語で記述する。
2. 影響範囲を特定する（影響を受けるサービス・ライブラリ・ワークフロー）。
3. 移行計画を策定する（破壊的変更の場合）。
4. PR にて本憲法を更新し、依存するテンプレートファイルを同時に更新する。
5. レビュー承認後にマージし、`LAST_AMENDED_DATE` を更新する。

### バージョニングポリシー

- **MAJOR**: 原則の削除・再定義など後方互換性のない変更
- **MINOR**: 新原則の追加、セクションの実質的な拡充
- **PATCH**: 表現の明確化、誤字修正など意味論的でない変更

### コンプライアンスレビュー

- すべての PR レビューにおいて、本憲法への準拠を確認すること。
- ESLint・Prettier・CI ゲートが原則の多くを自動強制する。
- ドキュメント関連原則（VII）は PR レビュー時に人間が確認すること。
- 開発に関する実行時ガイダンスは `docs/development/` ディレクトリを参照すること。

**バージョン**: 1.0.0 | **批准日**: 2026-02-26 | **最終改正日**: 2026-02-26
