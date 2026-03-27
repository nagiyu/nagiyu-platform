# さくっとクリップ (QuickClip) - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/issue-2446-quick-clip/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/issue-2446-quick-clip/requirements.md — 受け入れ条件・ユースケース
    - tasks/issue-2446-quick-clip/design.md — API 仕様・データモデル・コンポーネント設計
-->

<!-- NOTE: このファイルは requirements.md・design.md の TODO が解消されてから詳細化する -->

## Phase 1: 基盤整備

<!-- サービス骨格・インフラ・共通設定のセットアップ -->

- [ ] サービスディレクトリ構成の作成（`services/quick-clip/{core,web,batch}`）（依存: なし）
- [ ] モノレポへのワークスペース追加（`package.json` 更新）（依存: 上記）
- [ ] AWS インフラ構成（S3・DynamoDB・Batch・CloudFront）（依存: なし）
- [ ] CI/CD パイプラインの設定（依存: 上記）

## Phase 2: コアロジック実装

<!-- ビジネスロジック・リポジトリ・バッチ処理 -->

- [ ] DynamoDB リポジトリ実装（Job・Highlight）（依存: Phase 1）
- [ ] JobService 実装（ジョブ作成・ステータス管理）（依存: 上記）
- [ ] HighlightService 実装（見どころ更新・選別）（依存: 上記）
- [ ] VideoAnalyzer 実装（FFmpeg で変化量・音量を分析）（依存: Phase 1、並列実行可能）
- [ ] HighlightDetector 実装（スコアリング・区間検出）（依存: VideoAnalyzer）
- [ ] ClipExporter 実装（FFmpeg で見どころを分割書き出し）（依存: VideoAnalyzer）
- [ ] batch エントリーポイント実装（依存: 上記全て）
- [ ] core ユニットテスト（カバレッジ 80% 以上）（依存: コアロジック実装）

## Phase 3: API Routes 実装

<!-- Next.js API Routes の実装 -->

- [ ] `POST /api/jobs`（Presigned URL 生成・ジョブ作成）（依存: Phase 2）
- [ ] `GET /api/jobs/{jobId}`（ジョブステータス取得）（依存: Phase 2）
- [ ] `GET /api/jobs/{jobId}/highlights`（見どころ一覧取得）（依存: Phase 2）
- [ ] `PATCH /api/jobs/{jobId}/highlights/{highlightId}`（採否・時間更新）（依存: Phase 2）
- [ ] `POST /api/jobs/{jobId}/download`（ZIP 生成・ダウンロード URL 取得）（依存: Phase 2）

## Phase 4: UI 実装

<!-- フロントエンドコンポーネント・画面実装 -->

- [ ] アップロード画面（SCR-001）実装（依存: Phase 3）
- [ ] 処理中画面（SCR-002）実装（依存: Phase 3）
- [ ] 見どころ確認画面（SCR-003）実装（依存: Phase 3）
- [ ] E2E テスト作成（依存: Phase 4 画面実装）

## Phase 5: 検証・ドキュメント整備

- [ ] 受け入れテスト（requirements.md のユースケースを全件手動確認）
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
