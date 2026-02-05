# Codec Converter の動的リソース配分機能

## 概要

現在、Codec Converterの動画変換処理は一律のマシン性能（2 vCPU、4096 MB）で行われている。動画のサイズや出力コーデックによって処理負荷が異なるため、ジョブごとに適切なリソースを動的に割り当てることで、コスト効率と処理時間を最適化する。

## 関連情報

- Issue: 機能追加要望
- タスクタイプ: サービスタスク（Codec Converter）
- 影響範囲: AWS Batch ジョブ定義、ジョブ投入ロジック

## 背景

### 現状の課題

現在のシステムでは、すべての変換ジョブに対して固定のリソース（2 vCPU、4096 MB メモリ）を使用している（`infra/codec-converter/lib/codec-converter-stack.ts:209-217`）。

**問題点**:

1. **コスト効率の悪化**
    - 小さなファイルやH.264への変換などの軽い処理でも高スペックリソースを使用
    - 不要なコストが発生

2. **処理時間の最適化不足**
    - 大きなファイルやAV1への変換などの重い処理で処理時間が長くなる
    - より高性能なリソースを割り当てれば処理時間を短縮可能

3. **スケーラビリティの制約**
    - 最大同時実行数は maxvCPUs（現在6 vCPU = 3ジョブ）で制限
    - 軽いジョブも重いジョブも同じリソースを消費するため、キュー滞留が発生しやすい

### 変換処理の特性

ドキュメント（`docs/services/codec-converter/requirements.md:210-217`）によると、コーデックごとの処理時間目安は以下の通り:

- **H.264**: 実時間の 0.3-0.5倍（軽量）
- **VP9**: 実時間の 0.5-1.0倍（中程度）
- **AV1**: 実時間の 1.0-2.0倍（重量）

また、ファイルサイズによっても処理負荷は変動する。

## 要件

### 機能要件

#### FR1: ジョブ特性に応じたリソース決定ロジック

動画のサイズと出力コーデックに基づいて、最適なリソース（vCPU、メモリ）を決定する。

**判定基準**:

| ファイルサイズ | 出力コーデック | vCPU | メモリ (MB) | 想定ユースケース |
|-------------|------------|------|-----------|--------------|
| < 100MB | h264 | 1 | 2048 | 小さいファイルの軽量変換 |
| < 100MB | vp9 | 2 | 2048 | 小さいファイルの中程度変換 |
| < 100MB | av1 | 2 | 4096 | 小さいファイルの重量変換 |
| 100-300MB | h264 | 2 | 2048 | 中サイズの軽量変換 |
| 100-300MB | vp9 | 2 | 4096 | 中サイズの中程度変換 |
| 100-300MB | av1 | 4 | 8192 | 中サイズの重量変換 |
| > 300MB | h264 | 2 | 4096 | 大サイズの軽量変換 |
| > 300MB | vp9 | 4 | 8192 | 大サイズの中程度変換 |
| > 300MB | av1 | 4 | 16384 | 大サイズの重量変換 |

**注**: 上記の数値は初期値であり、実運用でのデータをもとに調整が必要。

#### FR2: 複数のBatchジョブ定義の作成

AWS Batchでは、ジョブ定義でリソース要件を指定する。異なるリソース構成をサポートするため、複数のジョブ定義を作成する。

**ジョブ定義パターン**:

- `codec-converter-{env}-small`: 1 vCPU, 2048 MB
- `codec-converter-{env}-medium`: 2 vCPU, 4096 MB
- `codec-converter-{env}-large`: 4 vCPU, 8192 MB
- `codec-converter-{env}-xlarge`: 4 vCPU, 16384 MB

#### FR3: ジョブ投入時のリソース選択

Next.js API Routes（`POST /api/jobs/{jobId}/submit`）でBatchジョブを投入する際、ファイルサイズと出力コーデックに基づいて適切なジョブ定義を選択する。

**実装場所**: `services/codec-converter/web/src/app/api/jobs/[jobId]/submit/route.ts`

#### FR4: Compute Environmentの maxvCPUs 調整

複数のリソース構成を同時実行できるように、maxvCPUs を引き上げる。

**現在**: 6 vCPU（2 vCPU × 3ジョブ）
**提案**: 16 vCPU（軽量ジョブを多く並列実行、または重量ジョブを少数実行）

### 非機能要件

#### NFR1: 後方互換性

