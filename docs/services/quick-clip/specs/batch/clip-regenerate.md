---
sources:
  - services/quick-clip/lambda/clip/src/handler.ts
  - infra/quick-clip/lib/lambda-stack.ts
  - infra/quick-clip/lib/monitoring-stack.ts
  - libs/aws/src/error-events/with-error-reporting.ts
  - libs/aws/src/error-events/report.ts
sources_hash: 9dc158bcb979a6b0def552b9076eb57e34d5c3155dfc1ff5e3b15eda64dd0a78
---

# クリップ再生成 (clip-regenerate)

利用者が見どころの開始・終了を変えたとき、またはリトライしたときに、元の動画から[クリップ](../term/highlight.md)を切り出し直す Lambda。1 回の起動で 1 つの見どころを処理する。

## 起点

- スケジュールはない。[見どころ API](../api/highlights.md) が、見どころの更新 (開始か終了を含むもの) と、作り直し (`regenerate`) のときに、結果を待たずに (非同期で) 起動する
- 入力は `{ jobId, highlightId, startSec, endSec }`。`jobId` と `highlightId` が空、`startSec` と `endSec` が数値でない、`startSec` が負、`endSec` が `startSec` 以下、のどれかなら例外 (入力値が不正です)
- 環境変数 `DYNAMODB_TABLE_NAME`、`S3_BUCKET`、`AWS_REGION` が必須。なければ例外
- 非同期起動の再試行は 0 回 ([見どころとクリップの状態](../term/highlight.md)の「理由」)。メモリ・一時ストレージ・タイムアウトは[ワーカーの実行環境](../resource/worker-runtime.md)にある

## 処理

```mermaid
flowchart TD
    A[① 入力と環境変数を検証] --> B[② 元の動画の署名付き URL を作る]
    B --> C[③ FFmpeg で切り出し]
    C --> D[④ クリップを S3 に保存]
    D --> E[⑤ clipStatus を GENERATED に更新]
```

| 手順 | 内容 |
|---|---|
| ② 元の動画 | `uploads/{jobId}/input.mp4` への、有効 3,600 秒の署名付き URL。動画はダウンロードせず、FFmpeg が URL から読む |
| ③ 切り出し | `ffmpeg -ss {startSec} -t {endSec - startSec} -i {URL} -c copy` (再エンコードなし)。出力は `/tmp/quick-clip/clip/{リクエストごとの UUID}/{jobId}/{highlightId}.mp4` |
| ④ 保存 | `outputs/{jobId}/clips/{highlightId}.mp4` に上書きする |
| ⑤ 更新 | 見どころの `clipStatus` を `GENERATED` にする。ほかの項目は変えない |

- 終わると、出力を置いたディレクトリを消す。成功でも失敗でも消す。作業用のディレクトリにリクエストごとの UUID を入れるのは、Lambda の `/tmp` が実行環境の中で共有されうるため、同時の呼び出しが衝突しないようにするため
- 入力の動画は、アップロードしてから 1 日で消える ([ストレージ](../resource/storage.md))。消えたあとは、③ の読み込みが失敗して `FAILED` になる

## 失敗したとき

- ② 〜 ⑤ のどこかで例外になると、次を行う。入力や環境変数の検証の失敗は、これに入らない (`clipStatus` は変わらず、報告もしない)

| 順 | 内容 | 報告 |
|---|---|---|
| 1 | Admin へ報告する | error。題名は「QuickClip クリップ再生成に失敗しました」。`jobId`、`highlightId`、クリップの S3 キーつき |
| 2 | 見どころの `clipStatus` を `FAILED` にする | なし |
| 3 | 例外を投げ直す | なし |

- 再試行しないので、失敗した見どころは `FAILED` のまま残る。利用者が画面のリトライを押すまで、変わらない ([見どころ API](../api/highlights.md))
- Lambda が強制終了されるとこの処理は走らず、`GENERATING` のまま残る。見どころ確認画面が一覧を取る前に呼ぶ復旧の API が、360 秒を過ぎたものを `FAILED` にする ([見どころとクリップの状態](../term/highlight.md)、[見どころ API](../api/highlights.md))
- Lambda の失敗を拾う CloudWatch Alarm や EventBridge のルールは、quick-clip のインフラには定義されていない。報告できるのは、アプリが例外を受けられたときだけ
- 報告の書き込みに失敗したときの扱いは[エラーの報告](../../../../platform/specs/lib/aws/error-reporting.md)にある

## つながり

```mermaid
flowchart TD
    A[見どころ API<br/>更新・作り直し] -->|非同期で起動| L[クリップ再生成]
    L -->|動画の読み込み・クリップの保存| S[(S3 バケット)]
    L -->|clipStatus| D[(見どころのテーブル)]
    L -.->|失敗の報告| E[(error-events テーブル)]
    E -->|Streams| N[Admin の Web Push]
```

## 理由

- 作り直しを、抽出バッチではなく専用の Lambda にする。画面の操作 (時間の調整とリトライ) から、見どころ 1 件ずつ個別に起動できるため。Web の API から Lambda を直接起動するので、Batch にジョブを再投入するより速く、仕組みも単純になる
- 初回のクリップは抽出バッチの中で切り出す ([抽出バッチ](./extract.md)の「理由」)。この Lambda は、初回の切り出しの経路には入らない
