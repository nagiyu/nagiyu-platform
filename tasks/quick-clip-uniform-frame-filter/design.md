# さくっとクリップ 暗転・白転フレームフィルタリング - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/quick-clip/architecture.md に ADR として抽出し、
    tasks/quick-clip-uniform-frame-filter/ ディレクトリごと削除します。

    入力: tasks/quick-clip-uniform-frame-filter/requirements.md
    次に作成するドキュメント: tasks/quick-clip-uniform-frame-filter/tasks.md
-->

## コンポーネント設計

### パッケージ責務分担

変更対象は `quick-clip/core` のみ。API・UI・インフラへの変更なし。

| パッケージ | 責務 |
|----------|------|
| `quick-clip/core` | 暗転・白転フレームの検出とフィルタリング |

### 実装モジュール一覧

**変更するモジュール:**

| モジュール | パス | 変更内容 |
|----------|------|---------|
| `FfmpegVideoAnalyzer` | `core/src/libs/ffmpeg-video-analyzer.ts` | `detectUniformIntervals` メソッドを追加 |
| `MotionHighlightService` | `core/src/libs/motion-highlight.service.ts` | `analyzeMotion` でフィルタリングを追加 |

**変更しないモジュール:**

| モジュール | パス | 理由 |
|----------|------|------|
| `VolumeHighlightService` | `core/src/libs/volume-highlight.service.ts` | volume 側は対象外 |
| `HighlightAggregationService` | `core/src/libs/highlight-aggregation.service.ts` | 集約ロジックは変更不要 |
| `QuickClipBatchRunner` | `core/src/libs/quick-clip-batch-runner.ts` | 呼び出し側の変更不要 |

---

## モジュール間インターフェース

### 追加する型

`ffmpeg-video-analyzer.ts` に以下の型を追加し export する：

```typescript
// services/quick-clip/core/src/libs/ffmpeg-video-analyzer.ts

export type UniformInterval = {
    start: number; // 区間の開始時刻（秒）
    end: number;   // 区間の終了時刻（秒）
};
```

### `FfmpegVideoAnalyzer` に追加するメソッド

```typescript
// services/quick-clip/core/src/libs/ffmpeg-video-analyzer.ts

public async detectUniformIntervals(videoFilePath: string): Promise<UniformInterval[]>
```

**処理内容:**

1. 黒フレーム区間を検出する FFmpeg パスと白フレーム区間を検出する FFmpeg パスを `Promise.all` で並列実行する
2. 両パスの stderr 出力をマージして `black_start` / `black_end` をパースする
3. 有効な区間リストを返す

**FFmpeg コマンド引数:**

暗転（黒フレーム）検出:
```
['-hide_banner', '-i', videoFilePath, '-vf', 'blackdetect=d=0:pix_th=0.10', '-an', '-f', 'null', '-']
```

白転（白フレーム）検出（negate で色反転してから blackdetect を適用）:
```
['-hide_banner', '-i', videoFilePath, '-vf', 'negate,blackdetect=d=0:pix_th=0.10', '-an', '-f', 'null', '-']
```

**FFmpeg 出力形式（blackdetect の stderr 出力例）:**
```
[blackdetect @ 0x...] black_start:5 black_end:6.5 black_duration:1.5
[blackdetect @ 0x...] black_start:30.2 black_end:31.0 black_duration:0.8
```
→ `black_start` と `black_end` は同一行に出力される。1行から両方を同時に正規表現でパースする。

**パース関数（モジュールレベルの非 export 関数として定義）:**

```typescript
const parseUniformIntervals = (stderr: string): UniformInterval[] => {
    const intervals: UniformInterval[] = [];
    for (const line of stderr.split(/\r?\n/)) {
        const startMatch = line.match(/black_start:([\d.]+)/);
        const endMatch = line.match(/black_end:([\d.]+)/);
        if (startMatch && endMatch) {
            const start = Number.parseFloat(startMatch[1] ?? '');
            const end = Number.parseFloat(endMatch[1] ?? '');
            if (Number.isFinite(start) && Number.isFinite(end)) {
                intervals.push({ start, end });
            }
        }
    }
    return intervals;
};
```