既存のジョブ（もしあれば）が失敗しないように、デフォルトのジョブ定義（medium）を引き続き利用可能にする。

#### NFR2: コスト最適化

- 軽量な処理には低スペックリソースを使用し、コストを削減
- Fargate Spotの利用は今回のスコープ外（Phase 2以降で検討）

#### NFR3: モニタリング

- 各リソースパターンの使用状況をCloudWatch Logsで確認可能にする
- ジョブ定義名をログに出力

#### NFR4: テストカバレッジ

リソース決定ロジックのユニットテストでカバレッジ80%以上を達成する。

## 実装方針

### 1. インフラ変更（AWS CDK）

**ファイル**: `infra/codec-converter/lib/codec-converter-stack.ts`

- 複数のBatchジョブ定義を作成（small, medium, large, xlarge）
- 各ジョブ定義で異なるリソース要件を指定
- Compute Environmentの maxvCPUs を 6 → 16 に変更

**注意事項**:
- ジョブ定義は配列やループで生成し、DRYを維持
- 環境変数（DYNAMODB_TABLE, S3_BUCKET等）はすべてのジョブ定義で共通

### 2. リソース決定ロジックの実装

**新規ファイル**: `services/codec-converter/core/src/lib/resource-selector.ts`

共通パッケージ（`codec-converter-core`）にリソース選択ロジックを実装する。

**提供する機能**:
- `selectJobDefinition(fileSize: number, codecType: CodecType): JobDefinitionSize`
- 型定義: `JobDefinitionSize = 'small' | 'medium' | 'large' | 'xlarge'`

**理由**: Lambda（Next.js API）とテストコードで共有するため

### 3. Batchジョブ投入APIの更新

**ファイル**: `services/codec-converter/web/src/app/api/jobs/[jobId]/submit/route.ts`

- DynamoDBからファイルサイズを取得
- `selectJobDefinition()` を呼び出してジョブ定義を決定
- `batch.submitJob()` で適切なジョブ定義を指定

### 4. ログ出力の追加

**ファイル**: `services/codec-converter/batch/src/index.ts`

- Worker起動時に使用リソース（vCPU、メモリ）をログ出力
- ジョブ定義名を環境変数から取得して記録

## タスクチェックリスト

### Phase 1: 設計と準備

- [ ] リソース決定ロジックの詳細設計
- [ ] 既存のドキュメント更新（architecture.md, requirements.md）
- [ ] リソース構成表の最終確認

### Phase 2: インフラ実装

- [ ] 複数のBatchジョブ定義を作成（CDK）
- [ ] Compute Environmentの maxvCPUs を調整
- [ ] ジョブ定義名を環境変数として設定
- [ ] CDKスタックのテスト追加

### Phase 3: ロジック実装

- [ ] `codec-converter-core` にリソース選択ロジックを実装
- [ ] リソース選択ロジックのユニットテスト作成（カバレッジ80%以上）
- [ ] 型定義の追加（`JobDefinitionSize` 型）

### Phase 4: API更新

- [ ] Batchジョブ投入APIを更新（適切なジョブ定義を選択）
- [ ] APIのユニットテスト追加
- [ ] エラーハンドリングの強化（不正なジョブ定義名の場合）

### Phase 5: Worker更新

- [ ] Batch Workerにログ出力を追加（使用リソース情報）
- [ ] Workerのテスト更新

### Phase 6: デプロイと検証

- [ ] dev環境へデプロイ
- [ ] 各リソースパターンでの動作確認
    - [ ] 小ファイル + H.264 → small
    - [ ] 大ファイル + AV1 → xlarge
    - [ ] 中ファイル + VP9 → medium/large
- [ ] CloudWatch Logsで使用リソースを確認
- [ ] コスト影響を評価（AWS Cost Explorer）

### Phase 7: ドキュメント化

- [ ] architecture.md にリソース選択ロジックを記載
- [ ] deployment.md にデプロイ手順を更新
- [ ] README.md に機能追加を記載

## 技術的考慮事項

### AWS Batchの制約

1. **ジョブ定義のリソース要件**:
    - Fargateでは、vCPUとメモリの組み合わせに制約がある
    - 例: 4 vCPU は 8192-30720 MB のメモリと組み合わせ可能
    - 参考: https://docs.aws.amazon.com/batch/latest/userguide/fargate.html

2. **maxvCPUs の計算**:
    - 複数のジョブパターンを同時実行する場合、maxvCPUs は最大同時実行を考慮して設定
    - 例: small 4個 + large 2個 = (1×4) + (4×2) = 12 vCPU

