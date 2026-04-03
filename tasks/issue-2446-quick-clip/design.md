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
| POST | /api/jobs | ジョブ作成（アップロード用 URL 取得。5 GB 未満: Presigned PUT URL、5 GB 以上: マルチパートアップロード用 URL 群） | なし |
| POST | /api/jobs/{jobId}/complete-upload | マルチパートアップロード完了・Batch ジョブ投入 | なし |
| GET | /api/jobs/{jobId} | ジョブステータス取得 | なし |
| GET | /api/jobs/{jobId}/highlights | 見どころ一覧取得 | なし |
| PATCH | /api/jobs/{jobId}/highlights/{highlightId} | 見どころの採否・時間調整を更新（時間変更時は clipStatus を PENDING にリセット） | なし |
| POST | /api/jobs/{jobId}/highlights/{highlightId}/regenerate | クリップ再生成トリガー | なし |
| POST | /api/jobs/{jobId}/download | ZIP 生成・ダウンロード URL 取得（採用クリップが全件 GENERATED の場合のみ） | なし |

**GET /api/jobs/{jobId}/highlights の補足**

- レスポンスの各 Highlight に `clipStatus` と `clipUrl` (GENERATED のもののみ Presigned URL) を含める
- `sourceVideoUrl` は返却しない
- **PENDING のハイライトが 1 件以上存在する場合、全件の clip-regenerate Lambda を非同期 Invoke し clipStatus を `GENERATING` に更新する（初回ロード時の自動生成）**

**PATCH /api/jobs/{jobId}/highlights/{highlightId} の補足**

- 時間変更（startSec / endSec）がある場合:
    - clip-regenerate Lambda を非同期 Invoke（InvocationType: Event）する
    - `clipStatus` を `GENERATING` に更新して返却する（`PENDING` 経由なし）
    - `status` が `accepted` または `rejected` の場合は `unconfirmed` にリセットする
- ステータス（accepted / rejected / unconfirmed）のみの変更の場合は `clipStatus` を変更しない

**POST /api/jobs/{jobId}/highlights/{highlightId}/regenerate の補足**

- **FAILED クリップのリトライ専用エンドポイント**（通常フローでは使用しない）
- clip-regenerate Lambda を非同期 Invoke（InvocationType: Event）する
- Invoke 直後に `clipStatus` を `GENERATING` に更新し、更新後の Highlight を返却する

**POST /api/jobs/{jobId}/download の補足**

- 採用ハイライトに `PENDING` / `GENERATING` が含まれる場合は `409 Conflict` を返す
- zip-generator Lambda を同期 Invoke し、Presigned URL を返却する
- Batch submit・S3 ポーリングは行わない

---

## データモデル

### 論理モデル

```typescript
type JobStatus = 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';

type HighlightStatus = 'accepted' | 'rejected' | 'unconfirmed';

/** クリップ切り出しの生成状態 */
type ClipStatus = 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED';

type Job = {
    jobId: string; // UUID v4
    status: JobStatus;
    originalFileName: string;
    fileSize: number; // bytes
    createdAt: number; // Unix timestamp
    expiresAt: number; // Unix timestamp
    errorMessage?: string; // FAILED 時のみ
};

/** ハイライト抽出根拠 */
type HighlightSource = 'motion' | 'volume' | 'both';

type Highlight = {
    highlightId: string;
    jobId: string;
    order: number; // 開始時間昇順の連番（スコード順ではない）
    startSec: number; // 開始時刻（秒）
    endSec: number; // 終了時刻（秒）
    status: HighlightStatus; // unconfirmed: 未確認（初期値・時間調整時リセット）/ accepted: 使える / rejected: 使えない
    clipStatus: ClipStatus; // クリップ切り出し状態
    source: HighlightSource; // 抽出根拠（motion: 画面変化 / volume: 音量 / both: 両方）
    // クリップ S3 キーは outputs/{jobId}/clips/{highlightId}.mp4 として導出（DB には保存しない）
};
```

### 物理モデル

#### DynamoDB テーブル設計

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

**Highlights（Jobs テーブルに同居。シングルテーブル設計）**

| 属性 | 型 | 説明 |
|-----|----|----|
| PK | string | `JOB#{jobId}` |
| SK | string | `HIGHLIGHT#{highlightId}` |
| order | number | 開始時間昇順の連番 |
| startSec | number | 開始時刻（秒） |
| endSec | number | 終了時刻（秒） |
| status | string | accepted / rejected / unconfirmed |
| clipStatus | string | PENDING / GENERATING / GENERATED / FAILED |
| source | string | 抽出根拠: motion / volume / both |

