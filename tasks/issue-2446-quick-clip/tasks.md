# さくっとクリップ (QuickClip) - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2446-quick-clip/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2446-quick-clip/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2446-quick-clip/external-design.md — 画面設計・概念データモデル
    - tasks/issue-2446-quick-clip/design.md — API 仕様・データモデル・コンポーネント設計
-->

## Phase 1: 基盤整備

<!-- サービス骨格・インフラ・共通設定のセットアップ -->

- [x] サービスディレクトリ構成の作成（`services/quick-clip/{core,web,batch}`）（依存: なし）
- [x] モノレポへのワークスペース追加（ルート `package.json` の `workspaces` に追加）（依存: 上記）
- [x] `core` パッケージ初期設定（`tsconfig`・`jest` 設定・`package.json`）（依存: 上記）
- [x] `web` パッケージ初期設定（Next.js アプリ骨格・`tsconfig`・`package.json`）（依存: 上記）
- [x] `batch` パッケージ初期設定（`tsconfig`・`jest` 設定・`package.json`・Dockerfile）（依存: 上記）
- [x] AWS インフラ構成（S3・DynamoDB・Batch・CloudFront）（依存: なし）
- [x] CI/CD パイプラインの設定（依存: 上記）

## Phase 2: UI PoC（外観調整・要件確認）

<!--
    全画面と PoC 用 API Routes を実装し、見た目を確認・調整する。
    このフェーズが完了したら要件を再 Fix してから Phase 3 以降に進む。

    UI は実 API エンドポイントをそのまま呼び出す。
    PoC データ（ハードコード）は API Route ハンドラー側に置き、必ず TODO コメントを残すこと:
    // TODO(PoC): ハードコードデータ。Phase 5 の本実装時に DynamoDB 実装に差し替える
-->

- [x] PoC 用 API Routes 実装（ハードコードデータを返す。`TODO(PoC)` コメントを各ハンドラーに付与）（依存: Phase 1）
- [x] アップロード画面（SCR-001: `web/src/app/page.tsx`）PoC 実装（依存: 上記）
- [x] 処理中画面（SCR-002: `web/src/app/jobs/[jobId]/page.tsx`）PoC 実装（依存: 上記）
- [x] 見どころ確認画面（SCR-003: `web/src/app/jobs/[jobId]/highlights/page.tsx`）PoC 実装（依存: 上記）
- [x] **要件再確認・Fix**（外観を確認しながら追加要件を洗い出し、`requirements.md` / `external-design.md` を更新する）（依存: 上記全て）

> **PoC での API 通信方針**: UI は実 API エンドポイントをそのまま呼び出す。PoC データはサーバー側（API Route ハンドラー）でハードコードし、`TODO(PoC)` コメントを付与しておく。Phase 5 の本実装時に DynamoDB 実装へ差し替える。

## Phase 3: core 実装（ドメインロジック・インターフェース）

<!-- ビジネスロジックの実装。FFmpeg 非依存のため単体テストが容易 -->

- [x] `JobRepository` インターフェース定義（`core/src/repositories/job.repository.interface.ts`）（依存: Phase 2 要件 Fix）
- [x] `HighlightRepository` インターフェース定義（`core/src/repositories/highlight.repository.interface.ts`）（依存: Phase 2 要件 Fix）
- [x] `HighlightExtractorService` インターフェース定義（`core/src/libs/highlight-extractor.service.ts`）（依存: Phase 2 要件 Fix）
- [x] `ClipSplitterService` インターフェース定義（`core/src/libs/clip-splitter.service.ts`）（依存: Phase 2 要件 Fix）
- [x] `JobService` 実装（`core/src/libs/job.service.ts`）（依存: `JobRepository`）
- [x] `HighlightService` 実装（`core/src/libs/highlight.service.ts`）（依存: `HighlightRepository`）
- [x] `HighlightAggregationService` 実装（`core/src/libs/highlight-aggregation.service.ts`）（依存: `HighlightExtractorService`）
- [x] core ユニットテスト（カバレッジ 80% 以上）（依存: 上記全て）

## Phase 4: batch 実装（FFmpeg 依存の具象実装）

<!-- FFmpeg を使った動画解析・クリップ書き出し。I/O に特化したトリガー層 -->

- [x] `FfmpegVideoAnalyzer` 実装（`batch/src/libs/ffmpeg-video-analyzer.ts`）（依存: Phase 1）
- [x] `MotionHighlightService` 実装（`batch/src/libs/motion-highlight.service.ts`）（依存: `FfmpegVideoAnalyzer`）
- [x] `VolumeHighlightService` 実装（`batch/src/libs/volume-highlight.service.ts`）（依存: `FfmpegVideoAnalyzer`）
- [x] `FfmpegClipSplitter` 実装（`batch/src/libs/ffmpeg-clip-splitter.ts`）（依存: Phase 1）
- [x] DynamoDB `JobRepository` 実装（`batch/src/repositories/dynamodb-job.repository.ts`）（依存: Phase 3）
- [x] DynamoDB `HighlightRepository` 実装（`batch/src/repositories/dynamodb-highlight.repository.ts`）（依存: Phase 3）
- [x] `entrypoint` 実装（`batch/src/entrypoint.ts`）（依存: 上記全て）

