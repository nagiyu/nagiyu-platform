# npm セキュリティ対応・パッケージ統一 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/package-management.md に ADR として抽出し、
    tasks/issue-2773-npm-security-update/ ディレクトリごと削除します。

    入力: tasks/issue-2773-npm-security-update/requirements.md
    次に作成するドキュメント: tasks/issue-2773-npm-security-update/tasks.md
-->

## API 仕様

該当なし（パッケージ更新タスクのため外部公開エンドポイントの変更なし）

---

## データモデル

該当なし（DB スキーマ変更なし）

---

## コンポーネント設計

### 対象ファイル一覧

| ファイル | 変更内容 |
| ------- | ------- |
| `package.json`（ルート） | `overrides.axios` を追加、`next` を更新 |
| `services/quick-clip/core/package.json` | `@aws-sdk` 系を `^3.1024.0` に更新 |
| `services/quick-clip/web/package.json` | `@aws-sdk` 系を `^3.1024.0` に更新 |
| `services/quick-clip/lambda/clip/package.json` | `@aws-sdk` 系を `^3.1024.0` に更新 |
| `services/quick-clip/lambda/zip/package.json` | `@aws-sdk` 系を `^3.1024.0` に更新 |
| `infra/quick-clip/package.json` | `aws-cdk-lib` を `^2.248.0`、`constructs` を `^10.6.0` に更新 |

---

## 実装上の注意点

### F-001: axios overrides 設定

#### 方針

`axios` は transitive 依存（isDirect: false）のため、直接バージョンアップではなく `overrides` で対応する。
これは `docs/development/package-management.md` の「セキュリティ対応（npm overrides）」方針に準拠する。

#### 設計

ルート `package.json` の `overrides` フィールドに以下を追加する：

```json
// overrides に追加（既存エントリに追記）
"axios": ">=1.15.0"
```

コメントで Advisory URL を残す規則は `package.json` では記述できないため、
`package.json` に隣接する `package-lock.json` の整合性確認で代替する。

**参照 Advisory:**

- GHSA-3p68-rc4w-qgx5（axios: NO_PROXY Hostname Normalization Bypass → SSRF、Critical）
- GHSA-fvcv-3m26-pcqx（axios: Unrestricted Cloud Metadata Exfiltration via Header Injection Chain、Critical、CVSS 10.0）

**対象バージョン:** `<=1.14.0` → `>=1.15.0` に固定

### F-002: Next.js 更新

#### 方針

`next` は直接依存（isDirect: true）のため、`package.json` を直接更新する。

#### 設計

以下のワークスペースの `next` バージョンを更新する（ルートで一元管理されているため、ルート `package.json` のみ更新）：

| ファイル | 変更前 | 変更後 |
| ------- | ------ | ------ |
| `package.json`（ルート）`dependencies.next` | `^16.2.2` | `^16.2.3` |

また `next` に合わせて `eslint-config-next` も揃えて更新する：

| ファイル | 変更前 | 変更後 |
| ------- | ------ | ------ |
| `package.json`（ルート）`devDependencies.eslint-config-next` | `^16.2.2` | `^16.2.3` |

**参照 Advisory:**

- GHSA-q4gf-8mx6-v5v3（Next.js: Denial of Service with Server Components、High、CVSS 7.5）

**対象バージョン:** `>=16.0.0-beta.0 <16.2.3` → `>=16.2.3` が必要

### F-003: quick-clip `@aws-sdk` バージョン統一

#### 方針

`services/quick-clip` 配下および `services/quick-clip/lambda` 配下のワークスペースが `^3.1010.0` を使用している。
他サービスは `^3.1024.0` を使用しており、バージョン不整合が生じているため `^3.1024.0` に統一する。

#### 設計

以下のワークスペースで該当パッケージを `^3.1024.0` に更新する：

| ワークスペース | 対象パッケージ |
| ------------- | ------------- |
| `services/quick-clip/core` | `@aws-sdk/client-dynamodb`、`@aws-sdk/client-s3`、`@aws-sdk/lib-dynamodb` |
| `services/quick-clip/web` | `@aws-sdk/client-batch`、`@aws-sdk/client-dynamodb`、`@aws-sdk/client-lambda`、`@aws-sdk/client-s3`、`@aws-sdk/lib-dynamodb`、`@aws-sdk/s3-request-presigner` |
| `services/quick-clip/lambda/clip` | `@aws-sdk/client-dynamodb`、`@aws-sdk/client-s3`、`@aws-sdk/lib-dynamodb`、`@aws-sdk/s3-request-presigner` |
| `services/quick-clip/lambda/zip` | `@aws-sdk/client-s3`、`@aws-sdk/s3-request-presigner` |

### F-004: infra/quick-clip CDK パッケージ統一

#### 方針

`infra/quick-clip` が `aws-cdk-lib ^2.243.0`・`constructs ^10.4.4` を使用している。
他の infra ワークスペースは `aws-cdk-lib ^2.248.0`・`constructs ^10.6.0` を使用しているため統一する。

#### 設計

| ファイル | パッケージ | 変更前 | 変更後 |
| ------- | --------- | ------ | ------ |
| `infra/quick-clip/package.json` | `aws-cdk-lib` | `^2.243.0` | `^2.248.0` |
| `infra/quick-clip/package.json` | `constructs` | `^10.4.4` | `^10.6.0` |

---

## 依存関係・前提条件

- npm workspaces が有効なモノレポ構成であること（確認済み）
- `npm install` 実行後に `package-lock.json` を更新してコミットすること
- ビルド・ユニットテスト・ESLint を各フェーズ完了後に確認すること

## パフォーマンス考慮事項

パッケージ更新のみであり、ランタイムの動作に影響を与えない。

## セキュリティ考慮事項

- overrides は暫定対処。直接依存パッケージが修正版を出した際は overrides を削除する
- 更新後は `npm audit` を実行し、残存する脆弱性がないことを確認する
- 破壊的変更がないことを npm changelog で事前に確認してから更新する

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/package-management.md` に統合すること：
      - overrides で axios を固定した事実と参照 Advisory（GHSA-3p68-rc4w-qgx5、GHSA-fvcv-3m26-pcqx）を「管理上の注意」セクションのサンプルとして追記する場合は記述
- [ ] `docs/services/{service}/architecture.md` に ADR として追記すること（重要な設計決定があれば）：
      - 今回は標準的なパッケージ更新のため ADR 追記は不要