### リソース選択ロジックのチューニング

初期実装後、実運用データをもとに以下を調整:

- ファイルサイズの閾値
- 各コーデックのリソース配分
- maxvCPUs の最適値

### エラーハンドリング

- 不正なジョブ定義名が指定された場合、デフォルト（medium）にフォールバック
- ジョブ投入失敗時のリトライ戦略は既存のまま（AWS Batch が管理）

## テスト戦略

### ユニットテスト

**対象**: `resource-selector.ts`

- 各ファイルサイズ × コーデックの組み合わせで正しいジョブ定義が返されるか
- 境界値テスト（100MB、300MB、500MB）
- 不正な入力（負のサイズ、不明なコーデック）のエラーハンドリング

**カバレッジ目標**: 80%以上

### 統合テスト

**対象**: Batchジョブ投入API

- ファイルサイズとコーデックに応じて適切なジョブ定義が選択されるか
- DynamoDBからのデータ取得エラーのハンドリング

### E2Eテスト（手動）

- dev環境で実際のファイルをアップロードし、変換を実行
- CloudWatch Logsで使用リソースを確認
- 変換完了後のファイル品質を確認

## リスクと対策

### リスク1: リソース不足による処理失敗

**内容**: 低スペックリソースを選択したことで、メモリ不足やタイムアウトが発生

**対策**:
- 保守的な初期値を設定（余裕を持たせる）
- CloudWatch Logsでメモリ使用量を監視
- 失敗が多発する場合は閾値を調整

### リスク2: maxvCPUs 不足によるキュー滞留

**内容**: 同時実行ジョブ数が増え、maxvCPUs の上限に達してキューが滞留

**対策**:
- maxvCPUs を余裕を持って設定（16 vCPU）
- CloudWatch メトリクスでキューサイズを監視
- 必要に応じて maxvCPUs を増加

### リスク3: コストの増加

**内容**: 高スペックリソースの使用頻度が高く、コストが増加

**対策**:
- AWS Cost Explorerで日次コストを監視
- 実運用データをもとにリソース選択ロジックを最適化
- 将来的にFargate Spotを検討（Phase 2以降）

## スコープ外（Phase 2以降で検討）

以下の機能は今回のスコープ外とする:

1. **動的なリソース調整**:
    - ジョブ実行中にリソースを変更する機能
    - 理由: AWS Batchの制約上、実行中のリソース変更は不可

2. **Fargate Spotの利用**:
    - コスト削減のためのSpotインスタンス利用
    - 理由: 初回実装では安定性を優先

3. **機械学習による自動最適化**:
    - 過去のジョブデータをもとにリソースを予測
    - 理由: データ蓄積と分析基盤が必要

4. **GPUアクセラレーション**:
    - FFmpegのNVENC/NVDEC利用
    - 理由: Fargateでは現在GPUサポートなし

## 参考ドキュメント

- [Codec Converter アーキテクチャ](../docs/services/codec-converter/architecture.md)
- [Codec Converter 要件定義](../docs/services/codec-converter/requirements.md)
- [AWS Batch Fargate ドキュメント](https://docs.aws.amazon.com/batch/latest/userguide/fargate.html)
- [コーディング規約](../docs/development/rules.md)
- [テスト戦略](../docs/development/testing.md)

## 次のステップ

本ドキュメント作成後、以下のステップで進める:

1. **ドキュメントレビュー**: 本タスクドキュメントの内容を確認し、必要に応じて修正
2. **実装開始**: `task.implement` エージェントにこのドキュメントを渡して実装を開始
    - コマンド例（エージェント呼び出し方法は環境により異なる）:
      ```
      task.implement を起動し、tasks/codec-converter-dynamic-resources.md を参照して実装を進める
      ```

## 備考

### 実装優先度

本機能は以下の優先度で実装を推奨:

1. **Phase 2-3** (ロジック実装): リソース選択ロジックは独立してテスト可能
2. **Phase 4** (API更新): Batchジョブ投入APIの変更
3. **Phase 2** (インフラ実装): CDK変更はデプロイに時間がかかるため、並行して進める

### 未決定事項

- リソース構成表の数値（ファイルサイズ閾値、vCPU/メモリ配分）は初期値であり、実運用データをもとに調整が必要
- maxvCPUs の最適値は運用開始後に決定
