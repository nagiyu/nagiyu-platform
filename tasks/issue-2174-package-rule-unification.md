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

#### モノレポ内専用パッケージ（services/*, infra/*）

- `private: true` を設定する
- `exports` フィールドは設定しない（TypeScript がパス解決するため不要）
- `types` フィールドは設定しない（同上）
- `main` フィールドのみ設定する（実行エントリーポイントが必要なパッケージのみ）

#### 共通ライブラリ（libs/*）

- 現状のまま維持（`exports` + `types` + `main` の構成は正しい）

### `scripts` の統一ルール

- `format` / `format:check` は `"."` を対象とする
- `lint` は `src/**/*.ts tests/**/*.ts` を対象とする（tests が存在するパッケージ）
- `test:watch` スクリプトを提供する（jest を使うパッケージ）

### `devDependencies` の整理

- ルートで管理される `jest`, `ts-jest`, `typescript` などは個別の `package.json` から除去する

## タスク

### Phase 1: 調査・確認

- [ ] T001: 名前変更の影響範囲を調査する（変更するパッケージ名を参照している箇所をリストアップ）
- [ ] T002: `infra/shared` の名前変更（`@nagiyu/shared-infra` → `@nagiyu/infra-shared`）の影響範囲を確認する
- [ ] T003: `infra/common` が CommonJS 形式（`require`）の exports を使用している理由を調査する（CDK の制約がある可能性があるため、import 形式への変更可否を確認する）
- [ ] T004: `stock-tracker-core` の `main` パス（`dist/index.js`）と `niconico-mylist-assistant-core` の `types` パス（`dist/index.d.ts`）について、`tsconfig.json` の `outDir` 設定と実際のディレクトリ構造を確認し、`dist/src/` への変更がビルド出力・import 文・ビルドスクリプトに与える影響範囲を特定する

### Phase 2: パッケージ名の修正

- [ ] T005: `infra/codec-converter` の名前を `@nagiyu/infra-codec-converter` に変更し、参照箇所を更新する
- [ ] T006: `services/codec-converter/core` の名前を `@nagiyu/codec-converter-core` に変更し、参照箇所を更新する
- [ ] T007: `services/codec-converter/web` の名前を `@nagiyu/codec-converter-web` に変更し、参照箇所を更新する
- [ ] T008: `services/codec-converter/batch` の名前を `@nagiyu/codec-converter-batch` に変更し、参照箇所を更新する
- [ ] T009: `services/tools` の名前を `@nagiyu/tools` に変更し、参照箇所を更新する
- [ ] T010: `infra/shared` の名前を `@nagiyu/infra-shared` に変更し、参照箇所を更新する

### Phase 3: `package.json` 構成の整理

- [ ] T011: `private: true` が欠落しているパッケージ（codec-converter-core, codec-converter-batch, niconico-mylist-assistant-batch）に追加する
- [ ] T012: サービスの core / batch / web パッケージから不要な `exports` / `types` フィールドを除去する
- [ ] T013: `niconico-mylist-assistant-core` の `types` パスを `dist/src/index.d.ts` に修正し、`main` / `tsconfig.json` のパス設定を合わせる（Phase 1 の T004 の調査結果をもとに実施）
- [ ] T014: `stock-tracker-core` の `main` パスを `dist/src/index.js` に修正し、`tsconfig.json` の `outDir` 設定を合わせる（Phase 1 の T004 の調査結果をもとに実施）
- [ ] T015: `infra/common` の `exports` を T003 の調査結果をもとに対応する（`require` 形式のままにするか `import` 形式に統一するかを決定）

### Phase 4: `scripts` の統一

- [ ] T016: `niconico-mylist-assistant-core` の `format` / `format:check` を `"."` を対象にする形式に修正する
- [ ] T017: `niconico-mylist-assistant-core` の `lint` に `tests/**/*.ts` を追加する
- [ ] T018: `niconico-mylist-assistant-core` に `test:watch` スクリプトを追加する
- [ ] T019: `niconico-mylist-assistant-batch` の `format` / `format:check` を `"."` を対象にする形式に修正する

### Phase 5: `devDependencies` の整理

- [ ] T020: `stock-tracker-batch` の `devDependencies` から `jest`, `ts-jest`, `typescript` を除去する（ルート管理に委ねる）

### Phase 6: 検証

- [ ] T021: 全パッケージでビルドが成功することを確認する
- [ ] T022: 全パッケージでテストが成功することを確認する
- [ ] T023: CIが成功することを確認する

## 参考ドキュメント

- [コーディング規約（Package Management）](../docs/development/rules.md)
- [モノレポ構成](../docs/development/monorepo-structure.md)

## 備考・未決定事項

- T003 の結果次第で、`infra/common` の `exports` 形式の対応方針が変わる。CDK の制約により CommonJS 形式が必要な場合は、`require` 形式のまま維持する。
- T013・T014 は、Phase 1 の T004 の調査結果をもとに影響範囲を確認した上で実施すること。`tsconfig.json` の `outDir` 変更はビルド出力パス・import 文・ビルドスクリプトへの影響があるため、Phase 6 の検証で動作確認を行うこと。
