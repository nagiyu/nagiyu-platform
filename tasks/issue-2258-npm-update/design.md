<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/ に反映し、
    tasks/issue-2258-npm-update/ ディレクトリごと削除します。

    入力: tasks/issue-2258-npm-update/requirements.md
    次に作成するドキュメント: tasks/issue-2258-npm-update/tasks.md
-->

# NPM パッケージ更新 (2026年第11週) 技術設計

---

## API 仕様

なし（本タスクは npm 依存バージョンの変更のみ。アプリケーション API に変更なし）

---

## データモデル

なし（DB・ストレージへの変更なし）

---

## コンポーネント設計

### パッケージ責務分担

本タスクはアプリケーションロジックを変更しない。対象はモノレポの全ワークスペースの `package.json` と `package-lock.json`。

### 更新対象パッケージ一覧

#### グループ A: マイナー・パッチ更新（通常対応）

以下はすべてマイナー/パッチ更新であり、breaking changes のリスクは低い。

| パッケージ | 現在 | 更新後 | 影響ワークスペース |
| ---------- | ---- | ------ | ------------------ |
| `@aws-sdk/client-batch` | 3.1004.0 | 3.1010.0 | libs/aws, services/* |
| `@aws-sdk/client-dynamodb` | 3.1004.0 | 3.1010.0 | libs/aws, services/* |
| `@aws-sdk/client-lambda` | 3.1004.0 | 3.1010.0 | services/stock-tracker/web |
| `@aws-sdk/client-s3` | 3.1004.0 | 3.1010.0 | libs/aws, services/* |
| `@aws-sdk/client-secrets-manager` | 3.1004.0 | 3.1010.0 | services/niconico-mylist-assistant/* |
| `@aws-sdk/lib-dynamodb` | 3.1004.0 | 3.1010.0 | libs/aws, services/* |
| `@aws-sdk/s3-request-presigner` | 3.1004.0 | 3.1010.0 | services/codec-converter/web |
| `@aws-sdk/middleware-endpoint-discovery` | 3.972.7 | 3.972.8 | ルート（間接依存） |
| `@aws-sdk/types` | 3.973.5 | 3.973.6 | ルート（間接依存） |
| `aws-cdk` | 2.1110.0 | 2.1111.0 | ルート |
| `aws-cdk-lib` | 2.241.0 | 2.243.0 | infra/* |
| `next` | 16.1.6 | 16.1.7 | libs/ui, services/*/web |
| `eslint-config-next` | 16.1.6 | 16.1.7 | services/*/web |
| `jest` | 30.2.0 | 30.3.0 | ルート, infra/codec-converter |
| `@jest/types` | 30.2.0 | 30.3.0 | ルート, services/stock-tracker/web |
| `jest-environment-jsdom` | 30.2.0 | 30.3.0 | ルート |
| `openai` | 6.27.0 | 6.31.0 | services/stock-tracker/batch |
| `playwright` | 1.58.0 | 1.58.2 | services/niconico-mylist-assistant/batch |
| `typescript-eslint` | 8.56.1 | 8.57.1 | ルート |

#### グループ B: メジャーバージョン変更（調査・保留）

breaking changes の可能性があるため、本タスクスコープでは**更新しない**。別 Issue として切り出す。

| パッケージ | 現在 | npm latest | 対応方針 |
| ---------- | ---- | ---------- | -------- |
| `eslint` | 9.39.4 | 10.0.3 | 別 Issue で調査・対応 |
| `@eslint/js` | 9.39.4 | 10.0.1 | 別 Issue で調査・対応 |
| `@types/node` | 22.19.15 | 25.5.0 | 別 Issue で調査・対応 |

#### グループ C: 現行バージョン維持（理由あり）

| パッケージ | 現在 | npm outdated 表示 | 維持理由 |
| ---------- | ---- | ----------------- | -------- |
| `next-auth` | 5.0.0-beta.30 | 4.24.13 | beta 系を意図的に使用中。4.x は旧安定版で機能後退になるため維持 |
| `@auth/core` | 0.41.1 | 0.34.3 | next-auth beta との整合性のため維持 |

---

## 実装上の注意点

### 依存関係・前提条件

- `@aws-sdk/*` はモノレポ全体で共通利用。ルートの `package.json` でバージョンを上げることで全ワークスペースに波及する
- `aws-cdk-lib` は `infra/` 配下の各ワークスペースが直接依存しているため、各 `package.json` を個別更新する
- `next` / `eslint-config-next` は `libs/ui` と `services/*/web` が依存するため、更新後に各ワークスペースのビルドを確認する
- `openai` は `services/stock-tracker/batch` のみが直接依存する
- `playwright` は `services/niconico-mylist-assistant/batch` のみが直接依存する

### パフォーマンス考慮事項

- `npm install` 実行後、`package-lock.json` の差分が意図した範囲内であることを確認する
- ロックファイルの不要な変更（ネストした依存の大幅な変化）は再インストール前後で比較確認する

### セキュリティ考慮事項

- 更新後に `npm audit` を実行し、新規の Critical / High 脆弱性が発生していないことを確認する
- メジャーバージョンのパッケージ（グループ B）は本タスクでは触れない

---

## docs/ への移行メモ

- [ ] `docs/development/` に特記事項があれば追記すること：
      特記なし（パッケージ更新のみ）
- [ ] `docs/services/{service}/architecture.md` に ADR として追記すること（重要な設計決定があれば）：
      特記なし（next-auth beta 維持方針は別 Issue で ADR 化を検討する）
