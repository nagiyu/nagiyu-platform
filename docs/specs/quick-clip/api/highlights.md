---
id: quick-clip/api/highlights
title: 見どころ API
kind: api
service: quick-clip
sources:
  - services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/recover/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/[highlightId]/route.ts
  - services/quick-clip/web/src/app/api/jobs/[jobId]/highlights/[highlightId]/regenerate/route.ts
  - services/quick-clip/web/src/lib/server/highlight-recovery.ts
  - services/quick-clip/web/src/lib/server/domain-services.ts
  - services/quick-clip/web/src/lib/api-error-reporting.ts
  - services/quick-clip/core/src/libs/highlight.service.ts
  - services/quick-clip/core/src/libs/domain-error-messages.ts
  - libs/nextjs/src/request-body.ts
sources_hash: 1f6b0b30750a83f1efdcef028d4125be6208d976bd209f32212b26f5172966dc
terms: [quick-clip/term/highlight, quick-clip/term/job, quick-clip/term/api-error]
related_cards: [quick-clip/screen/highlights, quick-clip/batch/clip-regenerate, quick-clip/batch/extract, quick-clip/api/download, quick-clip/api/jobs]
related_adr:
  - services/quick-clip/architecture.md#ADR-002
  - services/quick-clip/architecture.md#ADR-017
---

# 見どころ API

ジョブの[見どころ](../term/highlight.md)の一覧を返し、採否と開始・終了を更新し、クリップを作り直す。認証は要らず、ジョブ ID を知っていれば誰でも呼べる。

## エンドポイント

| メソッド | パス | 権限 | 役割 |
|---|---|---|---|
| GET | `/api/jobs/{jobId}/highlights` | なし | 見どころの一覧を返す |
| POST | `/api/jobs/{jobId}/highlights/recover` | なし | 止まったままの作り直しを `FAILED` にする |
| PATCH | `/api/jobs/{jobId}/highlights/{highlightId}` | なし | 採否か、開始・終了を更新する |
| POST | `/api/jobs/{jobId}/highlights/{highlightId}/regenerate` | なし | クリップを作り直す |

## 入力と出力

一覧 (`GET`)。

- 出力は 200 で `{ highlights }`。`order` の昇順。各要素は[見どころ](../term/highlight.md)の項目に、`clipUrl` を足したもの
- `clipUrl` は、`clipStatus` が `GENERATED` のものだけにある。クリップへの署名付き URL で、有効 3,600 秒
- ジョブがまだ処理中でも、見どころがなければ空の配列を返す。ジョブの状態は見ない

復旧 (`POST .../recover`)。本文はない。

- `GENERATING` のまま、`clipGeneratingStartedAt` から 360 秒を過ぎた見どころを `FAILED` にする。出力は 200 で `{ recoveredHighlightIds }`。対象がなければ空の配列
- 画面は、一覧を取るたびに、先にこれを呼ぶ

更新 (`PATCH`)。本文は JSON オブジェクトで、次の項目のうち 1 つ以上。

| 項目 | 条件 |
|---|---|
| `status` | `accepted`、`unconfirmed`、`rejected` のどれか |
| `startSec`、`endSec` | 数値。0 以上の有限の数。更新後の開始が終了より小さい |

- 出力は 200 で更新後の見どころ。`clipUrl` は付かない
- `status` だけの更新は、そのまま保存する。作り直し中 (`GENERATING`) でも受ける
- `startSec` か `endSec` を含む更新は、クリップを作り直す。受け付けると次を行う
    1. 見どころを読む。ないときは 404
    2. `clipStatus` が `GENERATING` なら 409。作り直しを重ねない
    3. 採否が `accepted` か `rejected` なら `unconfirmed` に戻す
    4. `clipStatus` を `GENERATING` にし、`clipGeneratingStartedAt` を今にして保存する
    5. [クリップ再生成](../batch/clip-regenerate.md)の Lambda を、結果を待たずに (非同期で) 起動する。渡すのは `jobId`、`highlightId`、保存後の `startSec`、`endSec`
- 起動に失敗したときは、`clipStatus` を `FAILED` にして、保存した見どころを 200 で返す。Admin へ報告する (題名は「Web API: クリップ再生成起動エラー」)

作り直し (`POST .../regenerate`)。本文はない。

- 見どころを読み、`clipStatus` が `GENERATING` でなければ、`GENERATING` にして `clipGeneratingStartedAt` を今にし、Lambda を非同期で起動する。渡すのは保存済みの `startSec` と `endSec`。出力は 200 で `GENERATING` になった見どころ
- `clipStatus` が `GENERATED` のものでも作り直せる。採否は変えない
- 起動に失敗したときは、`clipStatus` を `FAILED` にして、例外を 500 にする

## エラー

本文は `{ error, message }` ([API のエラー応答](../term/api-error.md))。

| 条件 | 状態 | `error` | `message` |
|---|---|---|---|
| 一覧、復旧: ジョブがない | 404 | `JOB_NOT_FOUND` | 指定されたジョブが見つかりません |
| 更新、作り直し: 見どころがない | 404 | `HIGHLIGHT_NOT_FOUND` | 指定された見どころが見つかりません |
| 更新: 本文が JSON のオブジェクトでない、項目の型が違う、`status` が許可外 | 400 | `INVALID_REQUEST` | 更新内容が不正です |
| 更新: `startSec` と `endSec` が両方あり、開始が終了以上 | 400 | `INVALID_REQUEST` | 更新内容が不正です |
| 更新: 項目が 1 つもない、時刻が負か有限でない、保存済みの時刻と合わせて開始が終了以上 | 400 | `INVALID_REQUEST` | 更新内容が不正です |
| 更新、作り直し: すでに作り直している最中 (時刻の更新と作り直しだけ) | 409 | `CLIP_GENERATING` | クリップを作り直している最中のため、変更できません |
| 一覧: 想定外の例外 | 500 | `INTERNAL_SERVER_ERROR` | 見どころ一覧の取得に失敗しました |
| 復旧: 想定外の例外 | 500 | `INTERNAL_SERVER_ERROR` | 見どころの復旧に失敗しました |
| 更新: 想定外の例外 | 500 | `INTERNAL_SERVER_ERROR` | 見どころの更新に失敗しました |
| 作り直し: 想定外の例外 (起動の失敗を含む) | 500 | `INTERNAL_SERVER_ERROR` | クリップ再生成の開始に失敗しました |

- 更新の 404 は、`status` だけの更新ではドメインの検査 (保存済みの見どころを読む) で、時刻を含む更新では先に見どころを読む段で返す。どちらも同じ本文
- 「更新」は、ジョブが存在するかを確かめない。見どころの `jobId` と `highlightId` の組で探す
- 作り直しの状態の見方は[見どころ](../term/highlight.md)にある。条件付きの書き込みにはしていないので、別のタブなどから同時に呼ぶと、重なりうる

## つながり

```mermaid
flowchart TD
    H[見どころ確認画面] -->|一覧・復旧・更新・作り直し| A[見どころ API]
    A --> D[(見どころのテーブル)]
    A -->|署名付き URL| S[(S3 バケット)]
    A -->|非同期で起動| L[クリップ再生成]
    L --> S
    L --> D
    A -.->|500 の報告| E[(error-events テーブル)]
```
