# 動画情報共有のバグ修正

## 概要

Niconico Mylist Assistant において、User A が一括インポートで追加した動画が User B から閲覧できないバグを修正する。

設計上、動画基本情報（VIDEO エンティティ）は全ユーザー共通のデータとして管理され、ユーザー設定（USER_SETTING エンティティ）は各ユーザー固有のデータとして管理されている。しかし、現在の `listVideosWithSettings` 関数の実装では、ユーザー設定が存在する動画のみを返すロジックになっており、他ユーザーが追加した動画基本情報が取得できない。

## 関連情報

- Issue: GitHub Issue（動画情報が共有されない）
- タスクタイプ: サービスタスク（Niconico Mylist Assistant）
- 影響範囲: `@nagiyu/niconico-mylist-assistant-core` パッケージ

## 要件

### 機能要件

- **FR1**: 全ユーザーが追加した動画基本情報を、全ユーザーが閲覧可能にする
- **FR2**: 各ユーザーは自分のユーザー設定（お気に入り、スキップ、メモ）のみを閲覧・編集可能にする
- **FR3**: 動画一覧取得時、動画基本情報とユーザー設定を正しくマージして返す
- **FR4**: フィルタリング（お気に入り、スキップ）は各ユーザーの設定に基づいて適用する
- **FR5**: ページネーション（offset/limit）が正しく機能する

### 非機能要件

- **NFR1**: テストカバレッジ 80% 以上を維持する
- **NFR2**: 既存のAPI仕様（`api-spec.md`）に準拠し、後方互換性を保つ
- **NFR3**: DynamoDB の効率的なアクセスパターンを維持する
- **NFR4**: パフォーマンスの劣化を最小限に抑える

## 問題の詳細

### 現在の実装の問題点

`services/niconico-mylist-assistant/core/src/db/videos.ts` の `listVideosWithSettings` 関数において：

1.  **ユーザー設定を起点に動画を取得**している（191-203行目）
    ```typescript
    // DynamoDBからユーザーの全設定を取得
    const allSettings: UserVideoSetting[] = [];
    let lastKey: Record<string, string> | undefined;
    do {
      const result = await listUserVideoSettings(userId, { ... });
      allSettings.push(...result.settings);
      lastKey = result.lastEvaluatedKey;
    } while (lastKey);
    ```

2.  **ユーザー設定が存在しない場合の処理に問題**（206-220行目）
    - フィルタが指定されている場合は空配列を返す
    - フィルタが指定されていない場合のみ、全動画を返す
    - しかし、**フィルタの有無に関わらず、全動画を取得してからフィルタリングすべき**

3.  **結果として**
    - User A が動画を追加 → User A の USER_SETTING が作成される
    - User B がアクセス → User B の USER_SETTING が存在しないため、User A が追加した動画が見えない

### 期待される動作

1.  **全ての動画基本情報（VIDEO エンティティ）を取得**する
2.  **該当ユーザーのユーザー設定（USER_SETTING エンティティ）を取得**する
3.  **動画基本情報を起点として、ユーザー設定をマージ**する
    - ユーザー設定が存在する動画 → マージして返す
    - ユーザー設定が存在しない動画 → 動画基本情報のみ返す（userSettingはundefined）
4.  **フィルタリングを適用**する
    - `isFavorite` が指定されている場合 → ユーザー設定が存在し、かつ条件に一致する動画のみ
    - `isSkip` が指定されている場合 → ユーザー設定が存在し、かつ条件に一致する動画のみ
    - フィルタが指定されていない場合 → 全動画を返す
5.  **ページネーションを適用**する

## 実装方針

### 修正対象

- `services/niconico-mylist-assistant/core/src/db/videos.ts` の `listVideosWithSettings` 関数

### 修正内容

1.  **全動画基本情報の取得**
    - `getVideoRepository().listAll()` を使用して全動画を取得

2.  **ユーザー設定の取得**
    - `listUserVideoSettings()` を使用してユーザーの全設定を取得
    - Map で videoId をキーとして管理

