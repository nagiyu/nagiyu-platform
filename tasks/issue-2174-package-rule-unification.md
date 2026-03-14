# パッケージのルール統一

## 概要

モノレポ内の各パッケージ（`libs/`, `services/`, `infra/`）において、命名規則や `package.json` の構成が不統一な状態にある。
「モノレポ内のみでの参照」という方針のもと、シンプルかつ一貫したルールに統一する。

## 関連情報

- Issue: #2174
- タスクタイプ: プラットフォームタスク

## 現状の不整合

### 1. パッケージ名（`@nagiyu/` prefix なし）

以下のパッケージが `@nagiyu/` prefix を持っていない。

| パッケージディレクトリ | 現在の名前 | あるべき名前 |
|---|---|---|
| `infra/codec-converter` | `codec-converter` | `@nagiyu/infra-codec-converter` |
| `services/codec-converter/core` | `codec-converter-core` | `@nagiyu/codec-converter-core` |
| `services/codec-converter/web` | `codec-converter-web` | `@nagiyu/codec-converter-web` |
| `services/codec-converter/batch` | `codec-converter-batch` | `@nagiyu/codec-converter-batch` |
| `services/tools` | `tools` | `@nagiyu/tools` |

### 2. パッケージ名（命名規則からの逸脱）

`infra/` パッケージは `@nagiyu/infra-{name}` の規則だが、以下が逸脱している。

| パッケージディレクトリ | 現在の名前 | あるべき名前 |
|---|---|---|
| `infra/shared` | `@nagiyu/shared-infra` | `@nagiyu/infra-shared` |

### 3. `private` フィールドの欠落

モノレポ内でのみ使用されるパッケージに `private: true` が設定されていないものがある。

- `services/codec-converter/core`
- `services/codec-converter/batch`
- `services/niconico-mylist-assistant/batch`

### 4. `exports` フィールドの不統一

サービスの core パッケージで統一されていない。

| パッケージ | exports |
|---|---|
| `auth-core` | あり |
| `stock-tracker-core` | あり |
| `codec-converter-core` | なし |
| `niconico-mylist-assistant-core` | なし |
| `share-together-core` | なし |

### 5. `types` フィールドの不統一

サービスの core パッケージで統一されていない。

| パッケージ | types |
|---|---|
| `auth-core` | なし |
| `stock-tracker-core` | なし |
| `codec-converter-core` | `dist/src/index.d.ts` |
| `niconico-mylist-assistant-core` | `dist/index.d.ts`（非標準パス） |
| `share-together-core` | `dist/src/index.d.ts` |

また、`stock-tracker-core` の `main` は `dist/index.js`（プロジェクト標準のパス構成 `dist/src/index.js` と異なる）。

### 6. `exports` の形式の不統一

`infra/common` の exports は `require` 形式だが、他のライブラリは `import` 形式を使用している。

### 7. `scripts` の不統一

以下のパッケージで `scripts` の記述が他と異なる。

- `niconico-mylist-assistant-core`: `format` / `format:check` が `"src/**/*.ts"` 指定（他は `"."` を使用）
- `niconico-mylist-assistant-core`: `lint` に `tests/**/*.ts` が含まれていない
- `niconico-mylist-assistant-core`: `test:watch` が存在しない
- `niconico-mylist-assistant-batch`: `format` / `format:check` が `"src/**/*.ts"` 指定（他は `"."` を使用）

### 8. `devDependencies` の重複

ルートの `package.json` で管理すべき共通パッケージが個別の `package.json` に定義されているものがある。

- `stock-tracker-batch`: `jest`, `ts-jest`, `typescript` を個別に定義

## 対応方針

### パッケージ名の統一ルール

- 全パッケージは `@nagiyu/` prefix を持つ
- `infra/` パッケージは `@nagiyu/infra-{name}` の形式
- `services/*/web` パッケージは `@nagiyu/{service-name}-web` の形式
- `services/*/core` パッケージは `@nagiyu/{service-name}-core` の形式
- `services/*/batch` パッケージは `@nagiyu/{service-name}-batch` の形式
- `services/{service-name}` (単一パッケージのサービス) は `@nagiyu/{service-name}` の形式

### `package.json` 構成の統一ルール

#### 他パッケージから import されるパッケージ（libs/*, services/*/core）

- `private: true` を設定する
- TypeScript のパス解決のため `exports` + `types` + `main` を設定する
- `libs/*` はサービス間で共有される共通ライブラリ。`services/*/core` は同一サービスの web / batch から import される点で同様の扱いとなる

#### 他パッケージから import されないパッケージ（services/*/web, services/*/batch, services/{single}, infra/*）

