# Niconico Mylist Assistant 一括登録の件数バリデーション修正

## 概要

Niconico Mylist Assistant の一括登録機能において、DynamoDBの総件数が100件を超えている状態で件数を指定して登録しようとすると、正しく絞り込みが行われず、「バッチジョブの投入に失敗しました」というエラーが表示される問題を修正する。

## 関連情報

- **タスクタイプ**: サービスタスク（niconico-mylist-assistant）
- **影響範囲**: Web API（/api/mylist/register）およびcore ライブラリ（listVideosWithSettings関数）

## 問題の詳細

### 現在の動作

1. ユーザーがWebフォームで登録する最大動画数（1-100件）とフィルタ条件（お気に入りのみ、スキップ除外）を指定
2. `/api/mylist/register` APIが`listVideosWithSettings`を`limit: 1000, offset: 0`で呼び出し
3. `listVideosWithSettings`内部で以下の処理を実行：
    - DynamoDBから全ユーザー設定を取得（do-whileループで全件取得）
    - フィルタリング適用（お気に入り、スキップ条件）
    - **フィルタ後の結果から`offset`と`limit`でページネーション**
4. 取得した動画をランダムシャッフルして`maxCount`件選択

### 問題点

**問題1**: `limit`パラメータの意味の誤解

- 現在の実装では、`limit: 1000`は「フィルタ後の結果から1000件取得」という意味
- しかし、この使い方では以下の問題が発生：
    - フィルタ後の結果が1000件を超える場合、最初の1000件しか取得されない
    - 残りの動画はランダム選択の対象にならず、**絞り込みの偏りが発生**
    - DynamoDB総件数が100件を超えている場合でも、フィルタ条件によっては100件以上の動画が取得される可能性がある

**問題2**: ランダム選択の対象範囲の制限

- `listVideosWithSettings`が返す動画数が`limit`パラメータで制限されるため、真にランダムな選択ができない
- 例：フィルタ後の結果が2000件ある場合、最初の1000件からのみ選択され、後半の1000件は選択対象外

**問題3**: パフォーマンスとメモリ使用量

- フィルタ後の結果が大量（例：500件）にある場合、ランダムシャッフルで不要なメモリとCPUを消費
- 実際には最大100件しか使わないのに、500件すべてをシャッフルする無駄がある

### 期待される動作

1. DynamoDBの総件数に関係なく、フィルタ条件に合うすべての動画を対象にランダム選択
2. 指定した`maxCount`件（最大100件）だけをバッチジョブに渡す
3. フィルタ後の結果が何件あっても、正しくランダムに`maxCount`件を選択

## 要件

### 機能要件

**FR1**: フィルタ後の全動画からランダム選択

- フィルタ条件（お気に入りのみ、スキップ除外）に合う動画をすべて対象にランダム選択
- `limit`パラメータによる偏りをなくす

**FR2**: 指定件数の保証

- ユーザーが指定した`maxCount`件（1-100）を正確に選択
- ただし、フィルタ後の動画数が`maxCount`未満の場合は、存在する分だけ選択

**FR3**: エラーメッセージの明確化

- フィルタ後の動画が0件の場合は、既存のエラーメッセージ「登録可能な動画が見つかりませんでした」を表示
- その他のエラーも適切なメッセージで表示

### 非機能要件

**NFR1**: パフォーマンス

- フィルタ後の動画数が多い場合でも、効率的にランダム選択を実行
- 不要なメモリ消費を避ける（全件シャッフル→slice ではなく、必要な件数だけ選択）

**NFR2**: テストカバレッジ

- フィルタ後の動画数が100件超のケースをユニットテストで検証
- 100件未満のケースも引き続き正常動作することを検証
- カバレッジ80%以上を維持

**NFR3**: 後方互換性

- 既存のAPIインターフェース（リクエスト/レスポンス形式）を変更しない
- `listVideosWithSettings`関数のシグネチャを変更する場合は、他の呼び出し元への影響を確認

## 実装方針

