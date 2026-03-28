# さくっとクリップ (QuickClip) - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/quick-clip/architecture.md に ADR として抽出し、
    tasks/issue-2446-quick-clip/ ディレクトリごと削除します。

    入力: tasks/issue-2446-quick-clip/requirements.md
    次に作成するドキュメント: tasks/issue-2446-quick-clip/tasks.md
-->

## API 仕様

### ベース URL・認証

- ベース URL: `/api`
- 認証: なし（匿名利用）

### エンドポイント一覧

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| POST | /api/jobs | ジョブ作成（アップロード用 Presigned URL 取得） | なし |
| GET | /api/jobs/{jobId} | ジョブステータス取得 | なし |
| GET | /api/jobs/{jobId}/highlights | 見どころ一覧取得 | なし |
| PATCH | /api/jobs/{jobId}/highlights/{highlightId} | 見どころの採否・時間調整を更新 | なし |
| POST | /api/jobs/{jobId}/download | ダウンロード用 ZIP 生成リクエスト | なし |

---

## データモデル

### 論理モデル

```typescript
type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

type HighlightStatus = 'accepted' | 'rejected' | 'pending';

type Job = {
    jobId: string; // UUID v4
    status: JobStatus;
    originalFileName: string;
    fileSize: number; // bytes
    createdAt: number; // Unix timestamp
    expiresAt: number; // Unix timestamp
    errorMessage?: string; // FAILED 時のみ
};

type Highlight = {
    highlightId: string;
    jobId: string;
    order: number; // 抽出順
    startSec: number; // 開始時刻（秒）
    endSec: number; // 終了時刻（秒）
    status: HighlightStatus;
};
```

### 物理モデル

<!-- TODO: DynamoDB or 他のデータストアを選定する -->

#### DynamoDB テーブル設計（案）

**Jobs テーブル**

| 属性 | 型 | 説明 |
|-----|----|----|
| PK | string | `JOB#{jobId}` |
| SK | string | `JOB#{jobId}` |
| status | string | ジョブステータス |
| originalFileName | string | アップロード元ファイル名 |
| fileSize | number | ファイルサイズ（bytes） |
| createdAt | number | 作成日時（Unix timestamp） |
| expiresAt | number | TTL（Unix timestamp） |
| errorMessage | string | エラーメッセージ（FAILED 時のみ） |

**Highlights テーブル（または Jobs テーブルに同居）**

<!-- TODO: Highlights の保存先（Jobs テーブルに同居か分離か）を確認 -->

| 属性 | 型 | 説明 |
|-----|----|----|
| PK | string | `JOB#{jobId}` |
| SK | string | `HIGHLIGHT#{highlightId}` |
| order | number | 抽出順 |
| startSec | number | 開始時刻（秒） |
| endSec | number | 終了時刻（秒） |
| status | string | accepted / rejected / pending |

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
|----------|------|
| `quick-clip/core` | 見どころ抽出ロジック・ジョブ管理・リポジトリインターフェース |
| `quick-clip/web` | UI・API Routes・ファイルアップロード |
| `quick-clip/batch` | 動画処理・見どころ抽出・クリップ分割（FFmpeg） |

### 実装モジュール一覧

**core**

| モジュール | パス | 役割 |
|----------|------|------|
| `IJobRepository` | `core/src/repositories/job.repository.ts` | ジョブCRUDインターフェース |
| `IHighlightRepository` | `core/src/repositories/highlight.repository.ts` | 見どころCRUDインターフェース |
| `JobService` | `core/src/libs/job.service.ts` | ジョブ作成・ステータス管理 |
| `HighlightService` | `core/src/libs/highlight.service.ts` | 見どころ更新・選別ロジック |

**web**

| モジュール | パス | 役割 |
|----------|------|------|
| `UploadPage` | `web/src/app/page.tsx` | アップロード画面 |
| `JobPage` | `web/src/app/jobs/[jobId]/page.tsx` | 処理中画面 |
| `HighlightsPage` | `web/src/app/jobs/[jobId]/highlights/page.tsx` | 見どころ確認画面 |
| `POST /api/jobs` | `web/src/app/api/jobs/route.ts` | ジョブ作成 API |
| `GET /api/jobs/[jobId]` | `web/src/app/api/jobs/[jobId]/route.ts` | ジョブ取得 API |
| `GET /api/jobs/[jobId]/highlights` | `web/src/app/api/jobs/[jobId]/highlights/route.ts` | 見どころ一覧 API |
| `PATCH /api/jobs/[jobId]/highlights/[highlightId]` | `web/src/app/api/jobs/[jobId]/highlights/[highlightId]/route.ts` | 見どころ更新 API |

**batch**

| モジュール | パス | 役割 |
|----------|------|------|
| `highlight-extractor` | `batch/src/highlight-extractor.ts` | メインエントリーポイント（各具象サービスを呼び出して結果を統合） |
| `IHighlightExtractorService` | `batch/src/libs/highlight-extractor.service.ts` | 見どころ抽出サービスの抽象インターフェース |
| `MotionHighlightService` | `batch/src/libs/motion-highlight.service.ts` | 変化量（フレーム差分）で上位10件を抽出する具象実装 |
| `VolumeHighlightService` | `batch/src/libs/volume-highlight.service.ts` | 音量で上位10件を抽出する具象実装 |
| `ClipExporter` | `batch/src/libs/clip-exporter.ts` | 採用された見どころの分割書き出し |

---

## 実装上の注意点

### 依存関係・前提条件

- FFmpeg が batch コンテナに組み込まれていること
- AWS S3・DynamoDB へのアクセス権限が付与されていること
- 認証基盤との連携は不要（匿名利用のため）

### パフォーマンス考慮事項

- 動画は S3 に直接アップロード（Lambda/Next.js を経由しない Presigned URL 方式）
- 大容量動画の処理は AWS Batch（Fargate）で非同期実行
- 見どころ抽出処理の目標: 30秒以内（目安）。リソース設計時に検証する
- ZIP 生成の目標: 30秒以内（目安）

### セキュリティ考慮事項

- S3 バケットは非公開。動画プレビューには Presigned URL を使用
- ジョブ ID は UUID v4（128 ビット）で推測困難にする
- ユーザー認証は不要（匿名利用）。ジョブ ID を知っている人のみアクセス可能

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/quick-clip/requirements.md` に統合すること
- [ ] `docs/services/quick-clip/external-design.md` に統合すること
- [ ] `docs/services/quick-clip/architecture.md` に ADR として追記すること（見どころ抽出アルゴリズムの選定理由など）
