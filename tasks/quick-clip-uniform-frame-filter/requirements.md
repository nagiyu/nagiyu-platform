<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/quick-clip/requirements.md に統合して削除します。
-->

# さくっとクリップ 暗転・白転フレームフィルタリング - 要件定義

## 背景・目的

さくっとクリップのクリップ検出は FFmpeg の `scene` フィルターによる画面変化量（scene_score）で行っている。
ゲーム動画等では暗転（フェードアウトして黒）や白転（フラッシュして白）といった演出的な場面切り替えが多用されており、これらも scene_score が高くなるため誤検出が発生している。

本タスクでは、暗転・白転に相当する「ほぼ均一色のフレーム区間」に重なる scene_score エントリを除外し、誤検出を減らす。

## 問題の仕組み

```
通常フレーム → 暗転(黒) → 次シーン
       ↑ scene_score≈1.0    ↑ scene_score≈1.0
```

- 暗転・白転は前後のフレームとの差分が大きいため scene_score が約 1.0 になる
- 閾値（現在 0.2）を引き上げても scene_score ≈ 1.0 には効かないため根本解決にならない
- FFmpeg の `blackdetect` フィルターで黒フレーム区間を検出できる
- 白転は `negate,blackdetect`（色反転してから blackdetect を適用）で検出できる

## 受け入れ条件

- [ ] 暗転区間（ほぼ黒いフレームが連続する区間）に該当する scene_score エントリがハイライト候補から除外される
- [ ] 白転区間（ほぼ白いフレームが連続する区間）に該当する scene_score エントリがハイライト候補から除外される
- [ ] 暗転・白転が存在しない動画では、既存の動作と変わらない（フィルタリングが発生しない）
- [ ] 暗転・白転でも音量スパイクがある場合、volume 側のハイライトとして引き続き検出される（本タスクのスコープ外）
- [ ] 既存ユニットテストが引き続きパスする
- [ ] 新規追加ロジックにユニットテストが存在する

## スコープ

### 対象

- `services/quick-clip/core/src/libs/ffmpeg-video-analyzer.ts` — `detectUniformIntervals` メソッドの追加
- `services/quick-clip/core/src/libs/motion-highlight.service.ts` — フィルタリングロジックの追加
- `services/quick-clip/core/tests/unit/libs/ffmpeg-video-analyzer.test.ts` — 新メソッドのテスト追加
- `services/quick-clip/core/tests/unit/libs/motion-highlight.service.test.ts` — フィルタリングのテスト追加

### スコープ外

- volume 側のハイライト検出ロジックへの変更なし
- ハイライト集約ロジック（highlight-aggregation.service.ts）への変更なし
- UI・API への変更なし
- `blackdetect` の `pix_th` 閾値のチューニング（初期値 0.10 で固定）