### 方針1: ランダム選択を`listVideosWithSettings`の前に移動（推奨）

**メリット**:

- `listVideosWithSettings`の責務を明確に保つ（フィルタリングとページネーション）
- API層でランダム選択のロジックを制御できる
- 既存の呼び出し元（`/api/videos`など）に影響しない

**デメリット**:

- ランダム選択のために全件取得が必要
- フィルタ後の動画数が多い場合、メモリ消費が増える

**実装方法**:

1. `/api/mylist/register`内で、`listVideosWithSettings`を`limit`指定なし（または十分大きな値）で呼び出し
2. 取得した全動画からReservoir Samplingアルゴリズムでランダムに`maxCount`件を選択
3. 選択した動画をバッチジョブに渡す

### 方針2: `listVideosWithSettings`にランダム選択機能を追加

**メリット**:

- データベース層で効率的にランダム選択を実行できる
- API層のコードがシンプルになる

**デメリット**:

- `listVideosWithSettings`の責務が増える
- 他の呼び出し元でランダム選択が不要な場合、オプションパラメータが増える
- テストが複雑になる

**実装方法**:

1. `listVideosWithSettings`に`randomLimit`オプションパラメータを追加
2. フィルタ後の結果からReservoir Samplingでランダム選択
3. `/api/mylist/register`から`randomLimit: body.maxCount`で呼び出し

### 方針3: 新しい関数`selectRandomVideos`を作成（推奨）

**メリット**:

- 単一責任の原則に従った設計
- テストが容易
- 既存コードへの影響を最小化

**デメリット**:

- 関数が1つ増える

**実装方法**:

1. `core/src/db/videos.ts`に新しい関数`selectRandomVideos`を追加
2. この関数は以下の処理を実行：
    - `listVideosWithSettings`を内部で呼び出し（全件取得）
    - Reservoir Samplingでランダムに`maxCount`件を選択
    - 選択した動画を返す
3. `/api/mylist/register`から`selectRandomVideos`を呼び出し

### 推奨する実装方針

**方針3: 新しい関数`selectRandomVideos`を作成**

理由：

- 単一責任の原則に従い、コードの保守性が高い
- 既存の`listVideosWithSettings`を変更せず、他の呼び出し元に影響しない
- テストが容易で、ランダム選択のロジックを独立してテストできる

## 実装タスク

### Phase 1: 調査と設計

- [x] 問題の原因を特定
- [x] 実装方針を決定
- [x] 既存の`listVideosWithSettings`の呼び出し元を確認
- [x] Reservoir Samplingアルゴリズムの実装方法を確認

#### 調査結果（2026-02-16）

- **Algorithm R の採用方針**:
    - 先頭 `k` 件で初期リザーバを構築し、`i = k..n-1` の各要素で `j = floor(random() * (i + 1))` を生成
    - `j < k` の場合のみ置換することで、各要素が最終的に選ばれる確率を `k/n` に保つ
- **TypeScript 実装案**:
    - 関数シグネチャ: `reservoirSampling<T>(items: readonly T[], k: number, random: () => number = Math.random): T[]`
    - `random` を引数化してテスト時の決定的検証を可能にする
    - 返却値は新規配列とし、入力配列を破壊しない
- **エッジケース方針**:
    - `k <= 0` の場合は `[]` を返す（`k = 0` を含む）
    - `items.length === 0` の場合は `[]` を返す（`n = 0`）
    - `k >= items.length` の場合は `[...]items` を返す（`k >= n`）
- **テスト戦略案**:
    - `k >= n`、`k = 0`、`n = 0` の境界値テストを固定化
    - `random` に固定シーケンスを注入して置換ロジックの分岐（`j < k` / `j >= k`）を再現
    - 統計的性質（厳密確率）ではなく、アルゴリズム手順と返却件数・重複なしをユニットテストで保証

### Phase 2: 実装