## Phase 5: API Routes 本実装

<!-- Next.js API Routes の PoC 実装を DynamoDB 実装に差し替える。TODO(PoC) コメントをすべて解消する -->

- [x] DynamoDB `JobRepository` 実装（`web/src/repositories/dynamodb-job.repository.ts`）（依存: Phase 3）
- [x] DynamoDB `HighlightRepository` 実装（`web/src/repositories/dynamodb-highlight.repository.ts`）（依存: Phase 3）
- [x] `POST /api/jobs`（Presigned URL 生成・ジョブ作成）の `TODO(PoC)` を本実装に差し替え（依存: Phase 3）
- [x] `GET /api/jobs/[jobId]`（ジョブステータス取得）の `TODO(PoC)` を本実装に差し替え（依存: Phase 3）
- [x] `GET /api/jobs/[jobId]/highlights`（見どころ一覧取得）の `TODO(PoC)` を本実装に差し替え（依存: Phase 3）
- [x] `PATCH /api/jobs/[jobId]/highlights/[highlightId]`（採否・時間更新）の `TODO(PoC)` を本実装に差し替え（依存: Phase 3）
- [x] `POST /api/jobs/[jobId]/download`（ZIP 生成リクエスト・ダウンロード URL 取得）の `TODO(PoC)` を本実装に差し替え（依存: Phase 3）
- [x] API Routes 内に `TODO(PoC)` コメントが残っていないことを確認

## Phase 6: 結合確認・E2E テスト

<!-- Phase 5 の本実装後に UI + 実 API の結合動作を確認し、E2E テストを作成する -->

- [x] 全画面で実 API（DynamoDB）との結合動作を確認
- [x] `TODO(PoC)` コメントがリポジトリ内に残っていないことを確認
- [x] E2E テスト作成（依存: 上記全て）

## Phase 7: アーキテクチャ修正

<!--
    Phase 6 完了後に判明した不備（プレビュー・ダウンロード・ハイライト数）を解消するためのアーキテクチャ修正。
    設計方針:
    - Batch は動画解析のみ（split コマンド廃止）
    - クリップ生成は clip-regenerate Lambda に委譲（Web から非同期 Invoke）
    - ZIP 生成は zip-generator Lambda に委譲（Web から同期 Invoke）
    - clipStatus (PENDING/GENERATING/GENERATED/FAILED) で生成状態を管理
    - クリップ S3 キーは outputs/{jobId}/clips/{highlightId}.mp4 として導出（DynamoDB に保存しない）
-->

### 7-1. 仕様更新（依存: なし）

- [x] `requirements.md` 更新（プレビュー方式・ダウンロード方式・ハイライト数）
- [x] `external-design.md` 更新（SCR-003 プレビュー・ダウンロード・GENERATING 状態）
- [x] `design.md` 更新（データモデル・API レスポンス・コンポーネント構成）
- [x] `requirements.md` / `external-design.md` のドメインオブジェクト定義に `clipStatus` を反映（仕様整合）

### 7-2. データモデル修正（依存: 7-1）

- [x] `Highlight` 型に `clipStatus: 'PENDING' | 'GENERATING' | 'GENERATED' | 'FAILED'` 追加（`core/src/types.ts`）
- [x] `DynamoDBHighlightRepository` の save / find に `clipStatus` を反映（`core/src/repositories/dynamodb-highlight.repository.ts`）
- [x] ユニットテスト更新

### 7-3. Batch 修正（依存: 7-2）

- [x] `QuickClipBatchRunner.extract()` の末尾からクリップ生成処理を除去し、全ハイライトの `clipStatus='PENDING'` 保存のみに変更（`core/src/libs/quick-clip-batch-runner.ts`）
- [x] バッチの "split" コマンドを廃止（`batch/src/entrypoint.ts` から削除）
- [x] テスト更新

### 7-4. 新規 Lambda 実装（依存: 7-2）

**clip-regenerate Lambda（FFmpeg 必要）**

- [ ] 新規パッケージ作成（`services/quick-clip/lambda/clip/`）
- [x] 新規パッケージ作成（`services/quick-clip/lambda/clip/`）
  - 入力: `{ jobId, highlightId, startSec, endSec }`
  - S3 から元動画取得 → FFmpeg でクリップ切り出し → S3 保存（`outputs/{jobId}/clips/{highlightId}.mp4`）→ DynamoDB の `clipStatus='GENERATED'` 更新
  - エラー時は `clipStatus='FAILED'` に更新
  - FFmpeg はコンテナイメージに同梱（Batch と同方針）