3.  **動画基本情報とユーザー設定のマージ**
    - 全動画を起点として、ユーザー設定をマージ
    - ユーザー設定が存在しない場合は userSetting を undefined にする

4.  **フィルタリングロジックの修正**
    - `isFavorite` フィルタ: ユーザー設定が存在し、かつ isFavorite が一致
    - `isSkip` フィルタ: ユーザー設定が存在し、かつ isSkip が一致
    - フィルタ未指定: 全動画を返す

5.  **ソート順の考慮**
    - 動画の作成日時（CreatedAt）の降順でソート
    - 新しい動画が上に表示されるように

### 考慮事項

1.  **パフォーマンス**
    - 全動画を取得するため、動画数が多い場合はメモリ使用量が増加
    - 現在の実装でも全ユーザー設定を取得しているため、大きな変化はない
    - 将来的には GSI（Global Secondary Index）や ElasticSearch の導入を検討（コメントで記載済み）

2.  **テストの追加・修正**
    - 既存テストの修正: ユーザー設定が存在しない動画も取得できることを確認
    - 新規テストの追加: 複数ユーザーで動画が共有されることを確認

3.  **後方互換性**
    - API レスポンスの形式は変更なし
    - フィルタリングの挙動は変更されるが、これはバグ修正のため許容される

## タスク

### Phase 1: 実装の準備

- [ ] `listVideosWithSettings` 関数の現在のロジックを詳細に理解する
- [ ] 既存テストを確認し、修正が必要なテストをリストアップする
- [ ] ビルド・テスト環境を確認する

### Phase 2: コア実装

- [ ] `listVideosWithSettings` 関数を修正する
    - 全動画基本情報の取得
    - ユーザー設定のMap作成
    - 動画基本情報とユーザー設定のマージ
    - フィルタリングロジックの修正
    - ソート処理の追加（CreatedAt 降順）
- [ ] 型定義に変更が必要な場合は修正する

### Phase 3: テストの追加・修正

- [ ] 既存テストを修正する
    - `services/niconico-mylist-assistant/core/tests/unit/list-videos.test.ts`
    - `services/niconico-mylist-assistant/core/tests/unit/videos.test.ts`
- [ ] 新規テストを追加する
    - 複数ユーザーで動画が共有されるケース
    - ユーザー設定が存在しない動画が取得できるケース
    - フィルタリングが正しく動作するケース
- [ ] テストカバレッジ 80% 以上を確認する

### Phase 4: 検証とドキュメント更新

- [ ] ビルドが成功することを確認する
- [ ] 全テストが合格することを確認する
- [ ] E2E テストが合格することを確認する（必要に応じて）
- [ ] コードレビューを実施する
- [ ] ドキュメントの更新（必要な場合）

## 参考ドキュメント

- [Niconico Mylist Assistant アーキテクチャ](../docs/services/niconico-mylist-assistant/architecture.md)
- [Niconico Mylist Assistant 要件定義](../docs/services/niconico-mylist-assistant/requirements.md)
- [コーディング規約](../docs/development/rules.md)
- [テスト戦略](../docs/development/testing.md)
- [データアクセス層](../docs/development/data-access-layer.md)

## 備考・未決定事項

### パフォーマンスの改善（将来対応）

現在の実装では全動画をメモリに読み込むため、動画数が極端に多い場合はパフォーマンスの問題が発生する可能性がある。ただし、以下の理由から現時点では問題ないと判断：

1.  マイリスト登録は最大100件の制約がある
2.  ユーザー数が少ない初期段階では動画総数も限定的
3.  既存の実装でも全ユーザー設定を取得しているため、大きな変化はない

将来的にスケールアップが必要になった場合は、以下の対策を検討：

-   GSI（Global Secondary Index）の追加でクエリ効率化
-   ElasticSearch などの検索エンジンの導入
-   キャッシュ層（Redis等）の追加
-   ページネーションを cursor ベースに変更

### ソート順について

現在の実装ではソート順が明示的に定義されていない。修正実装では `CreatedAt` の降順（新しい動画が上）でソートすることを推奨するが、要件に応じて変更可能。
