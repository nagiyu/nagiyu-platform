# さくっとクリップ 暗転・白転フレームフィルタリング - 実装タスク

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に tasks/quick-clip-uniform-frame-filter/ ディレクトリごと削除します。

    参照ドキュメント:
    - tasks/quick-clip-uniform-frame-filter/requirements.md — 受け入れ条件
    - tasks/quick-clip-uniform-frame-filter/design.md — 実装仕様・コード例・テスト設計（必読）
-->

## Phase 1: FfmpegVideoAnalyzer の拡張

対象ファイル: `services/quick-clip/core/src/libs/ffmpeg-video-analyzer.ts`

- [x] `UniformInterval` 型を追加して export する（依存: なし）
- [x] モジュールレベルに `parseUniformIntervals(stderr: string): UniformInterval[]` 関数を追加する（依存: 上記）
- [x] `detectUniformIntervals(videoFilePath: string): Promise<UniformInterval[]>` メソッドを `public` で追加する（依存: 上記）

実装の詳細は `design.md` の「モジュール間インターフェース > FfmpegVideoAnalyzer に追加するメソッド」を参照。

## Phase 2: MotionHighlightService の変更

対象ファイル: `services/quick-clip/core/src/libs/motion-highlight.service.ts`

- [ ] `analyzeMotion` メソッドを変更し、`analyzeMotion` と `detectUniformIntervals` を `Promise.all` で並列実行して均一区間内の scene_score エントリを除外するフィルタリングロジックを追加する（依存: Phase 1）

実装の詳細は `design.md` の「モジュール間インターフェース > MotionHighlightService.analyzeMotion の変更」を参照。

## Phase 3: テストの追加・更新

- [x] `ffmpeg-video-analyzer.test.ts` に `detectUniformIntervals` のテストを追加する（依存: Phase 1）
    - 黒フレーム区間が正しくパースされること
    - `black_start` のみ / `black_end` のみの行は無視されること
    - 均一フレームが存在しない動画では空配列を返すこと
    - **注意:** `detectUniformIntervals` は内部で `runFfmpeg` を2回呼ぶため、`spawnMock.mockReturnValueOnce(...).mockReturnValueOnce(...)` で2回分のモックを用意すること
- [ ] `motion-highlight.service.test.ts` の `createAnalyzerMock` に `detectUniformIntervals: jest.fn()` を追加し、既存テストを更新する（依存: Phase 2）
- [ ] `motion-highlight.service.test.ts` にフィルタリングのテストを追加する（依存: 上記）
    - 均一区間内の scene_score エントリが除外されること
    - 均一区間が空の場合はすべてのスコアをそのまま返すこと
    - 境界値（`second === start` と `second === end`）は除外対象に含まれること

テストのコード例は `design.md` の「テスト設計」を参照。

---

## 完了チェック

- [ ] `requirements.md` の受け入れ条件をすべて満たしている
- [ ] テストカバレッジ 80% 以上（`quick-clip/core`）
- [ ] Lint・型チェックがすべて通過している（`pnpm --filter @nagiyu/quick-clip-core lint` 等）
- [ ] 既存ユニットテストが引き続きパスしている
- [ ] `design.md` の「docs/ への移行メモ」を処理した
- [ ] `docs/services/quick-clip/architecture.md` に ADR-007 を追記した
- [ ] `tasks/quick-clip-uniform-frame-filter/` ディレクトリを削除した
