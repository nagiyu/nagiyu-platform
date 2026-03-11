# エラーメッセージの統一

## 概要

コードベース全体でエラーメッセージが英語のまま直接 `throw new Error(...)` されており、
`docs/development/rules.md` のルール（エラーは日本語・定数オブジェクトで管理）に違反している。
特に share-together の API ルート群は `ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED` が既に定義・使用されている
ルートと、英語直書きのルートが混在しており、最優先で統一が必要。

## 関連情報

- Issue: #1933（エラーメッセージの統一）
- 起因 PR: #1932 のレビューコメント
- タスクタイプ: サービスタスク（share-together・stock-tracker を主対象とした横断改善）
- 適用ルール: `docs/development/rules.md` § エラーハンドリング

## 要件

### 機能要件

- FR1: share-together web の全 API ルートで `'DYNAMODB_TABLE_NAME is required'` を
  `ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED` に置換する
- FR2: stock-tracker web の `lib/dynamodb.ts` で `'DYNAMODB_TABLE_NAME environment variable is not set'`
  を定数化した日本語メッセージに置換する
- FR3: 変更後も既存ユニットテストがすべてパスすること
- FR4: 変更に伴いテストのアサーション文字列も定数参照に更新する

### 非機能要件

- NFR1: エラーメッセージはすべて日本語で記述する
- NFR2: エラーメッセージはサービスごとの `ERROR_MESSAGES` 定数オブジェクトで管理する
- NFR3: 定数をインポートするパスは各サービスのエイリアス（`@/lib/constants/errors` 等）に従う

## 調査結果

### share-together web — 違反箇所（英語直書き）

すべて `'DYNAMODB_TABLE_NAME is required'` という文字列：

| ファイルパス | 行 |
|---|---|
| `services/share-together/web/src/app/api/groups/route.ts` | 35, 85 |
| `services/share-together/web/src/app/api/invitations/route.ts` | 59 |
| `services/share-together/web/src/app/api/invitations/[groupId]/route.ts` | 85 |
| `services/share-together/web/src/app/api/groups/[groupId]/members/route.ts` | 81, 162 |
| `services/share-together/web/src/app/api/groups/[groupId]/members/[userId]/route.ts` | 58 |
| `services/share-together/web/src/app/api/groups/[groupId]/route.ts` | 76 |
| `services/share-together/web/src/app/api/groups/[groupId]/lists/route.ts` | 42 |
| `services/share-together/web/src/app/api/groups/[groupId]/lists/[listId]/route.ts` | 54 |
| `services/share-together/web/src/app/api/groups/[groupId]/lists/[listId]/todos/route.ts` | 55 |
| `services/share-together/web/src/app/api/users/route.ts` | 63 |

既に正しく使用しているルートは `services/share-together/web/src/app/api/lists/` 配下（5 ファイル）。

### stock-tracker web — 違反箇所

- `services/stock-tracker/web/lib/dynamodb.ts:38` — `'DYNAMODB_TABLE_NAME environment variable is not set'`（英語）
- 対応するテスト: `services/stock-tracker/web/tests/unit/lib/repository-factory.test.ts:37`

### stock-tracker batch — 参考

- `services/stock-tracker/batch/src/lib/aws-clients.ts:46` — `'環境変数 DYNAMODB_TABLE_NAME が設定されていません'`（日本語だが定数化なし）
- 対応するテスト: `services/stock-tracker/batch/tests/unit/lib/aws-clients.test.ts:71`
- 本 Issue のスコープ外とするが、将来的に定数化を推奨

### 既存定数定義

```typescript
// services/share-together/web/src/lib/constants/errors.ts
DYNAMODB_TABLE_NAME_REQUIRED: '環境変数 DYNAMODB_TABLE_NAME の設定が必要です'
```

stock-tracker web には対応する定数が未定義のため、新規追加が必要。

## 実装方針

1. **share-together web（最優先）**

    - 違反する各 API ルートファイルの先頭に `import { ERROR_MESSAGES } from '@/lib/constants/errors';`
      が存在することを確認し、存在しない場合は追加する
    - `throw new Error('DYNAMODB_TABLE_NAME is required')` を
      `throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED)` に一括置換する
    - import が重複しないよう注意する

2. **stock-tracker web（次優先）**

    - `services/stock-tracker/web/lib/error-messages.ts` に `DYNAMODB_TABLE_NAME_REQUIRED` キーを追加する
      （既存の `STOCK_TRACKER_ERROR_MESSAGES` オブジェクトに倣う）
    - `lib/dynamodb.ts` でそのキーを参照するよう変更する
    - テストのアサーション文字列も定数参照に変更する

3. **「どの API で不足しているか」のログ情報（Issue コメントへの対応）**

    - throw するメッセージ本体は定数のまま維持する
    - ルート関数内で `console.error` 等を使い、どのエンドポイントかが分かるコンテキストを追加することを
      検討する（過度に変更範囲を広げない場合はスコープ外でも可）

## タスク

### Phase 1: share-together web の修正

- [ ] T001: 違反している全 API ルートファイルに `ERROR_MESSAGES` インポートを確認・追加
- [ ] T002: `'DYNAMODB_TABLE_NAME is required'` を `ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED` に置換（10 ファイル）
- [ ] T003: `npm run lint --workspace=@nagiyu/share-together-web` でエラーなし確認
- [ ] T004: `npm run test --workspace=@nagiyu/share-together-core` でテストパス確認

### Phase 2: stock-tracker web の修正

- [ ] T005: `services/stock-tracker/web/lib/error-messages.ts` に `DYNAMODB_TABLE_NAME_REQUIRED` 定数追加
- [ ] T006: `services/stock-tracker/web/lib/dynamodb.ts` で定数参照に変更
- [ ] T007: `services/stock-tracker/web/tests/unit/lib/repository-factory.test.ts` のアサーション更新
- [ ] T008: `npm run test --workspace=@nagiyu/stock-tracker-web` でテストパス確認

### Phase 3: 検証

- [ ] T009: share-together web の Fast CI をローカルで模擬（lint + format + test）
- [ ] T010: stock-tracker web の Fast CI をローカルで模擬（lint + format + test）

## 参考ドキュメント

- `docs/development/rules.md` — エラーハンドリングルール（§ エラーメッセージは日本語・定数で管理）
- `services/share-together/web/src/lib/constants/errors.ts` — 既存定数定義
- `services/stock-tracker/web/lib/error-messages.ts` — 既存定数定義（stock-tracker）

## 備考・未決定事項

- stock-tracker batch の `aws-clients.ts` は日本語だが定数化されていない。今回のスコープ外とするが
  後続の定数化 Issue で対応を推奨する。
- infra/ CDK スクリプトの英語エラーは開発者向け技術エラーのため対象外とする。
- libs/browser の `'Clipboard API is not supported'` は将来的に日本語化を検討するが今回は対象外とする。
