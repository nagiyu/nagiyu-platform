# さくっとクリップ リファクタリング - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/quick-clip/architecture.md に ADR として抽出し、
    tasks/quick-clip-refactoring/ ディレクトリごと削除します。

    参照: tasks/quick-clip-refactoring/requirements.md
-->

## API 仕様

### 変更エンドポイント

#### GET /api/jobs/[jobId]

**変更内容**: DynamoDB のみを参照する実装から、AWS Batch の `DescribeJobsCommand` と DynamoDB を組み合わせてレスポンスを構成する実装に変更する。DynamoDB への書き込みは行わない（read-only）。

**レスポンス（成功）**

```typescript
type GetJobResponse = {
    jobId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
    originalFileName: string;
    fileSize: number;
    createdAt: number;
    expiresAt: number;
    batchStage?: 'downloading' | 'analyzing' | 'aggregating'; // PROCESSING 時のみ
    errorMessage?: string; // FAILED 時のみ
};
```

**状態導出ロジック**:

```
1. DynamoDB から Job を取得（jobId, batchJobId, originalFileName, fileSize, createdAt, expiresAt, batchStage?, errorMessage?）
2. batchJobId が未設定 → status: 'PENDING' を返す
3. batchJobId が設定済み → DescribeJobsCommand を呼ぶ
   - SUBMITTED / PENDING / RUNNABLE / STARTING → status: 'PENDING'
   - RUNNING → status: 'PROCESSING'、batchStage を DynamoDB から添付
   - SUCCEEDED → status: 'COMPLETED'
   - FAILED → status: 'FAILED'、errorMessage を DynamoDB から添付
4. DynamoDB に Job が存在しない → 404 を返す（変更なし）
```

#### POST /api/jobs

**変更内容**: `SubmitJobCommand` のレスポンスから `jobId`（AWS Batch job ID）を取得し、DynamoDB の Job レコードに `batchJobId` として保存する。

小ファイル（< 5 GB）のフロー:
1. Job レコードを DynamoDB に作成（`batchJobId` は未設定）
2. S3 Presigned URL を発行してクライアントに返す
3. クライアントがアップロード完了後、`complete-upload` を呼ばない（小ファイルは単一 PUT）
4. **変更**: Batch Submit と同時に `batchJobId` を Job レコードに UpdateCommand で保存する

#### POST /api/jobs/[jobId]/complete-upload

**変更内容**: Batch Submit 後に `batchJobId` を Job レコードに保存する。

---

## データモデル

### 論理モデル（変更分）

#### Job（変更）

```typescript
// 変更前
type Job = {
    jobId: string;
    status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED'; // 削除
    originalFileName: string;
    fileSize: number;
    createdAt: number;
    expiresAt: number;
    errorMessage?: string;
};

// 変更後
type Job = {
    jobId: string;
    // status フィールドを削除（Batch の状態を正とするため）
    batchJobId?: string;       // 追加: AWS Batch job ID（Submit 後に設定される）
    batchStage?: BatchStage;   // 追加: 解析ステージ（Batch コンテナが更新）
    originalFileName: string;
    fileSize: number;
    createdAt: number;
    expiresAt: number;
    errorMessage?: string;     // 変更: Batch コンテナが失敗時のみ書き込む
};

type BatchStage = 'downloading' | 'analyzing' | 'aggregating';
```

**注意**: `GET /api/jobs/[jobId]` のレスポンスには引き続き `status` フィールドを含む（Batch の状態から導出）。`status` は DynamoDB に保存しなくなるだけであり、クライアントへの API レスポンスの型は変わらない。

#### Highlight（変更）

```typescript
// 変更前
type Highlight = {
    highlightId: string;
    jobId: string;
    order: number;
    startSec: number;
    endSec: number;
    source: 'motion' | 'volume' | 'emotion' | 'both';
    status: 'unconfirmed' | 'accepted' | 'rejected';
    clipStatus: 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED';
    dominantEmotion?: 'laugh' | 'excite' | 'touch' | 'tension';
};

// 変更後（expiresAt を追加）
type Highlight = {
    highlightId: string;
    jobId: string;
    order: number;
    startSec: number;
    endSec: number;
    source: 'motion' | 'volume' | 'emotion' | 'both';
    status: 'unconfirmed' | 'accepted' | 'rejected';
    clipStatus: 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED';
    dominantEmotion?: 'laugh' | 'excite' | 'touch' | 'tension';
    expiresAt: number; // 追加: Job の expiresAt と同値（Unix 秒）
};
```