- [ ] インフラ（Lambda 関数・ECR リポジトリ・IAM 権限）を CDK で追加（`infra/quick-clip/`）
- [x] インフラ（Lambda 関数・ECR リポジトリ・IAM 権限）を CDK で追加（`infra/quick-clip/`）
- [x] テスト作成

**zip-generator Lambda（FFmpeg 不要）**

- [ ] 新規パッケージ作成（`services/quick-clip/lambda/zip/`）
- [x] 新規パッケージ作成（`services/quick-clip/lambda/zip/`）
  - 入力: `{ jobId, highlightIds: string[] }`
  - S3 から clip ファイルを並列取得 → メモリ上で ZIP 組み立て → S3 保存（`outputs/{jobId}/clips.zip`）→ Presigned URL 返却
- [ ] インフラ（Lambda 関数・IAM 権限・タイムアウト設定）を CDK で追加（`infra/quick-clip/`）
- [x] インフラ（Lambda 関数・IAM 権限・タイムアウト設定）を CDK で追加（`infra/quick-clip/`）
- [x] テスト作成

### 7-5. Web API 修正（依存: 7-4）

- [x] `GET /api/jobs/[jobId]/highlights`（`web/src/app/api/jobs/[jobId]/highlights/route.ts`）
  - `sourceVideoUrl` の返却を廃止
  - `clipStatus='PENDING'` のハイライトに対し clip-regenerate Lambda を非同期 Invoke
  - Invoke 直後に `clipStatus='GENERATING'` に更新
  - 各 Highlight に `clipUrl`（`GENERATED` のもののみ Presigned URL）を追加して返却
- [x] `PATCH /api/jobs/[jobId]/highlights/[highlightId]`（`web/src/app/api/jobs/[jobId]/highlights/[highlightId]/route.ts`）
  - 時間変更（startSec / endSec）がある場合、DynamoDB 更新後に clip-regenerate Lambda を非同期 Invoke
  - Invoke 直後に `clipStatus='GENERATING'` で返却
- [x] `POST /api/jobs/[jobId]/download`（`web/src/app/api/jobs/[jobId]/download/route.ts`）
  - accepted ハイライトに `PENDING` / `GENERATING` が含まれる場合は `409 Conflict` を返す
  - Batch Submit・S3 ポーリングを廃止
  - zip-generator Lambda を同期 Invoke → Presigned URL を返却
- [x] ユニットテスト更新

### 7-6. ハイライト確認画面修正（依存: 7-5）

- [x] `jobs/[jobId]/highlights/page.tsx`
  - `sourceVideoUrl` 参照を廃止
  - `GENERATING` / `PENDING` 状態の行はローディングインジケーターを表示
  - `PENDING` / `GENERATING` のハイライトが存在する間、GET /highlights を数秒おきにポーリング
  - `GENERATED` になったら `clipUrl` で `<video>` を直接再生（シーク・timeupdate ロジックを削除）
  - 時間調整後は該当行が `GENERATING` → `GENERATED` に遷移するまでローディング表示
  - 採用クリップに `GENERATED` 以外が含まれる場合はダウンロードボタンを無効化

### 7-7. clip-regenerate Lambda OOM 修正（依存: 7-4）

<!--
    本番で Runtime.OutOfMemory が発生。調査の結果、Lambda の /tmp は tmpfs (メモリ内 FS) であることが判明。
    ソース動画を /tmp に書くとそのサイズ分の Lambda メモリを消費する。
    ストリーミング修正 (pipeline) では書き込み速度が上がり OOM がむしろ早まった (32s → 13s)。
    根本解決: ソース動画を Lambda に一切書かず、S3 Presigned URL を ffmpeg の -i に直接渡す。
    ffmpeg は HTTP Range Request で必要区間のみ取得するためメモリを消費しない。
-->

- [x] `services/quick-clip/lambda/clip/src/handler.ts`
  - `downloadSourceVideo` 関数・`VIDEO_INPUT_PATH` 定数を廃止
  - `getPresignedVideoUrl(s3Client, bucketName, jobId): Promise<string>` を追加（`getSignedUrl` from `@aws-sdk/s3-request-presigner`、有効期限 3600 秒）
  - `splitClip` の第 1 引数を `inputPath` → `inputUrl` に変更（ffmpeg の `-i` に URL を渡す、内部ロジックは変更なし）
  - `handler` 内の `localInputPath` を削除し、presigned URL を `splitClip` に渡す
  - `finally` の `rm` 対象を `dirname(localOutputPath)` のみに変更（input ディレクトリがなくなるため）
- [x] `services/quick-clip/lambda/clip/package.json`
  - `@aws-sdk/s3-request-presigner: ^3.1010.0` を追加
