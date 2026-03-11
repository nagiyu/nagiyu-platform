# エラーメッセージの統一

## 概要

share-together の API ルート群で `ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED` が既に定義・使用されている
ルートと、英語直書き（`'DYNAMODB_TABLE_NAME is required'`）のルートが混在しており、統一が必要。
今回のスコープは Share Together のみとし、他サービスの対応は別 Issue で行う。

## 関連情報

- Issue: #1933（エラーメッセージの統一）
- 起因 PR: #1932 のレビューコメント
- タスクタイプ: サービスタスク（share-together を対象）
- 適用ルール: `docs/development/rules.md` § エラーハンドリング

## 要件

### 機能要件

- FR1: share-together web の全 API ルートで `'DYNAMODB_TABLE_NAME is required'` を
  `ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED` に置換する
- FR2: 変更後も既存ユニットテストがすべてパスすること

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

### 既存定数定義

```typescript
// services/share-together/web/src/lib/constants/errors.ts
DYNAMODB_TABLE_NAME_REQUIRED: '環境変数 DYNAMODB_TABLE_NAME の設定が必要です'
```

stock-tracker web には対応する定数が未定義のため、新規追加が必要。（本 Issue のスコープ外）

## 実装方針

1. **share-together web**

    - 違反する各 API ルートファイルはすでに `import { ERROR_MESSAGES } from '@/lib/constants/errors';` が存在する
    - `throw new Error('DYNAMODB_TABLE_NAME is required')` を
      `throw new Error(ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED)` に置換する

## タスク

- [x] T001: 違反している全 API ルートファイルに `ERROR_MESSAGES` インポートが存在することを確認（全ファイル確認済み）
- [x] T002: `'DYNAMODB_TABLE_NAME is required'` を `ERROR_MESSAGES.DYNAMODB_TABLE_NAME_REQUIRED` に置換（10 ファイル）
- [x] T003: `npm run lint --workspace=@nagiyu/share-together-web` でエラーなし確認
- [x] T004: `npm run test --workspace=@nagiyu/share-together-web` でテストパス確認

## 参考ドキュメント

- `docs/development/rules.md` — エラーハンドリングルール（§ エラーメッセージは日本語・定数で管理）
- `services/share-together/web/src/lib/constants/errors.ts` — 既存定数定義

## 備考・未決定事項

- stock-tracker の対応（web/batch とも）は別 Issue で行う。
- infra/ CDK スクリプトの英語エラーは開発者向け技術エラーのため対象外とする。
- libs/browser の `'Clipboard API is not supported'` は将来的に日本語化を検討するが今回は対象外とする。
