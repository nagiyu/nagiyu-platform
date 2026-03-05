# 一時通知の追加

## 概要

現在のアラートは、手動で無効化するまで永続的に有効状態が続く。
監視用途では「今日1日（次の取引時間終了まで）だけ通知したい」というケースがある。

本タスクでは、アラートに「一時通知」フラグを追加し、取引時間終了後に自動で無効化する仕組みを実装する。
削除はユーザー自身が行うものとし、バッチは無効化のみを行う。

また、一時通知の自動無効化を担う1時間間隔のバッチ処理を新設する。

## 関連情報

- Issue: #（一時通知の追加）
- タスクタイプ: サービスタスク（stock-tracker/core・batch・web）

## 要件

### 機能要件

- **FR1**: アラートエンティティに一時通知フラグ（`Temporary: boolean`）を追加する
    - デフォルト値は `false`（通常の永続アラート）
    - 既存アラートへの影響なし（`undefined` は `false` として扱う）
- **FR2**: アラート作成・更新 API で `Temporary` フラグを受け付けられるようにする
- **FR3**: アラート設定画面（`AlertSettingsModal`）に一時通知のトグルを追加する
    - 一時通知を有効にした場合、次の取引時間終了まで有効という旨を画面上に表示する
- **FR4**: 1時間に1回発火する新規バッチ（`temporary-alert-expiry.ts`）を追加する
    - 全アラートを巡回し、以下の条件に合致するアラートを無効化（`Enabled = false`）する
        - `Temporary === true` かつ `Enabled === true`
        - 現在時刻が、当該アラートの取引所の取引時間外（`isTradingHours === false`）
- **FR5**: バッチによる無効化はアラートの `Enabled` フィールドを `false` に更新するのみとし、削除は行わない

### 非機能要件

- **NFR1**: TypeScript strict mode を維持する
- **NFR2**: テストカバレッジ 80% 以上を維持する
- **NFR3**: 既存アラート（`Temporary` フィールドなし）の動作に影響を与えない
- **NFR4**: バッチ処理は一時的な障害に対して graceful に継続する（1件エラーでも他を処理する）
- **NFR5**: エラーメッセージは日本語で `ERROR_MESSAGES` オブジェクトに定数化する

## 実装方針

### エンティティの変更

`AlertEntity` に省略可能な `Temporary` フィールドを追加する。

- `Temporary?: boolean`（省略時は `false` として扱う）
- `CreateAlertInput`・`UpdateAlertInput` にも `Temporary` を追加する

DynamoDB マッパー（`AlertMapper`）では、`Temporary` が `true` の場合のみ DB に保存し、
`toEntity` 時は存在しない場合を `false` とする。

### バッチの新設

`services/stock-tracker/batch/src/temporary-alert-expiry.ts` を新規作成する。

処理フロー:

```
全アラートを Frequency ごとに取得（MINUTE_LEVEL + HOURLY_LEVEL の両方）
  ↓
各アラートに対して:
  Temporary !== true → スキップ
  Enabled !== true  → スキップ
  isTradingHours(exchange, now) === true → スキップ（まだ取引時間内）
  上記以外 → Enabled = false に更新
```

統計情報（`BatchStatistics`）として以下を集計してログ出力する:

- `totalAlerts`: 取得したアラート件数
- `skippedNonTemporary`: 一時通知でないためスキップした件数
- `skippedEnabled`: 既に無効なためスキップした件数
- `skippedTradingHours`: 取引時間内のためスキップした件数
- `deactivated`: 無効化した件数
- `errors`: エラーが発生した件数

### インフラ

EventBridge Scheduler に `rate(1 hour)` でトリガーされる新しい Lambda 関数を追加する。
既存の `hourly.ts` とは独立したハンドラーとして管理する。

CloudFormation / CDK スタックへの追加が必要:

- Lambda 関数リソース
- EventBridge Scheduler ルール（`rate(1 hour)`）
- 必要な IAM ロール・ポリシー（DynamoDB への読み書き権限）

### Web UI

`AlertSettingsModal` にトグルスイッチを追加する。