- [x] `services/quick-clip/lambda/clip/tests/unit/handler.test.ts`
  - `mockPipeline`・`mockCreateWriteStream` を削除
  - `mockGetSignedUrl` を追加（`jest.mock('@aws-sdk/s3-request-presigner')`）
  - `GetObjectCommand` の `Body` モックを削除（send は presignedURL 取得時に内部で使われるだけ）
- [x] `tasks/issue-2446-quick-clip/design.md`
  - `lambda/clip` の handler 役割説明を「S3 Presigned URL を ffmpeg の `-i` に渡しクリップ切り出し → S3 保存 → DynamoDB 更新」に更新

## Phase 8: パフォーマンス改善・UX 改善

<!--
    仕様相談を経て追加された改善項目。
    - Batch OOM 根本対応（ストリーミング化）とサイズ別 Job Definition 切り替え
    - 再生成ボタン導入（Lambda の手動トリガー化）
    - ハイライト抽出根拠（motion / volume / both）の表示
    - ハイライト表示順を開始時間順に変更
-->

### 8-1. 仕様更新（依存: なし）

#### requirements.md

- [x] 非機能要件に Batch パフォーマンス要件を追記
  - 4GB 超の動画を処理可能なこと
  - ファイルサイズに応じて Batch リソースを自動選択すること（< 1GB: small、≥ 1GB: large）
- [x] 機能要件に再生成ボタン仕様を追記
  - クリップの再生成はユーザーが明示的に再生成ボタンを押下した場合のみ実行されること
  - 時間範囲を変更しただけでは自動再生成されないこと
- [x] 機能要件にハイライト抽出根拠の表示を追記
  - 各ハイライトが motion（画面変化）・volume（音量）・both（両方）のどれで検出されたかを表示すること
- [x] 機能要件にハイライト表示順を追記
  - ハイライトは動画内の開始時間の昇順で表示すること

#### external-design.md

- [x] SCR-003（見どころ確認画面）のテーブル列定義を更新
  - 「根拠」列を追加（モーション / 音量 / 両方 のチップ表示）
  - ハイライトは開始時間昇順で表示される旨を明記
- [x] SCR-003 に再生成ボタンの仕様を追記
  - 各ハイライト行に「再生成」ボタンを配置
  - clipStatus が `GENERATED` のとき: ボタン非活性（グレー）
  - clipStatus が `GENERATING` のとき: ローディング表示（非活性）
  - clipStatus が `PENDING` または `FAILED` のとき: ボタン活性
  - 時間範囲を変更すると clipStatus が `PENDING` にリセットされ、ボタンが活性化する
  - ボタン押下でのみクリップ再生成が開始される（時間変更だけでは再生成されない）
  - 行を選択中に時間範囲を変更すると選択が解除される

#### design.md

- [x] API 一覧テーブルを更新
  - `GET /api/jobs/{jobId}/highlights` の説明を「見どころ一覧取得」に変更（クリップ生成トリガーの記述を削除）
  - `PATCH /api/jobs/{jobId}/highlights/{highlightId}` の説明を「見どころの採否・時間調整を更新（時間変更時は clipStatus を PENDING にリセット）」に変更
  - `POST /api/jobs/{jobId}/highlights/{highlightId}/regenerate` を追加（「クリップ再生成トリガー」）
- [x] `GET /api/jobs/{jobId}/highlights` の補足を更新
  - 「PENDING のハイライトに対し clip-regenerate Lambda を非同期 Invoke し GENERATING に更新」の記述を削除
  - clipUrl（GENERATED のもののみ Presigned URL）を返すことのみ記載
- [x] `PATCH /api/jobs/{jobId}/highlights/{highlightId}` の補足を追記
  - 時間変更（startSec / endSec）がある場合、clipStatus を `PENDING` にリセットして返却する（Lambda は呼び出さない）
- [x] `POST /api/jobs/{jobId}/highlights/{highlightId}/regenerate` の補足を追記
  - clip-regenerate Lambda を非同期 Invoke し、clipStatus を `GENERATING` に更新して返却する
- [x] `Highlight` 型に `source` フィールドを追加
  ```typescript
  type HighlightSource = 'motion' | 'volume' | 'both';

  type Highlight = {
      // ...既存フィールド...
      source: HighlightSource; // 抽出根拠（motion: 画面変化 / volume: 音量 / both: 両方）
  };
  ```
  - `order` フィールドの説明を「開始時間昇順の連番（スコア順ではない）」に変更
- [x] DynamoDB Highlights テーブルに `source` カラムを追加
  | source | string | 抽出根拠: motion / volume / both |