- [ ] **T001**: `core/src/db/videos.ts`の`listVideosWithSettings`関数を修正
    - `limit`パラメータのデフォルト値を`undefined`に変更（未指定時は全件取得）
    - 既存の呼び出し元（`/api/videos/route.ts`）への影響を確認
    - テストコードで`limit`未指定のケースの挙動変更を確認
- [ ] **T002**: `core/src/db/videos.ts`に`selectRandomVideos`関数を追加
    - フィルタ条件を受け取り、フィルタ後の全動画を取得（`limit`未指定で呼び出し）
    - Reservoir Samplingでランダムに`maxCount`件を選択
    - 選択した動画を返す
- [ ] **T003**: `/api/mylist/register/route.ts`を修正
    - `listVideosWithSettings`の呼び出しを`selectRandomVideos`に変更
    - ランダムシャッフルのコードを削除（selectRandomVideos内で実施）
- [ ] **T004**: エラーハンドリングの確認
    - フィルタ後の動画が0件の場合のエラーメッセージが適切か確認
    - その他のエラーケースも適切に処理されているか確認

### Phase 3: テスト

- [ ] **T005**: `core/tests/unit/list-videos.test.ts`を更新
    - `limit`未指定時の挙動変更に対応するテストケースを追加
- [ ] **T006**: `core/tests/unit/select-random-videos.test.ts`を作成
    - フィルタ後の動画数が100件未満の場合のテスト
    - フィルタ後の動画数が100件ちょうどの場合のテスト
    - フィルタ後の動画数が100件超の場合のテスト（例：150件から100件選択）
    - フィルタ後の動画数が0件の場合のテスト
    - 各フィルタ条件（お気に入りのみ、スキップ除外）が正しく動作することの検証
- [ ] **T007**: `/api/mylist/register`のE2Eテストを実行
    - 既存のE2Eテストが引き続き成功することを確認
    - 必要に応じて、100件超のケースをテストに追加
- [ ] **T008**: テストカバレッジの確認
    - ビジネスロジック（`selectRandomVideos`）のカバレッジが80%以上であることを確認

### Phase 4: 検証とデプロイ

- [ ] **T009**: ローカル環境で動作確認
    - DynamoDBローカルまたはモックで100件超のデータを用意
    - Webフォームから一括登録を実行し、正しく動作することを確認
- [ ] **T010**: コードレビュー
    - `code_review`ツールで自動レビューを実施
    - レビューコメントに対応
- [ ] **T011**: セキュリティスキャン
    - `codeql_checker`ツールでセキュリティ脆弱性をスキャン
    - 問題があれば修正
- [ ] **T012**: ドキュメント更新
    - 必要に応じて、`docs/services/niconico-mylist-assistant/`配下のドキュメントを更新

## 技術スタック

- **言語**: TypeScript (strict mode)
- **ライブラリ**: 
    - `@nagiyu/niconico-mylist-assistant-core` - データアクセス層
    - AWS SDK v3 - DynamoDB, AWS Batch
- **テスト**: Jest, aws-sdk-client-mock

## アルゴリズム詳細: Reservoir Sampling

Reservoir Samplingは、大量のデータから一定数のランダムサンプルを効率的に選択するアルゴリズムです。

**基本的な実装（Algorithm R）**:

```typescript
function reservoirSampling<T>(items: T[], k: number): T[] {
    if (items.length <= k) {
        return [...items]; // k件以下なら全件返す
    }

    const reservoir: T[] = [];

    // 最初のk件を確保
    for (let i = 0; i < k; i++) {
        reservoir.push(items[i]);
    }

    // k+1件目以降を確率的に置き換え
    for (let i = k; i < items.length; i++) {
        const j = Math.floor(Math.random() * (i + 1));
        if (j < k) {
            reservoir[j] = items[i];
        }
    }

    return reservoir;
}
```

**特徴**:

- 各要素が選ばれる確率が均等（k/n）
- メモリ使用量がO(k)で一定
- 時間計算量がO(n)

**注意点**:

- この実装では全要素を一度配列に読み込む必要があるため、メモリ使用量はO(n)
- しかし、ランダムシャッフル（Fisher-Yates）の時間計算量O(n)とメモリO(n)に比べ、k件しか保持しないため実用的には効率的

