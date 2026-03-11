# APIレスポンス形式の統一

## 概要

一部の API ルートが `error: string` 形式でエラーレスポンスを返しており、`ApiErrorResponse`（`error: { code, message }`）を使用している他のルートと形式が不統一です。
フロント側の共通ハンドリングを容易にするため、全ルートを `ApiErrorResponse` 形式に統一します。

## 関連情報

- Issue: #1933（調査・対応方針の検討）
- PR: #1932（指摘元のレビューコメント）
- タスクタイプ: サービスタスク（share-together / niconico-mylist-assistant / auth）

## 要件

### 機能要件

- FR1: `NextResponse.json({ error: string })` 形式を `{ error: { code: string; message: string } }` 形式に変更する
- FR2: エラーコードは HTTP ステータスと対応する定数文字列（例: `'INTERNAL_SERVER_ERROR'`、`'NOT_FOUND'`）を使用する
- FR3: エラーメッセージは既存の `ERROR_MESSAGES` 定数を引き続き使用する
- FR4: 変更に伴いユニットテストを更新する

### 非機能要件

- NFR1: テストカバレッジ 80% 以上を維持する
- NFR2: TypeScript strict mode に違反しない
- NFR3: ESLint・Prettier チェックを通過する

## 調査結果

### 正しい形式（`ApiErrorResponse`）

`services/share-together/web/src/types/index.ts` で定義:

```
interface ApiErrorResponse {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
```

share-together の API ルート（`/api/lists`, `/api/groups` 等）はこの形式を正しく使用しています。

### 不統一箇所

#### share-together（今回対応）

| ファイル | 行 | 内容 |
|---------|-----|------|
| `src/middleware.ts` | 22 | `{ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }` |
| `src/app/api/test/reset/route.ts` | 73 | `{ error: ERROR_MESSAGES.NOT_FOUND }` |
| `src/app/api/test/reset/route.ts` | 95, 104 | `{ error: ERROR_MESSAGES.INTERNAL_SERVER_ERROR }` |

#### 他サービス（将来的な対応候補）

- `services/auth/web/src/app/api/users/**/*.ts`（全ルート）
- `services/niconico-mylist-assistant/web/src/app/api/videos/**/*.ts`（全ルート）
- `services/admin/web/src/middleware.ts`
- `services/niconico-mylist-assistant/web/src/middleware.ts`

## 実装方針

- 今回のスコープは `share-together/web` のみとする（PR #1932 の指摘対象）
- `middleware.ts` と `test/reset/route.ts` の `NextResponse.json({ error: string })` を `{ error: { code, message } }` 形式に変更
- エラーコードは定数文字列（`'INTERNAL_SERVER_ERROR'`、`'NOT_FOUND'`）をそのまま使用
- テスト（`tests/unit/middleware.test.ts`）のアサーションを新形式に合わせて更新

## タスク

- [x] T001: 調査・対応方針の策定（本ドキュメント）
- [x] T002: `src/middleware.ts` の error レスポンスを `ApiErrorResponse` 形式に変更
- [x] T003: `src/app/api/test/reset/route.ts` の error レスポンスを `ApiErrorResponse` 形式に変更
- [x] T004: `tests/unit/middleware.test.ts` のアサーションを新形式に更新
- [ ] T005: 他サービス（auth / niconico）の対応（別 Issue で追跡）

## 参考ドキュメント

- `services/share-together/web/src/types/index.ts` — `ApiErrorResponse` 型定義
- `services/share-together/web/src/lib/constants/errors.ts` — `ERROR_MESSAGES` 定数
- `docs/development/rules.md` — エラーメッセージ日本語化・定数化ルール

## 備考・未決定事項

- auth / niconico サービスへの横断対応は別 Issue で管理することを推奨
- `ApiErrorResponse` 型を共通ライブラリ（`@nagiyu/nextjs` 等）に移動することで型の一元管理が可能になるが、今回はスコープ外とする
