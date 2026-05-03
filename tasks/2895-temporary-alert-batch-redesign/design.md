# 一時アラート失効バッチ再設計（短期対応） - 設計メモ

関連 Issue: #2895
中期対応 Issue: #2896

## 背景・目的

詳細は #2895 を参照。要点:

- 一時アラート失効バッチが `subscription` データの整合性に依存しており、`subscription` が `undefined` のレコードでクラッシュする
- 物理削除のため失敗時の冪等性が低い
- 削除判定に `subscription` は本来不要

本タスクは、根本的なデータモデル再設計（中期 #2896）の前段として、以下を実施する。

1. バッチが `subscription` を読まない経路を確立
2. 物理削除を「無効化 + DynamoDB TTL」に置き換え
3. Web のアラート一覧 API で `Enabled = true` のアラートのみ返す

## 設計方針

### 1. バッチ用軽量取得経路（`subscription` 非依存）

#### 新エンティティ型 `TemporaryAlertCandidate`

`AlertEntity` の縮小版。失効判定に必要な属性のみを含む。

```typescript
// services/stock-tracker/core/src/entities/temporary-alert-candidate.entity.ts
export interface TemporaryAlertCandidate {
  AlertID: string;
  UserID: string;
  ExchangeID: string;
  Frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL';
  Enabled: boolean;
  Temporary: boolean;
  TemporaryExpireDate: string;
}
```

`subscription` / `ConditionList` / `Mode` 等は含まない。

#### Mapper 追加メソッド

```typescript
// AlertMapper
public toTemporaryCandidate(item: DynamoDBItem): TemporaryAlertCandidate
```

- `AlertID`, `UserID`, `ExchangeID`, `Frequency` を `validateStringField` / `validateEnumField` で検証
- `Enabled` を `validateBooleanField` で検証
- `Temporary` は `=== true` チェック
- `TemporaryExpireDate` は文字列存在チェック
- `subscription` 系・`ConditionList` 系は触らない

#### Repository 追加メソッド

`AlertRepository` インターフェースに以下を追加:

```typescript
getTemporaryCandidatesByFrequency(
  frequency: 'MINUTE_LEVEL' | 'HOURLY_LEVEL',
  options?: PaginationOptions
): Promise<PaginatedResult<TemporaryAlertCandidate>>
```

実装:

- DynamoDB Query (`AlertIndex` GSI2) を使う
- `ProjectionExpression` で必要な属性のみ取得（subscription を取得しない = 検証もしない = 例外も起きない）
- `FilterExpression` で `Temporary = true AND Enabled = true` を加える（既に無効化済みのアラートを除外、バッチ負荷削減）
- `mapper.toTemporaryCandidate` でエラー時は警告ログでスキップ

`InMemoryAlertRepository` も同インタフェースを実装する。

### 2. 「無効化 + TTL」方式

#### Repository 追加メソッド

```typescript
// AlertRepository
markTemporaryAsExpired(
  userId: string,
  alertId: string,
  ttlSeconds: number
): Promise<void>
```

実装:

- DynamoDB `UpdateItem` で `Enabled = false`, `TTL = ttlSeconds`, `UpdatedAt = now` をセット
- `subscription` を読まない / 書かない
- `ConditionExpression: attribute_exists(PK)` で削除済みなら EntityNotFoundError

#### TTL 設定値

- 猶予期間: **7 日**（バッチ実行時刻 + 7 日後を Unix 秒で TTL に設定）
- 理由: TTL 発火は最大 48 時間遅延し得るが、7 日あれば余裕。万一バッチが数日止まっても、TTL を再上書きする運用で問題ない
- 定数: `EXPIRED_ALERT_TTL_GRACE_DAYS = 7`（バッチ側で定義）

#### バッチ書き換え

- `getAllAlertsByFrequency` → `getAllTemporaryCandidatesByFrequency` にリネームし、戻り値型を `TemporaryAlertCandidate[]` に
- `processAlert` の引数型を `TemporaryAlertCandidate` に
- `alertRepo.delete(...)` → `alertRepo.markTemporaryAsExpired(userId, alertId, ttlSeconds)` に
- 統計フィールド名 `deactivated` はそのまま（命名整合）。ただし「物理削除」を意味するコメントは更新

### 3. Web 一覧 API の `Enabled = true` フィルタ

#### Repository 拡張

`getByUserId` のオプションに `enabledOnly?: boolean` を追加:

```typescript
getByUserId(
  userId: string,
  options?: PaginationOptions & { enabledOnly?: boolean }
): Promise<PaginatedResult<AlertEntity>>
```