> クリップの S3 キーは `outputs/{jobId}/clips/{highlightId}.mp4` として導出するため DynamoDB には保存しない。

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
|----------|------|
| `quick-clip/core` | ドメインモデル・リポジトリインターフェース・ジョブ管理・見どころ抽出インターフェース＆集約ロジック・クリップ分割インターフェース |
| `quick-clip/web` | UI・API Routes・ファイルアップロード・Lambda Invoke |
| `quick-clip/batch` | バッチトリガー・FFmpeg 依存の具象実装（動画解析のみ。クリップ生成は Lambda に委譲） |
| `quick-clip/lambda/clip` | clip-regenerate Lambda（FFmpeg でクリップ切り出し・S3 保存・DynamoDB 更新） |
| `quick-clip/lambda/zip` | zip-generator Lambda（S3 からクリップ収集・ZIP 組み立て・S3 保存） |

> **設計方針**: バッチは動画解析（抽出）のみに責務を絞る。クリップ生成・ZIP 作成はそれぞれ専用 Lambda に委譲し、Web API から必要に応じて Invoke する。単体テストを FFmpeg 環境なしで実行できるようにする。

### 実装モジュール一覧

**core**

| モジュール | パス | 役割 |
|----------|------|------|
| `JobRepository` | `core/src/repositories/job.repository.interface.ts` | ジョブ CRUD インターフェース |
| `HighlightRepository` | `core/src/repositories/highlight.repository.interface.ts` | 見どころ CRUD インターフェース |
| `JobService` | `core/src/libs/job.service.ts` | ジョブ作成・ステータス管理 |
| `HighlightService` | `core/src/libs/highlight.service.ts` | 見どころ更新・選別ロジック（web API から利用） |
| `HighlightExtractorService` | `core/src/libs/highlight-extractor.service.ts` | 見どころ抽出サービスの抽象インターフェース |
| `HighlightAggregationService` | `core/src/libs/highlight-aggregation.service.ts` | Motion / Volume の生スコアリストを受け取り、貪欲クリップ選択アルゴリズムで最大 20 件のハイライトを生成する |
| `ClipSplitterService` | `core/src/libs/clip-splitter.service.ts` | クリップ分割サービスの抽象インターフェース |

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
| `POST /api/jobs/[jobId]/highlights/[highlightId]/regenerate` | `web/src/app/api/jobs/[jobId]/highlights/[highlightId]/regenerate/route.ts` | クリップ再生成 API |

**batch**

| モジュール | パス | 役割 |
|----------|------|------|
| `entrypoint` | `batch/src/entrypoint.ts` | バッチトリガー。DI で各サービスを組み立てて動画解析処理を開始する（split コマンドは廃止） |
| `FfmpegVideoAnalyzer` | `batch/src/libs/ffmpeg-video-analyzer.ts` | FFmpeg を使ったフレーム差分・音量データの抽出（インフラ層）。ウィンドウ集約を行わず、閾値を超えた全フレームの生スコア `{ second: number; score: number }[]` を返す |
| `MotionHighlightService` | `batch/src/libs/motion-highlight.service.ts` | `HighlightAggregationService` に生スコアを渡す薄いアダプター。上位件数制限は行わない |
| `VolumeHighlightService` | `batch/src/libs/volume-highlight.service.ts` | `HighlightAggregationService` に生スコアを渡す薄いアダプター。上位件数制限は行わない |
| `FfmpegClipSplitter` | `batch/src/libs/ffmpeg-clip-splitter.ts` | `ClipSplitterService` の具象実装。FFmpeg でクリップを書き出す（clip-regenerate Lambda から利用） |

**lambda/clip（新規）**

| モジュール | パス | 役割 |
|----------|------|------|
| `handler` | `lambda/clip/src/handler.ts` | clip-regenerate Lambda エントリーポイント。S3 Presigned URL を FFmpeg の `-i` に渡してクリップ切り出し → S3 保存 → DynamoDB 更新 |

**lambda/zip（新規）**

| モジュール | パス | 役割 |
|----------|------|------|
| `handler` | `lambda/zip/src/handler.ts` | zip-generator Lambda エントリーポイント。S3 からクリップ並列取得 → ZIP 組み立て → S3 保存 → Presigned URL 返却 |

---

## 実装上の注意点

### 依存関係・前提条件

- FFmpeg が batch コンテナに組み込まれていること
- AWS S3・DynamoDB へのアクセス権限が付与されていること
- 認証基盤との連携は不要（匿名利用のため）

### POST /api/jobs 詳細（アップロード URL 生成）

ファイルサイズに応じてアップロード方式を切り替える。

**5 GB 未満（single PUT）:**

```ts
// レスポンス
{ jobId: string; uploadUrl: string }
```

- `PutObjectCommand` の presigned URL を生成して返す
- Batch ジョブはこの時点でサブミットする（既存フロー）

**5 GB 以上（マルチパート）:**

```ts
// レスポンス
{ jobId: string; multipart: { uploadId: string; uploadUrls: string[]; chunkSize: number } }
```