## 受け入れ基準

以下の全てを満たすこと：

- [ ] DynamoDBの総件数が100件未満の場合、正常に動作する
- [ ] DynamoDBの総件数が100件ちょうどの場合、正常に動作する
- [ ] DynamoDBの総件数が100件を超える場合（例：150件）でも、正常に`maxCount`件（例：50件）を選択できる
- [ ] フィルタ条件（お気に入りのみ、スキップ除外）が正しく適用される
- [ ] フィルタ後の動画数が0件の場合、適切なエラーメッセージが表示される
- [ ] テストカバレッジが80%以上である
- [ ] 既存のE2Eテストが引き続き成功する
- [ ] コードレビューで指摘された問題がすべて解決されている
- [ ] セキュリティスキャンで脆弱性が検出されていない、または修正済みである

## 参考ドキュメント

- [コーディング規約](../docs/development/rules.md)
- [テスト戦略](../docs/development/testing.md)
- [データアクセス層設計](../docs/development/data-access-layer.md)
- [Reservoir Sampling - Wikipedia](https://en.wikipedia.org/wiki/Reservoir_sampling)

## 備考・未決定事項

### 検討事項1: `listVideosWithSettings`のlimitパラメータの扱い

現在の`listVideosWithSettings`は、`limit`と`offset`を使ったページネーションを実装しています。しかし、一括登録のユースケースでは、全件を取得してランダム選択する必要があります。

**オプション1**: `limit`を指定せず（またはundefined）に呼び出す

- 現在の実装では、`limit`のデフォルト値は50（videos.ts:186行目）
- 全件取得するには、十分大きな値（例：10000）を指定する必要がある

**オプション2**: `listVideosWithSettings`に`limit`のデフォルト値を変更（採用）

- デフォルト値を`undefined`にし、未指定の場合は全件取得するように変更
- ただし、これは既存の呼び出し元に影響する可能性がある

**決定**: オプション2を採用する。既存の呼び出し元への影響を確認する必要がある。

**既存の呼び出し元の確認結果（2026-02-16）**：

1. `services/niconico-mylist-assistant/web/src/app/api/videos/route.ts:117`
    - 呼び出し: `limit` / `offset` を明示指定
    - 影響: なし（デフォルト値変更の影響を受けない）
2. `services/niconico-mylist-assistant/web/src/app/api/mylist/register/route.ts:209`
    - 呼び出し: `limit: MAX_VIDEOS_TO_FETCH` / `offset: 0` を明示指定
    - 影響: なし（デフォルト値変更の影響を受けない）
    - 対応: T003 で `selectRandomVideos` に置き換え予定
3. `services/niconico-mylist-assistant/core/tests/unit/list-videos.test.ts`
    - 呼び出し: 9箇所（明示指定1箇所、未指定8箇所）
    - 影響: あり（未指定ケースの期待値が「50件制限あり」前提の場合は更新が必要）
    - 対応: T005 で未指定ケースのテスト期待値を確認・必要に応じて修正

### 検討事項2: パフォーマンスの最適化

現在の`listVideosWithSettings`は、全ユーザー設定を一度にメモリに読み込んでからフィルタリングしています（videos.ts:193-203行目）。

**決定**: バッチ処理であるため、パフォーマンス最適化は考慮不要。現在の実装を維持する。

### 検討事項3: ランダム性の品質

`Math.random()`を使用したReservoir Samplingは、暗号学的に安全ではありませんが、一括登録のユースケースでは十分な品質です。

**決定**: `Math.random()`で十分。ある程度ランダムであれば問題ない。高品質なランダム性は考慮不要。

### 検討事項4: エラーメッセージの改善

現在のエラーメッセージ「バッチジョブの投入に失敗しました」は汎用的すぎるため、ユーザーが問題の原因を特定しづらい可能性があります。

**決定**: 将来的な改善課題とする。本タスクでは既存のエラーメッセージを維持する。