- [x] コンポーネント設計の web API 一覧に `POST /api/jobs/[jobId]/highlights/[highlightId]/regenerate` を追加
- [x] Batch Job Definition 設計セクションを追加（以下の内容）
  - `small`（ファイルサイズ < 1 GB）: 1 vCPU / 4 GB メモリ / タイムアウト 1 時間
  - `large`（ファイルサイズ ≥ 1 GB）: 2 vCPU / 8 GB メモリ / タイムアウト 3 時間
  - Job Definition 名: `nagiyu-quick-clip-{env}-{size}`（例: `nagiyu-quick-clip-dev-large`）
  - 環境変数: `BATCH_JOB_DEFINITION_ARN`（単一）→ `BATCH_JOB_DEFINITION_PREFIX`（プレフィックス）に変更
  - ジョブ投入時に `selectJobDefinition(fileSize)` でサイズを選択し `{prefix}-{size}` を指定
- [x] パフォーマンス考慮事項を更新
  - S3 ダウンロードはストリーミング（`pipeline`）で行いメモリに全量展開しないこと
  - ファイルサイズに応じて Batch Job Definition を選択すること（閾値 1 GB）
  - `HighlightAggregationService` はオーバーラップする motion / volume 結果を1件にマージすること（時間範囲はユニオン、スコアは最大値、source は `'both'`）
  - ハイライトは上位 20 件をスコアで選出後、開始時間昇順に並び替えてから `order` を付与すること

### 8-2. Batch パフォーマンス改善（依存: 8-1）

<!--
    4GB 動画で OutOfMemoryError (container killed) が発生。
    transformToByteArray() が全量をメモリに展開するため。
    ストリーミング化で OOM を解消し、サイズ別 Job Definition で処理速度・タイムアウトを最適化する。

    Job Definition サイズ基準:
      small (< 1GB): 1 vCPU / 4GB / 1h
      large (≥ 1GB): 2 vCPU / 8GB / 3h
-->

- [x] `services/quick-clip/core/src/libs/quick-clip-batch-runner.ts`
  - `downloadSourceVideo`: `transformToByteArray()` + `writeFile()` → `pipeline(Body as NodeJS.ReadableStream, createWriteStream())` に変更（Clip Lambda と同パターン）
- [x] `services/quick-clip/core/src/libs/job-definition-selector.ts`（新規）
  - `selectJobDefinition(fileSize: number): 'small' | 'large'`（閾値: 1 GB）
- [x] `services/quick-clip/core/src/index.ts`
  - `selectJobDefinition` / `JobDefinitionSize` をエクスポート追加
- [x] `infra/quick-clip/lib/batch-stack.ts`
  - 単一 Job Definition → `small` / `large` の2種定義
  - `maxvCpus`: 4 → 8
  - `jobDefinitionArn` → `jobDefinitionPrefix: string` + `jobDefinitionArns: string[]` をエクスポート
- [x] `infra/quick-clip/lib/lambda-stack.ts`
  - `batchJobDefinitionArn` prop → `batchJobDefinitionPrefix` + `batchJobDefinitionArns` に変更
  - 環境変数: `BATCH_JOB_DEFINITION_ARN` → `BATCH_JOB_DEFINITION_PREFIX`
  - IAM: 全 Job Definition ARN を `batch:SubmitJob` の `resources` に追加
- [x] `infra/quick-clip/bin/quick-clip.ts`
  - `BatchStack` → `LambdaStack` への接続を新 prop に対応
- [x] `services/quick-clip/web/src/lib/server/aws.ts`
  - `getBatchJobDefinitionArn` → `getBatchJobDefinitionPrefix` に変更
- [x] `services/quick-clip/web/src/app/api/jobs/route.ts`
  - `selectJobDefinition(body.fileSize)` でサイズを選択し `${prefix}-${size}` を `jobDefinition` に指定
- [x] テスト更新（`quick-clip-batch-runner.test.ts`: S3 Body モックを Readable stream に変更）
- [x] テスト追加（`job-definition-selector.test.ts`）

### 8-3. ハイライト抽出根拠・ソート改善（依存: 8-1）

<!--
    各ハイライトが motion / volume / both のどれで検出されたかを UI に表示する。
    同じ時間帯が両方で検出された場合は1件にマージして source='both' とする。
    表示順を開始時間昇順に変更する（現状はスコア降順）。
-->

- [x] `services/quick-clip/core/src/libs/highlight-extractor.service.ts`
  - `source: string` → `source: 'motion' | 'volume' | 'both'`（`HighlightSource` 型として export）
- [x] `services/quick-clip/core/src/libs/highlight-aggregation.service.ts`
  - `aggregate()` にオーバーラップマージロジックを追加（時間帯がオーバーラップする motion/volume 結果を1件に統合: 時間はユニオン・スコアは最大値・`source='both'`）
- [x] `services/quick-clip/core/src/types.ts`
  - `Highlight` 型に `source: HighlightSource` を追加