- `private: true` を設定する
- `exports` フィールドは設定しない（他から import されないため不要）
- `types` フィールドは設定しない（同上）
- `main` フィールドのみ設定する（実行エントリーポイントが必要なパッケージのみ）

### `scripts` の統一ルール

- `format` / `format:check` は `"."` を対象とする
- `lint` は `src/**/*.ts tests/**/*.ts` を対象とする（tests が存在するパッケージ）
- `test:watch` スクリプトを提供する（jest を使うパッケージ）

### `devDependencies` の整理

- ルートで管理される `jest`, `ts-jest`, `typescript` などは個別の `package.json` から除去する

## タスク

> **本タスクの範囲**: Phase 1（調査・確認）のみ。Phase 2 以降の実装は別タスクで実施する。

### Phase 1: 調査・確認（本タスクの範囲）

- [x] T001: 名前変更の影響範囲を調査する（変更するパッケージ名を参照している箇所をリストアップ）
- [x] T002: `infra/shared` の名前変更（`@nagiyu/shared-infra` → `@nagiyu/infra-shared`）の影響範囲を確認する
- [x] T003: `infra/common` が CommonJS 形式（`require`）の exports を使用している理由を調査する（CDK の制約がある可能性があるため、import 形式への変更可否を確認する）
- [x] T004: `stock-tracker-core` の `main` パス（`dist/index.js`）と `niconico-mylist-assistant-core` の `types` パス（`dist/index.d.ts`）について、`tsconfig.json` の `outDir` 設定と実際のディレクトリ構造を確認し、`dist/src/` への変更がビルド出力・import 文・ビルドスクリプトに与える影響範囲を特定する

#### T001 調査結果: 名前変更の影響範囲

| 変更対象パッケージ | 参照ファイル（コード） | 参照ファイル（ワークフロー） |
|---|---|---|
| `codec-converter-core` → `@nagiyu/codec-converter-core` | `services/codec-converter/batch/package.json`, `services/codec-converter/web/package.json`, `services/codec-converter/web/tsconfig.json`（paths エイリアス） | `.github/workflows/codec-converter-verify.yml`（複数箇所）, `.github/workflows/codec-converter-deploy.yml` |
| `codec-converter-web` → `@nagiyu/codec-converter-web` | `services/codec-converter/web/package.json` | `.github/workflows/codec-converter-verify.yml`, `.github/workflows/codec-converter-deploy.yml` |
| `codec-converter-batch` → `@nagiyu/codec-converter-batch` | `services/codec-converter/batch/package.json` | `.github/workflows/codec-converter-verify.yml` |
| `tools` → `@nagiyu/tools` | `services/tools/package.json` のみ（他から依存なし） | `.github/workflows/tools-verify.yml`（複数箇所）, `.github/workflows/tools-deploy.yml` |
| `codec-converter`（infra）→ `@nagiyu/infra-codec-converter` | `infra/codec-converter/package.json` のみ（他から依存なし） | `.github/workflows/codec-converter-verify.yml`, `.github/workflows/codec-converter-deploy.yml` |

#### T002 調査結果: `infra/shared` 名前変更の影響範囲

`.github/workflows/shared-deploy.yml` の 3 箇所で `--workspace=@nagiyu/shared-infra` として参照している。名前変更時はワークフローファイルも合わせて修正が必要。

```
.github/workflows/shared-deploy.yml:63  npm run bootstrap --workspace=@nagiyu/shared-infra
.github/workflows/shared-deploy.yml:69  npm run synth --workspace=@nagiyu/shared-infra
.github/workflows/shared-deploy.yml:75  npm run deploy --workspace=@nagiyu/shared-infra
```

#### T003 調査結果: `infra/common` の CommonJS 形式の理由

プロジェクト内の既存ルール（`infra/tsconfig.json` のベース設定）に基づく判断。`infra/tsconfig.json` は `"module": "commonjs"` を指定しており、`infra/common/tsconfig.json` もこの設定に従っている。`infra/auth`, `infra/shared` など他の infra パッケージも同様に CommonJS を使用しており、モノレポ内で統一された慣行となっている（なお `infra/codec-converter` のみ `NodeNext` を使用しているが、これは例外的な設定）。

**結論**: T015 の対応は「`require` 形式のまま維持する」（`infra/tsconfig.json` ベース設定との整合性を保つため）。

#### T004 調査結果: パスの不整合と修正方針

**`stock-tracker-core`**:

- tsconfig.json に `"rootDir": "./src", "outDir": "./dist"` が設定されている
- TypeScript は rootDir からの相対パスを outDir に再現するため、`src/index.ts` → `dist/index.js`（`dist/src/` 配下ではない）
- `package.json` の `main: dist/index.js` は tsconfig と整合しているが、プロジェクト標準（`dist/src/index.js`）と異なる
- 標準化するには tsconfig から `"rootDir": "./src"` を除去する必要がある（除去後は `src/index.ts` → `dist/src/index.js`）
- `batch/jest.config.ts` と `web/jest.config.ts` の `moduleNameMapper` は `src/index.ts` を直接参照しているため影響なし
- `web/next.config.ts` の `transpilePackages` は `package.json` の `main`/`exports` を参照するため、ビルド成果物のパス変更の影響を受ける

**`niconico-mylist-assistant-core`**:

- tsconfig.json に `rootDir` 未指定（デフォルトはプロジェクトルート）、`"outDir": "./dist"` のため、`src/index.ts` → `dist/src/index.js`
- `package.json` の `main: dist/index.js`・`types: dist/index.d.ts` は実際のビルド出力（`dist/src/`）と不整合
- `batch/jest.config.ts` に `@nagiyu/niconico-mylist-assistant-core` の `moduleNameMapper` がなく、`main` フィールドを参照する。ランタイム時に不整合が発生している可能性がある
- **修正**: `package.json` の `main` → `dist/src/index.js`、`types` → `dist/src/index.d.ts`（tsconfig の変更は不要）

### Phase 2: パッケージ名の修正

- [ ] T005: `infra/codec-converter` の名前を `@nagiyu/infra-codec-converter` に変更し、参照箇所を更新する
- [ ] T006: `services/codec-converter/core` の名前を `@nagiyu/codec-converter-core` に変更し、参照箇所を更新する
- [ ] T007: `services/codec-converter/web` の名前を `@nagiyu/codec-converter-web` に変更し、参照箇所を更新する
- [ ] T008: `services/codec-converter/batch` の名前を `@nagiyu/codec-converter-batch` に変更し、参照箇所を更新する
- [ ] T009: `services/tools` の名前を `@nagiyu/tools` に変更し、参照箇所を更新する
- [ ] T010: `infra/shared` の名前を `@nagiyu/infra-shared` に変更し、参照箇所を更新する

### Phase 3: `package.json` 構成の整理

- [ ] T011: `private: true` が欠落しているパッケージ（codec-converter-core, codec-converter-batch, niconico-mylist-assistant-batch）に追加する
- [ ] T012: サービスの batch / web パッケージから不要な `exports` / `types` フィールドを除去する（core は import される側のため除去しない）
- [ ] T013: `niconico-mylist-assistant-core` の `types` パスを `dist/src/index.d.ts` に修正し、`main` / `tsconfig.json` のパス設定を合わせる（Phase 1 の T004 の調査結果をもとに実施）
- [ ] T014: `stock-tracker-core` の `main` パスを `dist/src/index.js` に修正し、`tsconfig.json` の `outDir` 設定を合わせる（Phase 1 の T004 の調査結果をもとに実施）
- [ ] T015: `infra/common` の `exports` は T003 の調査結果より `require` 形式のまま維持する（CDK の制約による）

### Phase 4: `scripts` の統一

- [ ] T016: `niconico-mylist-assistant-core` の `format` / `format:check` を `"."` を対象にする形式に修正する（修正に伴い CI が失敗する場合は、合わせて修正する）
- [ ] T017: `niconico-mylist-assistant-core` の `lint` に `tests/**/*.ts` を追加する（修正に伴い CI が失敗する場合は、合わせて修正する）
- [ ] T018: `niconico-mylist-assistant-core` に `test:watch` スクリプトを追加する
- [ ] T019: `niconico-mylist-assistant-batch` の `format` / `format:check` を `"."` を対象にする形式に修正する（修正に伴い CI が失敗する場合は、合わせて修正する）

### Phase 5: `devDependencies` の整理

- [ ] T020: `stock-tracker-batch` の `devDependencies` から `jest`, `ts-jest`, `typescript` を除去する（ルート管理に委ねる）

## 参考ドキュメント

- [コーディング規約（Package Management）](../docs/development/rules.md)
- [モノレポ構成](../docs/development/monorepo-structure.md)

## 備考・未決定事項

- T003 の調査結果より、`infra/common` の `exports` は CDK の制約（`module: commonjs`）のため `require` 形式のまま維持する。T015 で変更不要と判断済み。
- T013・T014 は、T004 の調査結果をもとに実施すること。
  - `niconico-mylist-assistant-core` の修正は tsconfig 変更不要で `package.json` のパス修正のみ。
  - `stock-tracker-core` の修正は tsconfig から `rootDir: ./src` を除去する必要があり、`web/next.config.ts` の `transpilePackages` を使ったランタイム動作に影響するため CI での確認が必須。
