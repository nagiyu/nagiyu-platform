<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/quick-clip/architecture.md に ADR-009 として抽出し、
    tasks/quick-clip-batch-sizing-fix/ ディレクトリごと削除します。

    入力: tasks/quick-clip-batch-sizing-fix/requirements.md
    次に作成するドキュメント: tasks/quick-clip-batch-sizing-fix/tasks.md
-->

# さくっとクリップ - Batch ジョブサイジング修正 技術設計

---

## API 仕様

変更なし（外部 API インターフェースへの影響なし）。

---

## データモデル

変更なし。

---

## コンポーネント設計

### パッケージ責務分担

| パッケージ | 責務 |
| ---------- | ---- |
| `quick-clip/core` | `selectJobDefinition` のティア境界値ロジック変更・テスト更新 |
| `quick-clip/infra` | `BatchStack` の `large` ジョブ定義 vCPU 変更 |

### 変更モジュール一覧

**core**

| モジュール | パス | 変更内容 |
| ---------- | ---- | -------- |
| `selectJobDefinition` | `core/src/libs/job-definition-selector.ts` | `EIGHT_GIB` → `FOUR_GIB` に定数変更 |
| `selectJobDefinition` テスト | `core/tests/unit/libs/job-definition-selector.test.ts` | 境界値テストケースを 4 GiB に更新 |

**infra**

| モジュール | パス | 変更内容 |
| ---------- | ---- | -------- |
| `BatchStack` (large 定義) | `infra/quick-clip/lib/batch-stack.ts` | vCPU を `'2'` → `'4'` に変更 |

---

## 変更仕様の詳細

### 変更1: `job-definition-selector.ts` のティア境界値

**ファイル**: `services/quick-clip/core/src/libs/job-definition-selector.ts`

```typescript
// Before
const ONE_GIB = 1024 * 1024 * 1024;
const EIGHT_GIB = 8 * ONE_GIB;

export const selectJobDefinition = (fileSize: number): JobDefinitionSize => {
  if (fileSize < ONE_GIB) return 'small';
  if (fileSize < EIGHT_GIB) return 'large';
  return 'xlarge';
};

// After
const ONE_GIB = 1024 * 1024 * 1024;
const FOUR_GIB = 4 * ONE_GIB; // FFmpeg が常時 4 プロセス並列実行するため 4 vCPU が必要。large (4 vCPU) のサイズ上限を 4 GiB に設定。

export const selectJobDefinition = (fileSize: number): JobDefinitionSize => {
  if (fileSize < ONE_GIB) return 'small';
  if (fileSize < FOUR_GIB) return 'large';
  return 'xlarge';
};
```

境界値を 4 GiB とした根拠:
- 処理パイプラインは常時 4 FFmpeg プロセスを並列実行する
- `large` を 4 vCPU にすることで 1 プロセスあたり 1 vCPU が保証される
- 4 GiB 未満のファイルは 4 vCPU・3 時間タイムアウトで十分処理できる
- 4 GiB 以上は `xlarge` (4 vCPU・16 GiB・8 時間) で対応できる

### 変更2: `batch-stack.ts` の `large` vCPU

**ファイル**: `infra/quick-clip/lib/batch-stack.ts` の `largeJobDefinition`

変更箇所 (L152 付近):
```typescript
// Before
resourceRequirements: [
  { type: 'VCPU', value: '2' },
  { type: 'MEMORY', value: '8192' },
],

// After
resourceRequirements: [
  { type: 'VCPU', value: '4' },
  { type: 'MEMORY', value: '8192' },
],
```

メモリを 8192 MB (8 GiB) に据え置く理由:
- AWS Fargate は 4 vCPU に対して 8〜30 GiB のメモリが有効
- `large` は最大 4 GiB 未満のファイルを扱うため 8 GiB で十分
- メモリを増やすと不要なコスト増につながる

変更後のティア構成:

| ティア | ファイルサイズ | vCPU | メモリ | タイムアウト | ストレージ |
| ------ | ------------- | ---- | ------ | ----------- | --------- |
| small | < 1 GiB | 1 | 4 GiB | 1 時間 | 20 GiB (default) |
| large | 1 GiB 〜 4 GiB | **4** | 8 GiB | 3 時間 | 30 GiB |
| xlarge | ≥ 4 GiB | 4 | 16 GiB | 8 時間 | 60 GiB |

---

## 実装上の注意点

### 依存関係・前提条件

- `selectJobDefinition` はジョブ投入時 (`POST /api/jobs` と `POST /api/jobs/[jobId]/complete-upload`) の両ルートで呼ばれる。コアロジックを変更するだけで両ルートに反映される。
- `batch-stack.ts` の変更は CDK デプロイ (`cdk deploy`) により AWS Batch のジョブ定義が更新される。既存のキュー済みジョブには影響しない。

### パフォーマンス考慮事項

- `large` の vCPU を 4 に引き上げると、1〜4 GiB のジョブのコストが約 2 倍になる。これは設計上の意図的なトレードオフ（処理の信頼性を優先）。

### セキュリティ考慮事項

変更なし。

---

## docs/ への移行メモ

- [ ] `docs/services/quick-clip/architecture.md` に ADR-009 として追記すること:
      - タイトル: Batch ジョブ定義のサイジング修正（FFmpeg 並列数との整合）
      - 背景: 7.76 GB 動画のタイムアウト障害
      - 決定: ティア境界を 8 GiB → 4 GiB に変更、`large` vCPU を 2 → 4 に引き上げ
      - 根拠: FFmpeg が常時 4 プロセス並列実行するため、vCPU 数と整合させる必要がある
