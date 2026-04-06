<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/{service}/requirements.md に統合して削除します。
-->

# NPM パッケージ管理 2026年第14週 - 要件定義書

---

## 1. ビジネス要件

### 1.1 背景・目的

2026年第14週（2026-04-06）の週次 NPM 管理レポート（Issue #2611）において、以下の問題が検出された。

- **Priority 1（緊急）**: セキュリティ脆弱性 — Critical 1件、High 2件、Moderate 3件
- **Priority 3（改善）**: devDependencies の重複、多数のパッケージ更新

本タスクは調査・対応方針の決定を目的とする。  
なお、調査の結果、Priority 1 に該当する Critical/High 脆弱性はすでに `package.json` の `overrides` で対処済みであることを確認した（後述）。

### 1.2 対象ユーザー

- プラットフォーム管理者・開発者（npm 脆弱性対応）

### 1.3 ビジネスゴール

- npm audit で検出された脆弱性をゼロにする（Moderate 以上）
- 依存パッケージを最新安定版に追従させ、セキュリティリスクを低減する
- モノレポ全体のパッケージ管理を整理し、保守性を向上させる

---

## 2. 機能要件

### 2.1 調査結果サマリー

#### 2.1.1 Priority 1: セキュリティ脆弱性の現状

| パッケージ | 報告時の重大度 | 脆弱性概要 | 現在の状態 |
| ---------- | ------------- | ---------- | ---------- |
| `handlebars` (4.0.0–4.7.8) | Critical/High/Moderate | JavaScript Injection、Prototype Pollution | `overrides: "handlebars": "^4.7.9"` で対処済み |
| `path-to-regexp` (8.0.0–8.3.0) | High | DoS（sequential optional groups, ReDoS） | `overrides: "path-to-regexp": "^8.4.0"` で対処済み |
| `picomatch` (<=2.3.1, 4.0.0–4.0.3) | High/Moderate | Method Injection、ReDoS | `overrides: "picomatch": "^4.0.4"` で対処済み |

現在の `npm audit` 結果（2026-04-06 時点の調査）:  
Critical: 0 / High: 0 / **Moderate: 2** / Low: 0

#### 2.1.2 新規検出脆弱性（要対応）

上記の overrides 対応後、新たに以下の Moderate 脆弱性が検出されている。

| パッケージ | 重大度 | 脆弱性概要 | 対処方針 |
| ---------- | ------ | ---------- | -------- |
| `brace-expansion` (<=1.1.12 \| 2.0.0–2.0.2 \| 4.0.0–5.0.4) | Moderate | Zero-step sequence によるプロセスハングおよびメモリ枯渇 | `npm audit fix` で解決可能 |
| `yaml` (1.0.0–1.10.2) | Moderate | 深くネストされた YAML コレクションによるスタックオーバーフロー | `npm audit fix` で解決可能 |

#### 2.1.3 Priority 3: パッケージ更新（主要なもの）

| カテゴリ | パッケージ例 | 現在 | 最新 | 影響ワークスペース |
| -------- | ------------ | ---- | ---- | ---------------- |
| AWS SDK | `@aws-sdk/client-*`, `@aws-sdk/lib-dynamodb` | 3.1010.0 | 3.1024.0 | libs/aws, 多数サービス |
| CDK | `aws-cdk-lib`, `constructs`, `aws-cdk` | 2.243.0 / 10.5.1 / 2.1111.0 | 2.248.0 / 10.6.0 / 2.1117.0 | infra/* |
| Next.js | `next`, `eslint-config-next` | 16.1.7 | 16.2.2 | libs/ui, 多数サービス |
| Playwright | `@playwright/test` | 1.58.2 | 1.59.1 | services/stock-tracker/web, services/niconico-mylist-assistant/batch |
| Tailwind | `tailwindcss`, `@tailwindcss/postcss` | 4.2.1 | 4.2.2 | services/stock-tracker/web |
| その他 | `dotenv`, `eslint`, `ts-jest`, `openai` | 各 | 各最新 | 各サービス |

> **注意**: `next-auth`（5.0.0-beta.30）の "最新" は 4.24.13 と表示されているが、これはメジャーバージョンの変更であり意図的なバージョン固定と判断する。更新対象外とする。  
> **注意**: `@auth/core`（0.41.1）の "最新" は 0.34.3 となっており、これも意図的な固定と判断する。更新対象外とする。

#### 2.1.4 Priority 3: devDependencies 重複

| パッケージ | 重複ワークスペース | 推奨アクション |
| ---------- | ---------------- | -------------- |
| `aws-sdk-client-mock` (^4.1.0) | services/admin/core, services/niconico-mylist-assistant/core, services/codec-converter/batch | ルート package.json へ統合 |

### 2.2 機能一覧

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-001 | Moderate 脆弱性修正 | brace-expansion / yaml の脆弱性を `npm audit fix` で修正する | 高 |
| F-002 | AWS SDK 更新 | @aws-sdk/* パッケージを 3.1024.0 へ更新する | 中 |
| F-003 | CDK 更新 | aws-cdk-lib / constructs / aws-cdk を最新版へ更新する | 中 |
| F-004 | Next.js 更新 | next / eslint-config-next を 16.2.2 へ更新する | 中 |
| F-005 | その他パッケージ更新 | @playwright/test, tailwindcss, dotenv, openai 等を最新版へ更新する | 低 |
| F-006 | devDependencies 重複解消 | aws-sdk-client-mock をルートへ統合する | 低 |

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| 項目 | 要件 |
| ---- | ---- |
| ビルド時間 | 更新前後で大きな差異がないこと |

### 3.2 セキュリティ要件

- F-001 完了後、`npm audit` で Moderate 以上の脆弱性が 0 件になること
- すべての脆弱性修正は `npm audit` で確認すること

### 3.3 可用性要件

| 項目 | 要件 |
| ---- | ---- |
| ビルド成功 | 全ワークスペースのビルドが成功すること |
| テスト成功 | 全ワークスペースの既存テストが成功すること |

### 3.4 保守性・拡張性要件

- overrides は恒久的な解決策ではなく、直接依存側の更新が望ましい
- パッケージ更新は段階的に行い、各段階でテストを確認すること

---

## 4. ドメインオブジェクト

| エンティティ | 説明 |
| ----------- | ---- |
| 脆弱性 | npm audit で検出されたセキュリティ問題。Critical / High / Moderate / Low の重大度がある |
| overrides | package.json で transitive 依存のバージョンを強制上書きする設定 |
| ワークスペース | モノレポ内の各パッケージ（libs/*, services/*, infra/*） |

---

## 5. スコープ外

- ❌ `next-auth` のメジャーバージョン変更（5.x → 4.x は意図的なバージョン固定）
- ❌ `@auth/core` の更新（意図的なバージョン固定）
- ❌ `typescript` の 6.x へのメジャーバージョンアップ（5.9.3 → 6.x は大規模変更を伴う可能性があるため別タスクで検討）
- ❌ `@types/node` の 25.x へのメジャーバージョンアップ（同上）

---

## 6. 用語集

| 用語 | 定義 |
| ---- | ---- |
| overrides | npm の package.json フィールド。transitive 依存パッケージのバージョンを強制的に上書きする |
| npm audit fix | npm が自動的に脆弱性のある依存パッケージを安全なバージョンに更新するコマンド |
| transitive 依存 | 直接依存パッケージが依存する間接的な依存パッケージ |