- `CreateMultipartUploadCommand` で uploadId を取得
- `chunkSize = 500 * 1024 * 1024`（500 MB）で必要パーツ数を計算
- 各パーツの `UploadPartCommand` presigned URL を生成して `uploadUrls` に格納
- Batch ジョブは **サブミットしない**（`POST /api/jobs/{jobId}/complete-upload` で行う）

### POST /api/jobs/{jobId}/complete-upload 詳細

マルチパートアップロード完了通知 + Batch ジョブ投入エンドポイント。

```ts
// リクエストボディ
{ uploadId: string; parts: { PartNumber: number; ETag: string }[] }

// 処理フロー
// 1. DynamoDB から Job を取得（PENDING 状態か確認）
// 2. CompleteMultipartUploadCommand を呼び出す
// 3. selectJobDefinition(fileSize) でティア選択して Batch ジョブをサブミット
// 4. DynamoDB の Job ステータスを PROCESSING に更新

// レスポンス: 200 OK（ボディなし）
```

### Batch Job Definition 設計

ファイルサイズに応じて3種類の Job Definition を使い分ける。ジョブ投入時に `selectJobDefinition(fileSize)` でサイズを選択し、`{prefix}-{size}` 形式のジョブ定義名を使用する。

| サイズ | 対象ファイルサイズ | vCPU | メモリ | タイムアウト | エフェメラルストレージ |
|-------|----------------|------|------|----------|----------------|
| small | < 1 GiB | 1 | 4 GB | 1 時間 | 20 GB（デフォルト） |
| large | 1 GiB 以上 8 GiB 未満 | 2 | 8 GB | 3 時間 | 30 GB |
| xlarge | 8 GiB 以上 | 4 | 16 GB | 8 時間 | 60 GB |

- Job Definition 名: `nagiyu-quick-clip-{env}-{size}`（例: `nagiyu-quick-clip-dev-xlarge`）
- 環境変数: `BATCH_JOB_DEFINITION_PREFIX`（プレフィックス文字列）
- S3 ダウンロードはストリーミング（`pipeline(Body as NodeJS.ReadableStream, createWriteStream())`）で行い、全量をメモリに展開しない
- `maxvCpus: 8`（xlarge 同時 2 ジョブ）

### パフォーマンス考慮事項

- 動画は S3 に直接アップロード（Lambda/Next.js を経由しない方式）
    - 5 GB 未満: presigned PUT URL（single リクエスト）
    - 5 GB 以上: マルチパートアップロード（500 MB チャンク、最大 40 パーツ/20 GB）
- アップロード上限: 20 GB
- 大容量動画の処理は AWS Batch（Fargate）で非同期実行
- Batch の S3 ダウンロードはストリーミング処理（メモリに全量展開しない）
- ファイルサイズに応じて Batch Job Definition を自動選択（small / large / xlarge の 3 段階）
- 見どころ抽出処理の目標: 30秒以内（目安）。リソース設計時に検証する
- ZIP 生成の目標: 30秒以内（目安）
- **ハイライト抽出アルゴリズム（貪欲クリップ選択）**

  `FfmpegVideoAnalyzer.analyzeMotion()` / `analyzeVolume()` はウィンドウ集約を行わず、閾値を超えた全フレームの生スコア `{ second: number; score: number }[]` をそのまま返す。

  `HighlightAggregationService` が以下の貪欲選択を実行する：

  1. Motion スコアリストと Volume スコアリストをそれぞれスコア降順にソート
  2. 両者を **交互に** 1 件ずつ取り出しながら処理する（Motion → Volume → Motion → …）
  3. 取り出した peak 時刻 `t` に対して理想クリップ `[t - 10, t + 10]` を計算
  4. 動画端でクランプ: `start = max(0, t - 10)`、`end = min(duration, t + 10)`（短くなることを許容）
  5. 採用済みクリップリストと区間が少しでも重複する場合 → 既存クリップを拡張して統合
     - `startSec = min(既存.startSec, 新.startSec)`
     - `endSec = max(既存.endSec, 新.endSec)`
     - 連鎖統合も許容（長いクリップになることを許容）
     - `source` は統合元に応じて `'motion'` / `'volume'` / `'both'` を設定
  6. 重複なし → 新規クリップとして追加
  7. 採用済みクリップ数が **20 件** に達したら終了

  最後に開始時間昇順にソートして `order` を付与する。

### セキュリティ考慮事項

- S3 バケットは非公開。動画プレビューには Presigned URL を使用
- ジョブ ID は UUID v4（128 ビット）で推測困難にする
- ユーザー認証は不要（匿名利用）。ジョブ ID を知っている人のみアクセス可能

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/quick-clip/requirements.md` に統合すること
- [ ] `docs/services/quick-clip/external-design.md` に統合すること
- [ ] `docs/services/quick-clip/architecture.md` に ADR として追記すること（見どころ抽出アルゴリズムの選定理由、クリップ生成 Lambda 分離の設計判断など）