### 物理モデル（DynamoDB）

#### Job テーブル（変更）

| 属性 | 型 | 変更 | 説明 |
|-----|----|------|------|
| PK | string | 変更なし | `JOB#{jobId}` |
| SK | string | 変更なし | `JOB#{jobId}` |
| Type | string | 変更なし | `'JOB'` |
| jobId | string | 変更なし | アプリケーションの UUID |
| status | string | **削除** | Batch の状態を正とするため不要 |
| batchJobId | string | **追加** | AWS Batch の job ID |
| batchStage | string | **追加** | `'downloading'` / `'analyzing'` / `'aggregating'` |
| originalFileName | string | 変更なし | |
| fileSize | number | 変更なし | |
| createdAt | number | 変更なし | Unix 秒 |
| expiresAt | number | 変更なし | Unix 秒、TTL 属性 |
| errorMessage | string | 変更なし（用途変更） | Batch コンテナが失敗時のみ書き込む |

#### Highlight テーブル（変更）

| 属性 | 型 | 変更 | 説明 |
|-----|----|------|------|
| expiresAt | number | **追加** | Unix 秒、Job の expiresAt と同値、TTL 属性 |
| （他フィールドは変更なし） | | | |

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 変更内容 |
|----------|---------|
| `quick-clip/core` | Job/Highlight 型変更、リポジトリ・サービスの変更 |
| `quick-clip/batch` | エントリーポイントは変更なし（core の変更を利用） |
| `quick-clip/web` | API Routes の変更、フロントエンドの変更 |
| `quick-clip/lambda/clip` | 変更なし |
| `quick-clip/lambda/zip` | 変更なし |

### 実装モジュール一覧

#### core（変更・追加）

| モジュール | パス | 変更内容 |
|----------|------|---------|
| 型定義 | `core/src/types.ts` | `Job.status` 削除、`Job.batchJobId` / `Job.batchStage` 追加、`BatchStage` 型追加、`Highlight.expiresAt` 追加 |
| Job リポジトリ IF | `core/src/repositories/job.repository.interface.ts` | `updateStatus` 削除、`updateBatchJobId` / `updateBatchStage` / `updateErrorMessage` 追加 |
| Job DynamoDB リポジトリ | `core/src/repositories/dynamodb-job.repository.ts` | 上記 IF の実装、`JobItem` の `status` 削除・`batchJobId` / `batchStage` 追加 |
| Job サービス | `core/src/libs/job.service.ts` | `updateStatus` 削除、`updateBatchJobId` / `updateBatchStage` / `updateErrorMessage` 追加 |
| Highlight リポジトリ IF | `core/src/repositories/highlight.repository.interface.ts` | `expiresAt` を batchUpsert の引数に追加 |
| Highlight DynamoDB リポジトリ | `core/src/repositories/dynamodb-highlight.repository.ts` | `expiresAt` の永続化対応 |
| core エクスポート | `core/src/index.ts` | `BatchStage` 型エクスポート追加 |
| Batch ランナー | `core/src/libs/quick-clip-batch-runner.ts` | `updateJobStatus` の呼び出し削除、`updateBatchStage` 呼び出し追加、失敗時 `updateErrorMessage` に変更、`persistHighlights` に `expiresAt` 渡す |

#### web（変更・追加）

| モジュール | パス | 変更内容 |
|----------|------|---------|
| Web 型定義 | `web/src/types/quick-clip.ts` | `Job` 型更新（`status` 削除・`batchJobId` / `batchStage?` 追加）、`BatchStage` 型追加 |
| Jobs API | `web/src/app/api/jobs/route.ts` | Batch Submit 後に `batchJobId` を Job に保存 |
| Complete Upload API | `web/src/app/api/jobs/[jobId]/complete-upload/route.ts` | Batch Submit 後に `batchJobId` を Job に保存 |
| Job Status API | `web/src/app/api/jobs/[jobId]/route.ts` | `DescribeJobsCommand` を使った状態導出ロジックを追加 |
| アップロード画面 | `web/src/app/page.tsx` | XHR 進捗・制約通知 |
| 処理中画面 | `web/src/app/jobs/[jobId]/page.tsx` | Stepper・ポーリング 5s・有効期限・タブ閉じ通知 |
| 見どころ確認画面 | `web/src/app/jobs/[jobId]/highlights/page.tsx` | X/Y 進捗・有効期限表示 |

