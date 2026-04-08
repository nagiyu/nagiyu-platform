<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/development/shared-libraries.md に ADR として抽出し、
    tasks/issue-2608-code-consolidation/ ディレクトリごと削除します。

    入力: tasks/issue-2608-code-consolidation/requirements.md
    次に作成するドキュメント: tasks/issue-2608-code-consolidation/tasks.md
-->

# コード共通化（Issue #2608） - 技術設計

---

## API 仕様

<!-- 今回の共通化タスクは外部公開エンドポイントの新規追加を行わない -->

---

## データモデル

<!-- 今回の共通化タスクはデータモデルの変更を行わない -->

---

## コンポーネント設計

### F-001: codec-converter/web の AWS クライアント統一

#### 現状

`services/codec-converter/web/src/app/api/jobs/route.ts` は独自のシングルトンキャッシュを持っている。

```
// 現状（route.ts 内に直接）
let cachedDocClient: DynamoDBDocumentClient | null = null;
let cachedS3Client: S3Client | null = null;

function getAwsClients() {
  if (!cachedDocClient || !cachedS3Client) {
    const dynamoClient = new DynamoDBClient({ region: AWS_REGION });
    ...
  }
  return { docClient: cachedDocClient, s3Client: cachedS3Client };
}
```

#### 変更後

`@nagiyu/aws` の `getAwsClients()` を使用する。同 route.ts の `[jobId]/route.ts` や `[jobId]/submit/route.ts` はすでに `@nagiyu/aws` を使用しており、`/api/jobs/route.ts` のみ変更が必要。

```
// 変更後（概念）
import { getAwsClients } from '@nagiyu/aws';
// キャッシュロジックは @nagiyu/aws 内部で管理されるため削除
```

**影響ファイル**: `services/codec-converter/web/src/app/api/jobs/route.ts`

---

### F-002: health route バージョン統一

#### 現状

- `services/stock-tracker/web/app/api/health/route.ts`: `version: '1.0.0'`（ハードコード）
- `services/auth/web/src/app/api/health/route.ts`: `version: '1.0.0'`（ハードコード）
- 他のサービス（admin, tools, niconico, share-together, codec-converter）: `version: process.env.APP_VERSION || '1.0.0'`

#### 変更後

```
// 変更後（概念）
export const GET = createHealthRoute({
  service: 'stock-tracker',  // または 'auth'
  version: process.env.APP_VERSION || '1.0.0',
});
```

**影響ファイル**:
- `services/stock-tracker/web/app/api/health/route.ts`
- `services/auth/web/src/app/api/health/route.ts`

---

### F-003: DynamoDB リポジトリへの AbstractDynamoDBRepository 適用

#### 現状と課題

`libs/aws` に `AbstractDynamoDBRepository<TEntity, TKey>` が存在し、`getById`, `create`, `update`, `delete` の共通実装を提供している。
現在 `services/admin/core` のみがこれを活用しており、他のサービスの 15 個の DynamoDB リポジトリは独自実装になっている。

各リポジトリの実装を確認すると、CRUD の基本実装は類似しているが、カスタムクエリ（GSI を使った一覧取得等）は各リポジトリ固有の実装が必要。

#### 方針判断

AbstractDynamoDBRepository は以下のメソッドを提供している:
- `getById(key: TKey)` - 単一取得
- `create(entity)` - 作成
- `update(key, updates)` - 更新
- `delete(key)` - 削除

各サービスのリポジトリが持つカスタムメソッド（`getByExchange`, `findAll`, `listByUserId` 等）は引き続き独自実装が必要。

**推奨方針**: 移行コストと利益のバランスを考慮し、新規追加するリポジトリから AbstractDynamoDBRepository を適用する。既存リポジトリの移行は優先度を低に設定し、バグ修正や大きな変更が発生したタイミングで段階的に対応する。

**先行確認**: `AbstractDynamoDBRepository` の `update` メソッドのシグネチャ（`Partial<TEntity>` を受け取る形式）が、各リポジトリの `UpdateXxxInput` 型と整合するか確認が必要。

---

### F-004: admin/core WebPushSender と libs/common/push の統合

#### 現状