- ラベル例: 「一時通知（次の取引終了まで）」
- トグルが ON の場合、補足テキストを表示する（例: 「取引時間終了後に自動で無効化されます」）
- API の `CreateAlertInput` / `UpdateAlertInput` に `Temporary` フィールドを含めて送信する

## タスク

- [ ] T001: `AlertEntity` に `Temporary?: boolean` フィールドを追加する
    - 影響ファイル: `services/stock-tracker/core/src/entities/alert.entity.ts`
- [ ] T002: `AlertMapper` で `Temporary` フィールドを `toItem` / `toEntity` で扱えるようにする
    - 影響ファイル: `services/stock-tracker/core/src/mappers/alert.mapper.ts`
- [ ] T003: コアのテストを更新する
    - `Temporary` フィールドのマッパーテスト追加
    - 影響ファイル: `services/stock-tracker/core/tests/unit/mappers/alert.mapper.test.ts`
- [ ] T004: `temporary-alert-expiry.ts` バッチハンドラーを新規作成する
    - 影響ファイル: `services/stock-tracker/batch/src/temporary-alert-expiry.ts`
- [ ] T005: バッチのユニットテストを新規作成する
    - 影響ファイル: `services/stock-tracker/batch/tests/unit/temporary-alert-expiry.test.ts`
- [ ] T006: Web API (`/api/alerts`) で `Temporary` フィールドを受け付けるようにする
    - 影響ファイル: `services/stock-tracker/web/src/app/api/alerts/route.ts`
    - 影響ファイル: `services/stock-tracker/web/src/app/api/alerts/[id]/route.ts`
- [ ] T007: `AlertSettingsModal` に一時通知トグルを追加する
    - 影響ファイル: `services/stock-tracker/web/src/components/AlertSettingsModal.tsx`
- [ ] T008: Web のバリデーション・ユニットテストを更新する
    - 影響ファイル: `services/stock-tracker/web/tests/unit/components/alert-validation.test.ts`
- [ ] T009: インフラ定義に新規 Lambda + EventBridge Scheduler を追加する
    - 影響ファイル: `infra/` 配下の関連 CloudFormation / CDK スタック

## 参考ドキュメント

- コーディング規約: `docs/development/rules.md`
- テスト戦略: `docs/development/testing.md`
- アーキテクチャ: `docs/development/architecture.md`
- アラートエンティティ: `services/stock-tracker/core/src/entities/alert.entity.ts`
- 取引時間チェック: `services/stock-tracker/core/src/services/trading-hours-checker.ts`
- 既存 hourly バッチ: `services/stock-tracker/batch/src/hourly.ts`

## 影響範囲

| ファイル | 変更種別 |
|--------|---------|
| `services/stock-tracker/core/src/entities/alert.entity.ts` | 変更 |
| `services/stock-tracker/core/src/mappers/alert.mapper.ts` | 変更 |
| `services/stock-tracker/core/tests/unit/mappers/alert.mapper.test.ts` | 変更 |
| `services/stock-tracker/batch/src/temporary-alert-expiry.ts` | 新規作成 |
| `services/stock-tracker/batch/tests/unit/temporary-alert-expiry.test.ts` | 新規作成 |
| `services/stock-tracker/web/src/app/api/alerts/route.ts` | 変更 |
| `services/stock-tracker/web/src/app/api/alerts/[id]/route.ts` | 変更 |
| `services/stock-tracker/web/src/components/AlertSettingsModal.tsx` | 変更 |
| `services/stock-tracker/web/tests/unit/components/alert-validation.test.ts` | 変更 |
| `infra/` 配下の関連スタック | 変更 |

## 備考・未決定事項

- 取引所（`ExchangeID`）が複数の場合、取引時間は銘柄の取引所基準で判断する（既存 hourly バッチと同様）
- `Temporary` を `false` から `true` に変更した場合、次の取引時間終了後に自動無効化される
- `Temporary` を `true` から `false` に変更した場合、永続アラートとして扱われる（バッチは無効化しない）
- 一時通知アラートが無効化された後、ユーザーが手動で `Enabled = true` に戻した場合の挙動は現時点では未定義
    - 次の取引時間終了後にまた自動無効化される想定
- インフラ側の具体的なリソース名・設定値は実装時に確認する