DynamoDB 実装: `enabledOnly === true` の場合、Query に `FilterExpression: #enabled = :true` を追加。
InMemory 実装: `enabledOnly === true` の場合、取得後に `items.filter(i => i.Enabled === true)` で絞り込み。

#### Web API 側

`services/stock-tracker/web/app/api/alerts/route.ts` の GET ハンドラで:

```typescript
const result = await alertRepo.getByUserId(userId, {
  ...parsePagination(request),
  enabledOnly: true,
});
```

### スコープ外（明示）

- 旧形式 (`SubscriptionEndpoint` 等) のマイグレーション → #2896
- `Subscription` エンティティの独立化 → #2896
- `mapper.validateSubscription` のフォールバック分岐削除 → #2896
- `getByFrequency` / `mapper.toEntity` の挙動変更（通知送信側で使用中のため触らない）
- `/api/alerts/tickers/[tickerId]` の Enabled フィルタ（用途が異なるため別途検討）

## テスト

### 追加するテスト

#### `services/stock-tracker/core/tests/unit/mappers/alert.mapper.test.ts`

- `toTemporaryCandidate`: 必須属性が揃っていれば正しく変換できる
- `toTemporaryCandidate`: `subscription` が undefined でも例外を投げない
- `toTemporaryCandidate`: `Temporary=false` のアイテムは Temporary が false で返る（フィルタは Repository 側）
- `toTemporaryCandidate`: 必須属性欠損で `InvalidEntityDataError` を投げる

#### `services/stock-tracker/core/tests/unit/repositories/dynamodb-alert.repository.test.ts`

- `getTemporaryCandidatesByFrequency`: 正常系（候補が返る）
- `getTemporaryCandidatesByFrequency`: subscription 不正データでも検証スキップで処理継続
- `getTemporaryCandidatesByFrequency`: ProjectionExpression と FilterExpression が指定される
- `markTemporaryAsExpired`: UpdateItem で `Enabled=false, TTL=..., UpdatedAt=...` がセットされる
- `markTemporaryAsExpired`: アイテムが存在しない場合 `EntityNotFoundError`
- `getByUserId`: `enabledOnly: true` で FilterExpression に Enabled=true が入る

#### `services/stock-tracker/core/tests/unit/repositories/in-memory-alert.repository.test.ts`

- `getTemporaryCandidatesByFrequency`: 正常動作
- `markTemporaryAsExpired`: 該当アイテムの `Enabled` が false に更新される
- `getByUserId`: `enabledOnly: true` で disabled アラートが除外される

#### `services/stock-tracker/batch/tests/unit/temporary-alert-expiry.test.ts`

- バッチが `getTemporaryCandidatesByFrequency` を呼ぶ
- `delete` ではなく `markTemporaryAsExpired` を TTL 秒数付きで呼ぶ
- TTL 値が `now + 7日` 相当の Unix 秒であること
- 既存テストを `TemporaryAlertCandidate` 型ベースに書き換え

#### `services/stock-tracker/web/tests/unit/app/api/`

- 既存の alerts route テストに、`getByUserId` が `enabledOnly: true` で呼ばれることを確認するテストを追加

## マイグレーション・運用

### デプロイ後

- 既存の disabled = false アラートはこれまで Web に表示されていなかった（実物理削除のため）
- 新方式でバッチが動くと、disabled = false + TTL 設定済みのアラートが DynamoDB に蓄積する
- TTL は最大 48 時間遅延で削除発火するため、容量への影響は限定的

### ロールバック

- 短期 Issue の変更を revert すれば従来動作に戻る
- TTL 設定済みアイテムは DynamoDB が削除するので、特別な掃除は不要

## ファイル変更一覧（予定）

### 追加

- `services/stock-tracker/core/src/entities/temporary-alert-candidate.entity.ts`
- `tasks/2895-temporary-alert-batch-redesign/design.md` (本ファイル)

### 変更

- `services/stock-tracker/core/src/entities/index.ts`（exports 追加）
- `services/stock-tracker/core/src/mappers/alert.mapper.ts`（`toTemporaryCandidate` 追加）
- `services/stock-tracker/core/src/repositories/alert.repository.interface.ts`（メソッド 2 つ追加、`getByUserId` 拡張）
- `services/stock-tracker/core/src/repositories/dynamodb-alert.repository.ts`（実装）
- `services/stock-tracker/core/src/repositories/in-memory-alert.repository.ts`（実装）
- `services/stock-tracker/batch/src/temporary-alert-expiry.ts`（軽量経路 + 無効化+TTL）
- `services/stock-tracker/web/app/api/alerts/route.ts`（GET ハンドラに `enabledOnly: true`）
- 関連テスト各種