```
// admin/core/notify/web-push-sender.ts（概念）
export class WebPushSender {
  async sendAll(payload): Promise<SendAllResult> {
    // 購読者リストを取得してループ処理
    // 個別に webPush.sendNotification() を呼び出し
    // 404/410 の場合は購読解除処理
  }
}
```

```
// libs/common/push/client.ts（概念）
export async function sendWebPushNotification(
  subscription,
  payload,
  vapidConfig
): Promise<boolean> {
  // 単一購読者への送信
  // 404/410 の場合は false を返す（削除は呼び出し元の責務）
}
```

#### 変更方針

2つのアプローチが考えられる:

**Option A（推奨）**: `admin/core/WebPushSender.sendAll()` の内部実装を `libs/common/push/sendWebPushNotification` に委譲する形にリファクタリング。

```
// 変更後（概念）
import { sendWebPushNotification } from '@nagiyu/common/push';

export class WebPushSender {
  async sendAll(payload): Promise<SendAllResult> {
    const subscriptions = await this.repository.findAll();
    for (const subscription of subscriptions) {
      const success = await sendWebPushNotification(
        subscription.subscription, payload, vapidConfig
      );
      if (!success) {
        // 404/410 の場合は削除処理（isInvalidSubscription の判定は libs/common 側で行う）
        await this.repository.deleteByEndpoint(subscription.subscription.endpoint);
      }
    }
  }
}
```

ただし `libs/common/push/client.ts` の現状実装では `isInvalidSubscription` の場合でも `false` を返すだけで購読解除は行わない。削除の責務を呼び出し元（admin/core）に持たせる形は適切。

**Option B**: libs/common に `sendAllNotifications(subscriptions, payload, vapidConfig)` を追加する。ただしこれはリポジトリ操作（`deleteByEndpoint`）を含む必要があり、`libs/common` がリポジトリに依存することになり依存関係が複雑になるため非推奨。

**結論**: Option A を採用。`admin/core/WebPushSender` は維持しつつ、内部実装を `sendWebPushNotification` に委譲する。

---

### F-005: codec-converter のエラーメッセージ定数化

#### 現状

`services/codec-converter/web/src/app/api/jobs/route.ts` でエラーメッセージが文字列リテラルで直接埋め込まれている。

#### 変更後

```
// 新規作成（概念）
// services/codec-converter/web/src/lib/constants/errors.ts
export const ERROR_MESSAGES = {
  MISSING_REQUIRED_FIELDS: '必須フィールドが不足しています',
  INVALID_CODEC: '無効なコーデックが指定されました',
  JOB_CREATION_FAILED: 'ジョブの作成に失敗しました',
} as const;
```

codec-converter/core の `validation.ts` 内のエラーメッセージ（ファイルサイズ、拡張子）は core 固有のバリデーションメッセージであるため、今回のスコープ外とする。

**影響ファイル**:
- `services/codec-converter/web/src/lib/constants/errors.ts`（新規作成）
- `services/codec-converter/web/src/app/api/jobs/route.ts`（修正）

---

## 実装上の注意点

### 依存関係・前提条件

- F-001 の変更は `@nagiyu/aws` が `codec-converter/web` の依存関係に含まれていることを前提とする（`package.json` 確認が必要）
- F-004 は `libs/common` の `sendWebPushNotification` の戻り値セマンティクス（`false` が 404/410 を意味するか否か）を確認してから実装する

### パフォーマンス考慮事項

- `@nagiyu/aws` の `getAwsClients()` は内部でリージョン別キャッシュを持っているため、独自のシングルトンと同等のパフォーマンスを維持できる

### セキュリティ考慮事項

- 既存の認証チェック・入力バリデーションロジックは変更しない
- `WebPushSender` の VAPID キーの取り扱いは変更しない

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/development/shared-libraries.md` に以下の ADR を追記すること：
      <!-- `getAwsClients()` を全サービスで統一使用することを決定 -->
- [ ] `docs/development/shared-libraries.md` に DynamoDB リポジトリの実装ガイドラインを追記すること：
      <!-- 新規リポジトリは AbstractDynamoDBRepository を使用すること -->
- [ ] `docs/development/rules.md` にエラーメッセージ定数化のルールが記載されているか確認すること