### モジュール間インターフェース

```typescript
// core/src/types.ts
export type BatchStage = 'downloading' | 'analyzing' | 'aggregating';

export type Job = {
    jobId: string;
    batchJobId?: string;
    batchStage?: BatchStage;
    originalFileName: string;
    fileSize: number;
    createdAt: number;
    expiresAt: number;
    errorMessage?: string;
};

export type Highlight = {
    // ...既存フィールド...
    expiresAt: number;
};

// core/src/repositories/job.repository.interface.ts
interface JobRepository {
    getById(jobId: string): Promise<Job | null>;
    create(job: Job): Promise<Job>;
    updateBatchJobId(jobId: string, batchJobId: string): Promise<void>;
    updateBatchStage(jobId: string, batchStage: BatchStage): Promise<void>;
    updateErrorMessage(jobId: string, errorMessage: string): Promise<void>;
}

// core/src/libs/job.service.ts
class JobService {
    async getJob(jobId: string): Promise<Job>;
    async createJob(params: CreateJobParams): Promise<Job>;
    async updateBatchJobId(jobId: string, batchJobId: string): Promise<void>;
    async updateBatchStage(jobId: string, batchStage: BatchStage): Promise<void>;
    async updateErrorMessage(jobId: string, errorMessage: string): Promise<void>;
}
```

---

## 実装上の注意点

### Batch ランナーの変更

`quick-clip-batch-runner.ts` の `runQuickClipBatch` 関数から status の更新を完全に取り除く:

```typescript
// 変更前
export const runQuickClipBatch = async (env): Promise<void> => {
    try {
        await updateJobStatus(jobId, 'PROCESSING', ...);
        // ...処理...
        await updateJobStatus(jobId, 'COMPLETED', ...);
    } catch (error) {
        await updateJobStatus(jobId, 'FAILED', ...error);
    }
};

// 変更後
export const runQuickClipBatch = async (env): Promise<void> => {
    try {
        await updateBatchStage(jobId, 'downloading', ...);
        await downloadSourceVideo(...);

        await updateBatchStage(jobId, 'analyzing', ...);
        const highlights = await buildHighlights(...);

        await updateBatchStage(jobId, 'aggregating', ...);
        await persistHighlights(jobId, highlights, expiresAt, ...); // expiresAt を追加

    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        await updateErrorMessage(jobId, message, ...);
        throw error; // 再スローして Batch に失敗を通知
    }
};
```

`persistHighlights` は Job の `expiresAt` を受け取り、各 Highlight に設定する。`expiresAt` は Batch ランナー起動時に環境変数から取得するか、Job レコードから読み取る。

> **実装ノート**: `expiresAt` を Batch 環境変数として渡す方法と、Job を DynamoDB から読み取る方法の2つがある。Job を読み取る方法は追加 DynamoDB 呼び出しが発生するが、信頼性が高い。環境変数として渡す方法は変更が少ない。いずれかを実装者が選択すること。

### GET /api/jobs/[jobId] の変更