- [x] `services/quick-clip/core/src/libs/quick-clip-batch-runner.ts`
  - `buildHighlights()`: `extracted` を `startSec` 昇順で再ソートしてから `order` を割り当て（`source` フィールドも保持）
- [x] `services/quick-clip/core/src/repositories/dynamodb-highlight.repository.ts`
  - `HighlightItem` 型・`createMany()` の UpdateExpression・`mapToEntity()` に `source` を追加
- [x] `services/quick-clip/web/src/app/jobs/[jobId]/highlights/page.tsx`
  - テーブルに「根拠」列を追加（`motion` → モーション / `volume` → 音量 / `both` → 両方 のチップ表示）
- [x] テスト更新・追加（aggregation マージロジック・batch-runner の source 保持・ソート順）

### 8-4. 再生成ボタン実装（依存: 8-1）

<!--
    時間調整のたびに Lambda が発火するため編集しにくい問題を解消する。
    再生成ボタン押下時のみ Lambda を発火させる。

    既存実装で対応済みの要件:
    - 未再生成クリップの行選択不可（clipStatus !== GENERATED → onClick 無効、既実装）
    - ZIP ボタン制御（hasUngeneratedAcceptedClip で disabled 制御済み）
-->

- [x] `services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/route.ts`（GET）
  - PENDING クリップへの自動 Lambda 発火・`GENERATING` 更新を削除（一覧返却のみ）
- [x] `services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/[highlightId]/route.ts`（PATCH）
  - 時間変更時: Lambda 発火を削除し `clipStatus: 'PENDING'` リセットのみに変更
- [x] `services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/[highlightId]/regenerate/route.ts`（新規: POST）
  - clip-regenerate Lambda を非同期 Invoke → `clipStatus='GENERATING'` に更新 → 更新後ハイライトを返却
- [x] `services/quick-clip/web/src/app/jobs/[jobId]/highlights/page.tsx`
  - 再生成ボタンを各行に追加（PENDING/FAILED → 活性、GENERATING → ローディング、GENERATED → 非活性）
  - `onRegenerate` ハンドラー追加（POST `.../regenerate` を呼び出し）
  - `onUpdateRange`: 対象ハイライトが選択中の場合 `setSelectedId(null)` で即時選択解除
  - ポーリング条件: `hasPendingOrGenerating` → `hasGenerating`（GENERATING のみポーリング）
- [x] テスト更新（GET / PATCH の挙動変更）
- [x] テスト追加（`regenerate/route.test.ts`）

### 8-5. 時刻入力 UX 改善（依存: 8-4）

<!--
    現状: onChange のたびに onUpdateRange が呼ばれ PATCH が毎キーストローク発火する。
    その結果、入力がもっさりし、中間値（startSec >= endSec が一時的に成立する状態）で
    クライアントバリデーションが失敗して早期 return されるため末尾の数字が削除できない。

    方針: ローカル draft state + onBlur でコミットするパターン（React Hook Form の mode:'onBlur' と同思想）。
    小さな TimeInput コンポーネントを切り出し、blur 時のみバリデーション・API 呼び出しを行う。
    onCommit が throw した場合（range 違反・API エラー共通）、TimeInput 側で draft を元の value にリセットする。
-->

- [x] `services/quick-clip/web/src/app/jobs/[jobId]/highlights/page.tsx`
    - `HighlightsPage` の上に `TimeInput` コンポーネントを追加（同ファイル内に定義）
        - props: `value: number`・`min?: number`（デフォルト 0）・`onCommit: (value: number) => Promise<void>`
        - `useState(String(value))` でローカル draft state を管理
        - `useEffect([value])` で `value` prop 変化時に draft を同期（他フィールド更新後のずれ防止）
        - `onChange`: `setDraft(e.target.value)` のみ（API 呼び出しなし）
        - `onBlur`: `Number(draft)` を parse し、`!Number.isFinite(parsed) || parsed < min` なら `setDraft(String(value))` で revert して return。それ以外は `await onCommit(parsed)` を try/catch し、catch では `setDraft(String(value))` で revert
        - レンダリングは既存と同じ `<TextField size="small" type="number" ...>` を返す
    - `ERROR_MESSAGES` に `RANGE_INVALID: '開始時刻は終了時刻より小さくしてください'` を追加
      （現在は startSec >= endSec 時に silent return しておりユーザーへのフィードバックがない）
    - `onUpdateRange` を変更
        - 引数 `value: string` → `value: number` に変更（NaN チェックは `TimeInput` 側に移管済み）
        - `Number.isNaN` チェック・早期 return を削除
        - `startSec >= endSec` 時: `setErrorMessage(ERROR_MESSAGES.RANGE_INVALID)` してから `throw new Error(...)` する
          （`TimeInput` の catch が draft を revert するため API は呼ばれない）
        - `updateHighlight` の catch ブロック: `setErrorMessage(ERROR_MESSAGES.UPDATE_FAILED)` してから `throw` で re-throw する
          （`TimeInput` の catch が draft を revert する）
        - 成功時: `setErrorMessage(null)` は維持
    - startSec の `<TextField>` を `<TimeInput value={highlight.startSec} min={0} onCommit={(v) => onUpdateRange(highlight, 'startSec', v)} />` に置き換え
    - endSec の `<TextField>` を `<TimeInput value={highlight.endSec} min={1} onCommit={(v) => onUpdateRange(highlight, 'endSec', v)} />` に置き換え

