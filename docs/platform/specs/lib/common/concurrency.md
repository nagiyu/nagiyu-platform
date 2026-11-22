---
sources:
  - libs/common/src/concurrency/run-with-concurrency.ts
  - libs/common/src/concurrency/run-settled-with-concurrency.ts
  - libs/common/src/concurrency/error-messages.ts
sources_hash: 44012428d6e60804c0ab93411bb29c18031168242189a48ff2cde0def1667b4e
---

# 同時実行数を制限したタスクの実行

タスクの配列を、同時に動かす数に上限を付けて実行する。失敗したら止める `runWithConcurrency` と、全件の成否を集める `runSettledWithConcurrency` の 2 つがある。メインの `@nagiyu/common` から import する。

## 使い方

| 関数 | 引数 | 戻り値 |
|---|---|---|
| `runWithConcurrency(tasks, concurrency)` | タスクの配列、同時実行数 | 結果の配列 (入力と同じ順) |
| `runSettledWithConcurrency(tasks, concurrency, options?)` | 同上、`RunSettledWithConcurrencyOptions` | `{ results, skippedCount }` |

- タスクは、引数を取らず `Promise` を返す関数。呼び出されるまで処理は始まらない
- `concurrency` は 1 以上の整数。そうでなければ `同時実行数は 1 以上の整数で指定してください` の `Error` を投げる

```typescript
const { results, skippedCount } = await runSettledWithConcurrency(tasks, 5, {
  shouldSkip: () => Date.now() > deadline,
  jitterMs: 200,
});
```

### `RunSettledWithConcurrencyOptions`

| 項目 | 既定値 | 内容 |
|---|---|---|
| `shouldSkip` | なし | 各タスクを始める前に呼ぶ。`true` を返した時点以降、まだ始めていないタスクを実行しない |
| `jitterMs` | 0 | 各タスクを始める前に入れる、ランダムな遅延の上限 (ミリ秒)。0 なら遅延なし |

## 振る舞い

### 実行の流れ

- 動かす作業者の数は `min(concurrency, タスクの数)`。各作業者が、次のタスクを順に取って実行する。タスクは配列の順に始まる
- タスクが空のときは、すぐに空の結果を返す

### `runWithConcurrency`

| 状況 | 動作 |
|---|---|
| すべて成功 | 結果を入力と同じ順に並べて返す |
| どれかが失敗 | 新しいタスクを始めない。動いているタスクがすべて終わるのを待ってから、最初に起きたエラーで reject する |

### `runSettledWithConcurrency`

- 1 つ失敗しても残りを続け、reject しない
- `results` は `PromiseSettledResult` の配列で、入力の順に並ぶ。スキップしたタスクは含まない
- `skippedCount` は、スキップしたタスクの数
- `shouldSkip` は、タスクを始める前に 1 回ずつ呼ぶ。一度 `true` を返すと、そのあとは呼ばずに、残りのタスクをすべてスキップする。すでに動いているタスクは止めない。スキップされるのは配列の末尾側のタスクで、`results` は先頭からの連続した範囲になる
- `jitterMs` が 0 より大きいと、タスクを始めるたびに、0 以上 `jitterMs` 未満のランダムなミリ秒を待つ

## 理由

- `runWithConcurrency` は、失敗したあとも動いているタスクの終了を待ってから reject する。reject した時点で裏にタスクが残らないため、呼び出し側が失敗時に書いた状態を、あとから終わったタスクの副作用が上書きしない
- `runSettledWithConcurrency` は reject しない。呼び出し側が一部の失敗を許して、件数の集計や失敗の再送出を自分で決められるようにするため
- `runSettledWithConcurrency` のスキップの判定とジッターは、全作業者で順番に行う。並行に待つと、立ち上がりで同時実行数ぶんがほぼ同時に始まり、ジッターで接続の集中を和らげる意味がなくなるため
- スキップの判定が一度 `true` になったら戻さない。時間の予算を超えたあとに判定が揺れて、後続のタスクだけが動くのを避けるため
