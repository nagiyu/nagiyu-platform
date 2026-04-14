# さくっとクリップ 感情分析バッチ分割対応 - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/quick-clip-emotion-batch/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/quick-clip-emotion-batch/requirements.md — 受け入れ条件
    - tasks/quick-clip-emotion-batch/design.md — 設計詳細・実装方針・テスト設計

    関連サービスドキュメント:
    - docs/services/quick-clip/ — サービス全体の設計・要件
-->

## Phase 1: コアロジックの修正

<!-- `emotion-highlight.service.ts` のみを変更する。呼び出し元は変更不要。 -->

- [ ] `SEGMENTS_PER_CHUNK = 50` 定数を追加する（`OPENAI_MODEL` などの既存定数と同じ箇所に追記）
- [ ] `chunkArray<T>(array: T[], size: number): T[][]` ヘルパー関数を追加する（ファイル内部のみ、export 不要）
- [ ] `EmotionHighlightService.getScores` をチャンク処理に変更する（design.md の「変更後実装」を参照）

## Phase 2: テストの追加

<!-- 既存テスト `core/tests/unit/libs/emotion-highlight.service.test.ts` にケースを追加する -->

- [ ] テストデータ生成ヘルパー `makeSegments(count)` を追加する（design.md のヒントを参照）
- [ ] 正常系（チャンク境界: 50件）: `mockParse` が 1 回呼ばれることを確認
- [ ] 正常系（チャンク境界: 51件）: `mockParse` が 2 回呼ばれ、結果が結合されることを確認
- [ ] 異常系（チャンク内リトライ）: 1チャンク目が 1 回失敗後に成功するケースを確認

## Phase 3: 検証

- [ ] テストを実行してすべてパスすることを確認

  ```bash
  cd services/quick-clip/core && npx jest emotion-highlight.service
  ```

- [ ] Lint・型チェックを実行して問題がないことを確認

  ```bash
  cd services/quick-clip/core && npm run lint && npm run typecheck
  ```

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
  - [ ] 50 件以下のセグメントでは API が 1 回だけ呼ばれる
  - [ ] 51 件のセグメントでは API が 2 回呼ばれ、結果が結合されて返る
  - [ ] チャンク単位でリトライが動作する
  - [ ] 既存のすべての単体テストが引き続きパスする
- [ ] Lint・型チェックがすべて通過している
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/architecture.md` を更新した
- [ ] `tasks/quick-clip-emotion-batch/` ディレクトリを削除した