### 8-6. プレビューリクエスト重複防止（依存: 8-4）

<!--
    現状: <video key={selectedHighlight?.highlightId}> は selectedId 変化のたびに video 要素を
    アンマウント → 再マウントし、ブラウザが clipUrl へのネットワークリクエストを新たに開始する。
    行を短時間で連続してクリックすると、クリックごとにリクエストが重複して発生する。

    方針: setSelectedId を 200ms デバウンスする。
    最後のクリックから 200ms 経過して初めて selectedId を更新することで、
    連続クリック時のビデオリクエストを1回に絞る。
    200ms は通常のクリックでは視覚的に気にならないレベル。
-->

- [x] `services/quick-clip/web/src/app/jobs/[jobId]/highlights/page.tsx`
    - `selectionTimeoutRef = useRef<number | null>(null)` を追加（`isFetchingRef` の隣）
    - `onSelectHighlight(highlightId: string)` 関数を追加
        - `selectionTimeoutRef.current !== null` なら `window.clearTimeout(selectionTimeoutRef.current)`
        - `window.setTimeout(() => { setSelectedId(highlightId); selectionTimeoutRef.current = null; }, 200)` の戻り値を `selectionTimeoutRef.current` に代入
    - アンマウント時クリーンアップ用 `useEffect`（依存配列 `[]`）を追加
        - cleanup 関数で `selectionTimeoutRef.current !== null` なら `window.clearTimeout(selectionTimeoutRef.current)`
    - TableRow の `onClick` 内の `setSelectedId(highlight.highlightId)` を `onSelectHighlight(highlight.highlightId)` に変更

### 8-7. 再生成中の選択・プレビューバグ修正（依存: 8-4, 8-6）

<!--
    症状: クリップ再生成中に別のクリップを選択しようとすると、プレビューが壊れ選択も効かなくなる。

    原因 1: onRegenerate が selectedId を更新しない
        onUpdateRange は完了後に setSelectedId(null) を呼ぶが、onRegenerate には対応する処理がない。
        → 再生成対象クリップが選択中の場合、clipUrl が undefined になった後も selectedId が残り、
          プレビューが即座に壊れる。次のポーリング（最大 3 秒後）まで壊れたまま。

    原因 2: 200ms デバウンス（8-6）がポーリングの自動選択と干渉する
        selectedId = A（GENERATING）の状態でユーザーが B をクリックすると:
        1. onSelectHighlight(B) → 200ms デバウンス開始（selectedId はまだ A）
        2. デバウンス中にポーリングが走る
           → setSelectedId callback: current=A(GENERATING) → 最初のGENERATED(C) に飛ぶ
        3. デバウンス発火 → setSelectedId(B) → ようやく B が選択される
        ユーザーは 200ms の間 C が表示されるのを見て「クリックが効いていない」と誤解し
        再クリックする → デバウンスがリセット → また 200ms 待ち → 悪循環。

    修正方針:
        Fix 1: onRegenerate に selectedId 即時解除を追加（onUpdateRange と対称化）
        Fix 2: 8-6 のデバウンスを廃止し、選択を即時反映する
            廃止理由: デバウンス中のポーリング干渉による UX 混乱の方が、
            rapid クリック時の video リクエスト重複（ブラウザが abort する）より問題が大きい。
-->

- [x] `services/quick-clip/web/src/app/jobs/[jobId]/highlights/page.tsx`
    - `onRegenerate` の `setHighlights` 呼び出しの直後に選択解除を追加:
        ```typescript
        setSelectedId((current) =>
          current === highlight.highlightId ? null : current
        );
        ```
    - `selectionTimeoutRef` の `useRef` 行を削除（`isFetchingRef` の隣）
    - アンマウント時クリーンアップ用 `useEffect`（`selectionTimeoutRef.current` を `clearTimeout` するもの）を削除
    - `onSelectHighlight` 関数を削除
    - TableRow の `onClick` を `onSelectHighlight` から直接 `setSelectedId` に戻す:
        ```typescript
        onClick={() => {
          if (highlight.clipStatus === 'GENERATED') {
            setSelectedId(highlight.highlightId);
          }
        }}
        ```
- [x] `services/quick-clip/web/tests/unit/app/jobs/highlights-page.test.tsx`
    - 「GENERATED 行クリック時は 200ms 後に選択を反映する」テストを修正（デバウンスなしの即時反映に変更）
    - `onRegenerate` 後に選択中クリップの `selectedId` が null になることを確認するテストを追加