**`detectUniformIntervals` の実装:**

```typescript
public async detectUniformIntervals(videoFilePath: string): Promise<UniformInterval[]> {
    const [darkStderr, brightStderr] = await Promise.all([
        this.runFfmpeg([
            '-hide_banner', '-i', videoFilePath,
            '-vf', 'blackdetect=d=0:pix_th=0.10',
            '-an', '-f', 'null', '-',
        ]),
        this.runFfmpeg([
            '-hide_banner', '-i', videoFilePath,
            '-vf', 'negate,blackdetect=d=0:pix_th=0.10',
            '-an', '-f', 'null', '-',
        ]),
    ]);
    return parseUniformIntervals(darkStderr + '\n' + brightStderr);
}
```

**注意:** `blackdetect` コマンドは正常終了時に exit code 0 で終わる。`runFfmpeg` の既存のエラーハンドリングをそのまま使える（`DURATION_PROBE_ARGS_LENGTH` の特例は不要）。

---

### `MotionHighlightService.analyzeMotion` の変更

変更前（現在の実装）:
```typescript
public async analyzeMotion(videoFilePath: string): Promise<HighlightScore[]> {
    return this.analyzer.analyzeMotion(videoFilePath);
}
```

変更後:
```typescript
public async analyzeMotion(videoFilePath: string): Promise<HighlightScore[]> {
    const [scores, uniformIntervals] = await Promise.all([
        this.analyzer.analyzeMotion(videoFilePath),
        this.analyzer.detectUniformIntervals(videoFilePath),
    ]);
    if (uniformIntervals.length === 0) {
        return scores;
    }
    return scores.filter(
        ({ second }) =>
            !uniformIntervals.some(({ start, end }) => second >= start && second <= end)
    );
}
```

- `analyzeMotion` と `detectUniformIntervals` を `Promise.all` で並列実行し処理時間の増加を抑える
- 均一区間が 0 件の場合は早期リターンしてフィルタリングループを省略する

---

## テスト設計

### 既存テストファイルへの追加

#### `ffmpeg-video-analyzer.test.ts`

`detectUniformIntervals` のテストケースを追加する。
モック戦略は既存テストと同じ（`spawnMock` で FFmpeg プロセスをシミュレート）。

追加するテストケース（`describe('FfmpegVideoAnalyzer')` ブロック内に追記）:

```typescript
// ケース1: 暗転区間が正しくパースされる
it('detectUniformIntervals: black_start/black_end から区間を抽出できる', async () => {
    spawnMock.mockReturnValue(
        createFfmpegProcessMock(
            [
                '[blackdetect @ 0x...] black_start:5 black_end:6.5 black_duration:1.5',
                '[blackdetect @ 0x...] black_start:30.2 black_end:31.0 black_duration:0.8',
            ].join('\n')
        )
    );
    // 2回呼ばれる（darkStderr + brightStderr）のでモックを2つ用意する
    // → spawnMock.mockReturnValueOnce(...).mockReturnValueOnce(...)

    const analyzer = new FfmpegVideoAnalyzer();
    const result = await analyzer.detectUniformIntervals('/tmp/input.mp4');

    expect(result).toEqual([
        { start: 5, end: 6.5 },
        { start: 30.2, end: 31 },
        // brightStderr 側が空の場合、上記のみ
    ]);
});

// ケース2: black_start と black_end が揃っていない行は無視される
it('detectUniformIntervals: black_start のみの行は無視される', async () => {
    // ...
});

// ケース3: 均一区間が存在しない場合は空配列を返す
it('detectUniformIntervals: 均一フレームが存在しない動画では空配列を返す', async () => {
    // ...
});
```

**重要:** `detectUniformIntervals` は内部で `runFfmpeg` を2回呼ぶ（暗転用・白転用）。
テスト時は `spawnMock.mockReturnValueOnce(...).mockReturnValueOnce(...)` を使って2回分のモックを用意すること。