```typescript
// web/src/app/api/jobs/[jobId]/route.ts
import { DescribeJobsCommand } from '@aws-sdk/client-batch';

export async function GET(_request: Request, { params }: RouteParams) {
    const job = await jobService.getJob(jobId);
    if (!job) return notFound();

    // batchJobId が未設定の場合は PENDING
    if (!job.batchJobId) {
        return NextResponse.json({ ...job, status: 'PENDING' });
    }

    // AWS Batch の実状態を取得
    const batchResult = await getBatchClient().send(
        new DescribeJobsCommand({ jobs: [job.batchJobId] })
    );
    const batchJob = batchResult.jobs?.[0];
    const batchStatus = batchJob?.status ?? 'FAILED';

    const status = mapBatchStatus(batchStatus); // PENDING / PROCESSING / COMPLETED / FAILED

    return NextResponse.json({
        jobId: job.jobId,
        status,
        originalFileName: job.originalFileName,
        fileSize: job.fileSize,
        createdAt: job.createdAt,
        expiresAt: job.expiresAt,
        ...(status === 'PROCESSING' && job.batchStage ? { batchStage: job.batchStage } : {}),
        ...(status === 'FAILED' && job.errorMessage ? { errorMessage: job.errorMessage } : {}),
    });
}

function mapBatchStatus(batchStatus: string): 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' {
    switch (batchStatus) {
        case 'SUBMITTED':
        case 'PENDING':
        case 'RUNNABLE':
        case 'STARTING':
            return 'PENDING';
        case 'RUNNING':
            return 'PROCESSING';
        case 'SUCCEEDED':
            return 'COMPLETED';
        case 'FAILED':
        default:
            return 'FAILED';
    }
}
```

### batchJobId の保存（POST /api/jobs と complete-upload）

```typescript
// Batch Submit 後
const batchResponse = await getBatchClient().send(new SubmitJobCommand({ ... }));
const batchJobId = batchResponse.jobId!;

// Job レコードに batchJobId を保存
await jobService.updateBatchJobId(job.jobId, batchJobId);
```

### SCR-003 の expiresAt 取得

現在の見どころ確認画面は `GET /api/jobs/[jobId]/highlights` のみを呼んでいる。有効期限を表示するために、初回マウント時に `GET /api/jobs/[jobId]` を 1 回呼び `expiresAt` を取得する。ポーリングは不要（静的な値のため）。

### アップロード進捗（page.tsx）

小ファイルの場合、現在の `fetch()` を `XMLHttpRequest` に変更する:

```typescript
// 変更後（小ファイル用）
const uploadWithProgress = (url: string, file: File): Promise<void> =>
    new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', url);
        xhr.setRequestHeader('Content-Type', ACCEPTED_FILE_TYPE);
        xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
                setUploadProgress(Math.round((e.loaded / e.total) * 100));
            }
        };
        xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
                setUploadProgress(100);
                resolve();
            } else {
                reject(new Error(`Upload failed: ${xhr.status}`));
            }
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.send(file);
    });
```

大ファイル（マルチパート）の場合は既存のチャンクループで `uploadedBytes / file.size` を追跡する。

---

## 依存関係・前提条件

- AWS Batch クライアント（`getBatchClient()`）は `web/src/lib/server/aws.ts` に既に実装済み
- `DescribeJobsCommand` は `@aws-sdk/client-batch` パッケージに含まれる（既存パッケージ）
- `BatchJobStatus` の値は AWS SDK の型定義を確認すること: `SUBMITTED | PENDING | RUNNABLE | STARTING | RUNNING | SUCCEEDED | FAILED`

## セキュリティ考慮事項

- `DescribeJobsCommand` には IAM 権限 `batch:DescribeJobs` が必要。Lambda (Web) の IAM ロールに追加すること
- `batchJobId` は AWS 内部 ID であるため、クライアントへのレスポンスには含めない

---

## docs/ への移行メモ

- [ ] `docs/services/quick-clip/architecture.md` に ADR として追記すること:
      - ADR-005: AWS Batch を Job 実行状態の正（Source of Truth）とするアーキテクチャ変更
        （背景: コンテナ強制終了時に DynamoDB が PROCESSING のまま残る問題、決定: DescribeJobs で常に Batch を参照、根拠: DynamoDB への書き込み責務を削減しシンプルな設計とするため）
- [ ] `docs/services/quick-clip/external-design.md` を更新すること:
      - SCR-001: 制約通知・進捗バーの追加
      - SCR-002: Stepper・有効期限・タブ閉じ通知の追加、ポーリング間隔変更
      - SCR-003: クリップ進捗・有効期限の追加
- [ ] `docs/services/quick-clip/requirements.md` を更新すること:
      - 「ファイル保持期間」の非機能要件に Highlight TTL の記述を追加
      - アップロード進捗・制約通知の機能要件を追加