## Phase 9: highlights state の設計見直し（clipUrl の分離）

<!--
    8-7 の修正（onRegenerate での selectedId 解除・デバウンス廃止）を適用後も、
    再生成中に GENERATED クリップを選択するとプレビューが 3 秒ごとに開閉してロードが終わらない症状が残った。

    根本原因:
        fetchHighlights が setHighlights(data.highlights) でハイライト配列を全置換しており、
        GET /api/highlights が毎回 getSignedUrl を呼び出して新しい署名付き URL を生成するため、
        S3 オブジェクトが変わっていなくても URL 文字列がポーリングのたびに変わる。
        → selectedHighlight.clipUrl が 3 秒ごとに変化 → video src が更新 → ブラウザが動画を再ロード → 無限ループ。

    本質的な問題:
        highlights: Array<Highlight & { clipUrl?: string }> という型が、
        エンティティデータ（ステータス・時間範囲）と派生データ（S3 URL）を混在させている。
        ポーリングで状態を更新すると URL も一緒に上書きされる。

    修正方針:
        highlights（ステータスデータ）と clipUrls（URL レジストリ）を分離する。
        - highlights はポーリングで自由に全置換可
        - clipUrls は clipStatus が GENERATED に遷移したときのみ更新
        → video src はポーリングで変化しなくなる
-->

- [ ] `services/quick-clip/web/src/app/jobs/[jobId]/highlights/page.tsx`
    - `highlights` の state 型を `Highlight[]` に変更（`clipUrl` は持たない）
        - `HighlightsResponse` 型（API レスポンスの parse 用）は変更しない。`clipUrl` は引き続きレスポンスに含まれるが、state には格納しない
        - `updateHighlight` の `setHighlights` map callback は `Highlight` を返すため型変更で自然に整合する
    - `clipUrls` state を追加: `useState<Record<string, string>>({})`
    - `fetchHighlights` 内の `setHighlights(data.highlights)` の直後に `setClipUrls` を追加:
        ```typescript
        setClipUrls((current) => {
          const updated = { ...current };
          let changed = false;
          data.highlights.forEach((h) => {
            if (h.clipStatus === 'GENERATED' && h.clipUrl && !current[h.highlightId]) {
              updated[h.highlightId] = h.clipUrl;
              changed = true;
            } else if (h.clipStatus !== 'GENERATED' && current[h.highlightId]) {
              delete updated[h.highlightId];
              changed = true;
            }
          });
          return changed ? updated : current;
        });
        ```
        - `onRegenerate`・`updateHighlight` は `clipUrls` を直接操作しない。
          GENERATING になったクリップの URL 削除は次のポーリングで `setClipUrls` が行う
    - `selectedHighlight` useMemo を変更:
        ```typescript
        const selectedHighlight = useMemo(() => {
          const highlight = highlights.find((h) => h.highlightId === selectedId);
          if (!highlight) return null;
          return { ...highlight, clipUrl: clipUrls[highlight.highlightId] };
        }, [highlights, clipUrls, selectedId]);
        ```
- [ ] `services/quick-clip/web/tests/unit/app/jobs/highlights-page.test.tsx`
    - 既存テストのパターン（`jest.useFakeTimers()`・`mockResolvedValueOnce` の連鎖・`act` + `jest.advanceTimersByTime`）に倣って追加する
    - 追加するテスト 1「ポーリング後も選択中 GENERATED クリップの video src が保持される」:
        - 1 回目の fetch: h-1=GENERATED(clipUrl=url-1), h-2=GENERATING を返す
        - 2 回目の fetch（ポーリング）: h-1=GENERATED(clipUrl=url-2), h-2=GENERATING を返す（url が変わっている）
        - ポーリング後も video src が url-1 のままであることを確認（url-2 に変わらない）
    - 追加するテスト 2「GENERATING → GENERATED に遷移したクリップの clipUrl が video src に反映される」:
        - 1 回目の fetch: h-1=GENERATED(url-1), h-2=GENERATING を返す。h-2 を選択できない
        - 2 回目の fetch（ポーリング）: h-1=GENERATED(url-1), h-2=GENERATED(url-2) を返す
        - ポーリング後 h-2 が選択可能になり、h-2 をクリックすると video src が url-2 になることを確認

## Phase 10: 検証・ドキュメント整備

- [ ] 受け入れテスト（`requirements.md` のユースケースを全件手動確認）
- [ ] `docs/services/quick-clip/` ドキュメントを作成・更新
- [ ] `tasks/issue-2446-quick-clip/` ディレクトリを削除

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`quick-clip/core`）
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/` の該当ファイルを更新した
- [ ] `tasks/issue-2446-quick-clip/` ディレクトリを削除した