#### `motion-highlight.service.test.ts`

既存のモック定義に `detectUniformIntervals` を追加し、新しいテストケースを追加する。

**モック更新（既存の `createAnalyzerMock` を変更）:**

```typescript
const createAnalyzerMock = (): jest.Mocked<FfmpegVideoAnalyzer> =>
    ({
        analyzeMotion: jest.fn(),
        analyzeVolume: jest.fn(),
        getDurationSec: jest.fn(),
        detectUniformIntervals: jest.fn(), // 追加
    }) as unknown as jest.Mocked<FfmpegVideoAnalyzer>;
```

**既存テストの更新:**
- 「analyzer から返る生スコアをそのまま返す」テストは `detectUniformIntervals` が `[]` を返す場合の挙動に合わせて更新する

**追加するテストケース:**

```typescript
// ケース1: 均一区間内の scene_score エントリが除外される
it('analyzeMotion: 均一区間内のスコアは除外される', async () => {
    analyzer.analyzeMotion.mockResolvedValue([
        { second: 5.5, score: 0.9 }, // 均一区間内 → 除外
        { second: 20.0, score: 0.5 }, // 区間外 → 保持
    ]);
    analyzer.detectUniformIntervals.mockResolvedValue([
        { start: 5.0, end: 6.5 },
    ]);

    const result = await service.analyzeMotion('/tmp/input.mp4');

    expect(result).toEqual([{ second: 20.0, score: 0.5 }]);
});

// ケース2: 均一区間が空の場合はすべてのスコアを返す
it('analyzeMotion: 均一区間がない場合はすべてのスコアをそのまま返す', async () => {
    // ...
});

// ケース3: 境界値（区間の端点は除外対象に含まれる）
it('analyzeMotion: 均一区間の境界値（start/end と一致する秒数）は除外される', async () => {
    // second === start と second === end のケースを確認
});
```

---

## 実装上の注意点

### 依存関係・前提条件

- `runFfmpeg` は `private` メソッドのため、`detectUniformIntervals` は `FfmpegVideoAnalyzer` クラス内に定義すること
- `parseUniformIntervals` はモジュールレベルのファイルスコープ関数（non-export）として定義する
- `UniformInterval` 型は `ffmpeg-video-analyzer.ts` から export する

### パフォーマンス考慮事項

- `detectUniformIntervals` 内の2つの FFmpeg パスは `Promise.all` で並列実行する
- `MotionHighlightService.analyzeMotion` 内の `analyzeMotion` と `detectUniformIntervals` も `Promise.all` で並列実行する
- これにより FFmpeg パスの増加による処理時間への影響を最小化する

### セキュリティ考慮事項

- 既存と同様。`videoFilePath` は上位レイヤーで検証済みの値が渡される前提

### コーディング規約（docs/development/rules.md より）

- `Number.parseFloat` / `Number.isFinite` を使用する（グローバル `parseFloat` / `isFinite` は使わない）
- `const` / `let` を使用、`var` 禁止
- アクセス修飾子（`public` / `private`）は必ず明示する

---

## docs/ への移行メモ

<!-- 開発完了後にここを確認し、docs/ を更新してからこのディレクトリを削除する -->

- [ ] `docs/services/quick-clip/architecture.md` に ADR として追記すること：
      「ADR-007: 暗転・白転による誤検出対策に blackdetect フィルターを使用」
      - 問題: scene フィルターが演出的な暗転・白転も高スコアで検出する
      - 決定: blackdetect と negate+blackdetect で均一フレーム区間を検出し、該当 scene_score を除外する
      - 根拠: FFmpeg ネイティブ機能のため精度が高く、閾値調整より的確
      - トレードオフ: FFmpeg パスが2回増えるが、並列実行で処理時間の増加を抑える
- [ ] `tasks/quick-clip-uniform-frame-filter/` ディレクトリを削除する
