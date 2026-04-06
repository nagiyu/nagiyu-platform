# NPM パッケージ管理 2026年第14週 - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/{service}/architecture.md に ADR として抽出し、
    tasks/{feature-name}/ ディレクトリごと削除します。

    入力: tasks/npm-update-2026-w14/requirements.md
    次に作成するドキュメント: tasks/npm-update-2026-w14/tasks.md
-->

## 対応方針

### 脆弱性修正の方針

| 脆弱性 | 対処方法 | 理由 |
| ------ | -------- | ---- |
| handlebars / path-to-regexp / picomatch（Critical/High） | overrides で対処済み（変更不要） | 直接依存がなく、overrides による transitive 依存の上書きが最小変更で有効 |
| brace-expansion / yaml（Moderate） | `npm audit fix` を実行 | fix available フラグがあり、自動修正で対応可能 |

overrides はあくまで暫定対処であり、将来的に直接依存パッケージ側（handlebars 等を依存するパッケージ）が修正版を出した場合は overrides を削除することが望ましい。ただし、本タスクではそのアクションは不要。

### パッケージ更新の方針

パッケージ更新は以下の原則で進める：

1. **モノレポルート管理を優先**: ルート `package.json` で管理されているパッケージはルートで更新し、各ワークスペースに反映する
2. **マイナー/パッチ更新のみ**: メジャーバージョンアップは本タスクのスコープ外（`typescript` 6.x、`@types/node` 25.x 等）
3. **段階的更新**: カテゴリごとに更新し、各段階でビルド・テストを確認する
4. **意図的バージョン固定は変更しない**: `next-auth`（5.0.0-beta.30）、`@auth/core`（0.41.1）は更新対象外

### devDependencies 重複解消の方針

`aws-sdk-client-mock` はすでに 3 ワークスペースで同一バージョン（^4.1.0）を使用している。ルートの `devDependencies` に移動し、各ワークスペースから削除する。

---

## コンポーネント設計

### 影響範囲

本タスクは実装コードの変更を伴わない。影響を受けるファイルは `package.json` と `package-lock.json` のみ。

### パッケージ責務分担

| 対象 | 変更内容 |
| ---- | -------- |
| ルート `package.json` | `npm audit fix` による brace-expansion / yaml 修正、aws-sdk-client-mock の devDependencies 追加、各パッケージのバージョン更新 |
| 各ワークスペース `package.json` | aws-sdk-client-mock の削除、各パッケージのバージョン更新 |
| `package-lock.json` | 上記変更に伴い自動更新 |

### 更新対象パッケージ一覧

#### セキュリティ修正（F-001）

`npm audit fix` を実行し、以下を修正する：

| パッケージ | 脆弱性 | 修正方法 |
| ---------- | ------ | -------- |
| `brace-expansion` | GHSA-f886-m6hf-6m8v | `npm audit fix` |
| `yaml` | GHSA-48c2-rrv3-qjmp | `npm audit fix` |

#### AWS SDK 更新（F-002）

ルートおよび以下のワークスペースで更新する：

- `libs/aws`
- `services/admin/core`, `services/admin/web`
- `services/auth/core`, `services/auth/web`
- `services/codec-converter/batch`, `services/codec-converter/web`
- `services/niconico-mylist-assistant/batch`, `services/niconico-mylist-assistant/core`, `services/niconico-mylist-assistant/web`
- `services/share-together/core`, `services/share-together/web`
- `services/stock-tracker/batch`, `services/stock-tracker/core`, `services/stock-tracker/web`

対象パッケージ（3.1010.0 → 3.1024.0）:

- `@aws-sdk/client-batch`
- `@aws-sdk/client-dynamodb`
- `@aws-sdk/client-s3`
- `@aws-sdk/client-lambda`
- `@aws-sdk/client-secrets-manager`
- `@aws-sdk/lib-dynamodb`
- `@aws-sdk/s3-request-presigner`

> ルート `package.json` のバージョン範囲を更新すれば、ワークスペースは npm install で自動解決される。ただし、ワークスペース側に直接記載がある場合は個別に更新する必要がある。

#### CDK 更新（F-003）

対象ワークスペース: `infra/*`（admin, auth, codec-converter, common, niconico-mylist-assistant, share-together, shared, stock-tracker, tools）

| パッケージ | 現在 | 更新後 |
| ---------- | ---- | ------ |
| `aws-cdk-lib` | 2.243.0 | 2.248.0 |
| `constructs` | 10.5.1 | 10.6.0 |
| `aws-cdk` | 2.1111.0 | 2.1117.0 |

#### Next.js 更新（F-004）

対象ワークスペース: `libs/ui`, 各サービスの `web`

| パッケージ | 現在 | 更新後 |
| ---------- | ---- | ------ |
| `next` | 16.1.7 | 16.2.2 |
| `eslint-config-next` | 16.1.7 | 16.2.2 |

#### その他パッケージ更新（F-005）

| パッケージ | 現在 | 更新後 | 対象 |
| ---------- | ---- | ------ | ---- |
| `@playwright/test` | 1.58.2 | 1.59.1 | services/stock-tracker/web, services/niconico-mylist-assistant/batch |
| `tailwindcss` | 4.2.1 | 4.2.2 | services/stock-tracker/web |
| `@tailwindcss/postcss` | 4.2.1 | 4.2.2 | services/stock-tracker/web |
| `dotenv` | 17.3.1 | 17.4.1 | services/stock-tracker/web, services/niconico-mylist-assistant/batch |
| `openai` | 6.31.0 | 6.33.0 | services/stock-tracker/batch |
| `eslint` | 10.0.3 | 10.2.0 | ルート |
| `@eslint/compat` | 2.0.3 | 2.0.4 | ルート |
| `typescript-eslint` | 8.57.1 | 8.58.0 | ルート |
| `ts-jest` | 29.4.6 | 29.4.9 | ルート |
| `aws-cdk` | 2.1111.0 | 2.1117.0 | ルート |
| `@middleware-endpoint-discovery` | 3.972.8 | 3.972.9 | ルート |

#### devDependencies 重複解消（F-006）

`aws-sdk-client-mock` (^4.1.0) をルートの `devDependencies` へ追加し、以下のワークスペースから削除する：

- `services/admin/core`
- `services/niconico-mylist-assistant/core`
- `services/codec-converter/batch`

---

## 実装上の注意点

### 依存関係・前提条件

- `npm audit fix` 実行時は `--force` オプションは使用しない（メジャーバージョン変更を防ぐため）
- パッケージ更新後は必ず影響ワークスペースのビルドとテストを実行する
- CDK 更新時は `cdk synth` で CloudFormation テンプレートの生成を確認する

### セキュリティ考慮事項

- overrides に設定済みの handlebars / path-to-regexp / picomatch は、直接依存の更新後に不要になれば削除する
- brace-expansion / yaml の修正は `npm audit fix`（自動修正）で対応し、ロック変更の影響を最小限にする

---

## docs/ への移行メモ

- [ ] `docs/services/{service}/requirements.md` に統合すること：
      本タスクは定期メンテナンスのため、個別サービスの要件ではなくプラットフォーム保守記録として管理
- [ ] `docs/services/{service}/external-design.md` に統合すること（UI の変更があれば）：
      本タスクは UI 変更を含まないため対象外
- [ ] `docs/services/{service}/architecture.md` に ADR として追記すること（重要な設計決定があれば）：
      npm overrides によるセキュリティ対応方針を ADR に記録することを検討する
