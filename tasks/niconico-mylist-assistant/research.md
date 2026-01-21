# niconico-mylist-assistant 調査・研究ドキュメント

## 概要

このドキュメントは、niconico-mylist-assistant サービスの開発において収集した調査結果、既存実装の分析、技術検証の結果をまとめたものです。

---

## 既存実装の分析

### リポジトリ情報

- **リポジトリ**: [nagiyu/niconico-mylist-assistant](https://github.com/nagiyu/niconico-mylist-assistant)
- **実装言語**: Python + Selenium
- **稼働状況**: `register-batch` が現在稼働中（`register` は過去実装）

### 既存実装の構成

#### 1. Manager (Next.js フロントエンド + API Gateway)

- **役割**: ユーザーインターフェースの提供、API Routes による各種機能の提供
- **主要機能**:
    - 動画基本情報取得 API (`/api/music/info`)
    - 一括インポート API (`/api/music/bulk-import`)
    - DynamoDB との連携

#### 2. register-batch (Python + Selenium、AWS Batch)

- **役割**: バックグラウンドでのマイリスト一括登録処理
- **特徴**:
    - AWS Batch で実行（時間制限なし）
    - Selenium WebDriver でニコニコ動画を自動操作
    - 動画登録間に適切な待機時間を設定

#### 3. DynamoDB スキーマ

既存実装では以下のデータ構造を使用：

**注**: 以下のテーブル名は既存実装からの引用であり、仮称です。実装時に適切な命名規則に従って再定義します。

- **IMusicCommon（仮）**: 楽曲共通情報（全ユーザー共通）
    - `videoId`: 動画ID（パーティションキー）
    - `title`: 動画タイトル

- **IUserMusicSetting（仮）**: ユーザー個別設定
    - `userId`: Auth プロジェクトの UserID（パーティションキー）
    - `videoId`: 動画ID（ソートキー）
    - `isFavorite`: お気に入りフラグ
    - `isSkip`: スキップフラグ
    - `memo`: メモ

---

## データモデルの用語定義

### 動画基本情報（全ユーザー共通）

**定義**: ニコニコ動画から取得できる動画本体の情報。全ユーザーで共通のデータ。

**含まれるデータ**:
- 動画ID (`videoId`)
- 動画タイトル (`title`)
- ニコニコ動画 API から取得可能なその他の情報（サムネイル、再生時間、再生数など）

**特徴**:
- 全ユーザーで共有される
- ニコニコ動画 API (`getthumbinfo`) から取得
- DynamoDB の `IMusicCommon`（仮）テーブルに格納

### ユーザー設定情報（ユーザー固有）

**定義**: 各ユーザーが個別に設定するメタデータ。同じ動画でもユーザーごとに異なる値を持つ。

**含まれるデータ**:
- お気に入りフラグ (`isFavorite`)
- スキップフラグ (`isSkip`)
- メモ (`memo`)
- 曲名、作曲者などの追加メタデータ（将来拡張）

**特徴**:
- ユーザーごとに異なる値を持つ
- ユーザーが Web UI で編集可能
- DynamoDB の `IUserMusicSetting`（仮）テーブルに格納
- `userId` と `videoId` の組み合わせで一意に識別

### 用語の使い分け

本ドキュメント及び要件定義書では、以下のように用語を使い分ける：

- **「動画基本情報」または「動画メタデータ」**: ニコニコ動画から取得する全ユーザー共通の情報を指す
- **「ユーザー設定」または「ユーザー固有設定」**: お気に入りフラグ、スキップフラグなどユーザーごとに異なる設定を指す
- **「動画データ」**: 上記2つを合わせた総称として使用（文脈から明確な場合のみ）

**注意**: 「動画情報」という用語は曖昧さを避けるため、できるだけ「動画基本情報」「ユーザー設定」などの具体的な用語に置き換える。

---

## 技術選定の背景

### TypeScript + Playwright への移行理由

#### 現状の課題

既存実装は Python + Selenium で構築されているが、以下の理由から TypeScript + Playwright への移行を決定：

1. **プラットフォーム統一**: 本プラットフォームは TypeScript で統一されている
2. **型安全性**: TypeScript strict mode によるバグ削減
3. **メンテナンス性**: 単一言語での保守が容易
4. **パフォーマンス**: Playwright の方が Selenium より高速
5. **既存ノウハウ**: 本プラットフォームで既に E2E テストに Playwright を採用

#### Playwright vs Selenium 比較

| 項目 | Playwright | Selenium |
|------|-----------|----------|
| 実行速度 | 高速 | 比較的遅い |
| API 設計 | モダンで直感的 | 古典的 |
| 自動待機 | 組み込み | 明示的に記述 |
| TypeScript サポート | 公式サポート | サードパーティ型定義 |
| ブラウザ自動化 | Chromium/Firefox/WebKit | 主要ブラウザ |
| AWS Lambda 対応 | @sparticuz/chromium で可能 | 可能だが設定複雑 |

### AWS Batch の採用理由

- **時間制限なし**: Lambda の 15分制限を回避
- **100個一括処理**: チェーン実行不要でシンプル
- **安定性**: 長時間実行でも安定
- **コスト**: 使用時のみ課金

---

## ニコニコ動画 API 調査

### 動画基本情報取得 API

- **エンドポイント**: `https://ext.nicovideo.jp/api/getthumbinfo/{videoId}`
- **形式**: XML
- **レスポンス例**:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<nicovideo_thumb_response status="ok">
    <thumb>
        <video_id>sm12345678</video_id>
        <title>動画タイトル</title>
        <description>動画説明</description>
        <thumbnail_url>https://example.com/thumb.jpg</thumbnail_url>
        <length>5:30</length>
        <view_counter>12345</view_counter>
        <!-- その他のフィールド -->
    </thumb>
</nicovideo_thumb_response>
```

- **実装例**: 既存実装の `manager/app/api/music/utils/videoInfo.ts` にパース処理あり

---

## サービス仕様の整理

### 主要なユースケース（優先順位順）

#### 1. マイリスト一括登録（最優先）

**フロー**:
1. ユーザーが登録条件を指定（「スキップを除く」「お気に入りのみ」など）
2. 条件に合致する動画をDynamoDBから取得
3. ランダムに最大100個を選択
4. ニコニコアカウント情報（メールアドレス・パスワード）を入力
5. AWS Batch ジョブを投入
6. Playwright で自動ログイン → マイリスト登録（各動画間に最低2秒待機）
7. 完了時に Web Push 通知

**重要な制約**:
- 最大100個まで（一括処理、分割なし）
- 各動画登録間に**最低2秒**の待機時間（ニコニコ動画への配慮）
- **速度よりも安全性を優先**
- 既存のマイリストを全削除してから新しいマイリストを作成（マイリスト上限100件のため）

#### 2. 動画一括インポート（高優先度）

**フロー**:
1. ユーザーが動画ID（改行区切り）を入力
2. 各IDに対してニコニコ動画 API (`getthumbinfo`) を呼び出し
3. XML から動画タイトルを取得
4. 動画ID + タイトルを DynamoDB に保存（重複チェックあり）

**既存実装**: `manager/app/api/music/bulk-import/route.ts` に実装あり

#### 3. ユーザー設定管理（中優先度）

- お気に入りフラグの設定/解除
- スキップフラグの設定/解除
- メモの追加/編集
- 動画の削除

#### 4. キーワード検索（低優先度）

- Playwright でニコニコ動画を検索
- 動画IDとタイトルを抽出
- 将来的な対応として検討

---

## 技術的な制約と対策

### 1. ニコニコ動画の HTML 構造依存

**課題**:
- ニコニコ動画は SPA であり、HTML 構造が予告なく変更される可能性
- セレクタが突然使えなくなるリスク

**対策**:
- 複数の抽出戦略を並行実行（CSS セレクタ、JSON データ、正規表現など）
- いずれかが成功すれば OK とする
- 定期的な動作確認と迅速な対応

### 2. AWS Lambda のサイズ制限

**課題**:
- Playwright の Chromium バイナリが大きい
- Lambda Layer のサイズ制限（250MB 解凍時）

**対策**:
- `@sparticuz/chromium` を使用（軽量化された Chromium）
- AWS Batch を使用することで Lambda の制約を回避

### 3. ニコニコ動画の Rate Limiting

**課題**:
- 大量のリクエストを短時間に送信するとブロックされる可能性
- 非公式ツールとしてサーバーに過度な負荷をかけるべきではない

**対策**:
- 各動画登録間に**最低2秒**の待機時間
- 処理速度よりも安定性と安全性を重視
- リトライ機構は最大3回まで

---

## セキュリティに関する考慮事項

### ニコニコアカウント情報の取り扱い

**要件**:
- パスワードは DB に保存しない
- バッチ処理実行時のみメモリ上で保持
- 暗号化して送信（環境変数 `SHARED_SECRET_KEY` を使用）

**実装方針**:
- フロントエンド → API Routes: 暗号化して送信
- API Routes → AWS Batch: 環境変数経由で暗号化キーを渡す
- AWS Batch 内でのみ復号化して使用
- 処理終了後は即座にメモリから削除

### データアクセス制御

- ユーザーは自分が登録した動画データ（動画基本情報 + ユーザー設定）のみアクセス可能
- Auth プロジェクトの UserID でデータを分離
- DynamoDB の IAM ロールで制限

---

## パフォーマンス要件

| 項目 | 要件 |
|------|------|
| 動画基本情報取得応答時間 | 10秒以内 |
| 一括インポート応答時間 | 動画数に依存（1動画あたり1秒程度） |
| 1動画あたりの登録時間 | 制限なし（安全性優先） |
| バッチ処理タイムアウト | 制限なし（AWS Batch） |
| 動画登録間の待機時間 | **最低2秒**（必須） |
| 1回の登録可能動画数 | 最大100個 |

---

## UI/UX 設計方針

### 画面構成（優先順位順）

1. **マイリスト登録画面** (`/register`) - 最優先
    - 条件指定（スキップを除く、お気に入りのみ、など）
    - ニコニコアカウント情報入力
    - 登録開始ボタン

2. **一括インポート画面** (`/import`) - 高優先度
    - 動画ID入力（改行区切り）
    - インポート実行ボタン
    - 結果表示（成功数、失敗数、スキップ数）

3. **動画管理画面** (`/mylist`) - 中優先度
    - 動画一覧テーブル
    - お気に入り、スキップ、メモの編集

4. **ホーム画面** (`/`) - 低優先度
    - サービス概要
    - Google ログイン

5. **キーワード検索画面** (`/search`) - 低優先度（将来対応）

### レスポンシブ対応

- **スマホファースト**: 本プラットフォームの方針に従う
- タッチ操作に最適化
- 横幅 768px 未満で 1カラムレイアウト

---

## 開発フェーズ

### Phase 1: Core パッケージ実装

1. 型定義 (`types/`)
2. 定数定義 (`constants.ts`)
3. Playwright Helper (`automation/playwright-helper.ts`)
4. 自動化ロジック (`automation/`)
5. 動画基本情報取得 (`api/video-info.ts`)
6. ユニットテスト（カバレッジ 80%以上）

### Phase 2: Web パッケージ実装

1. Next.js プロジェクトセットアップ
2. 認証（Google OAuth）
3. API Routes 実装
4. フロントエンド実装（Material-UI）
5. E2E テスト

### Phase 3: Batch パッケージ実装

1. AWS Batch ジョブ実装
2. Playwright によるマイリスト登録
3. エラーハンドリング
4. Integration Test

### Phase 4: インフラ実装

1. AWS CDK スタック作成
2. DynamoDB テーブル定義
3. AWS Batch 環境構築
4. デプロイパイプライン

---

## スコープ外（将来的な対応）

- ❌ 動画IDリストを直接入力して即座に登録する機能
- ❌ 他の動画サイトへの対応（YouTube、bilibili等）
- ❌ マイリストの複数管理
- ❌ スケジュール実行（定期的な自動登録）
- ❌ 動画のプレビュー・再生機能
- ❌ 既存データの移行機能（Python版からの移行）
- ❌ 動画のダウンロード機能

---

## 参考資料

### 既存実装リポジトリ

- [niconico-mylist-assistant (Python版)](https://github.com/nagiyu/niconico-mylist-assistant)
    - `register-batch/register.py`: 現在稼働中の実装
    - `manager/app/api/music/info/route.ts`: 動画基本情報取得 API
    - `manager/app/api/music/bulk-import/route.ts`: 一括インポート API

### 技術ドキュメント

- [Playwright 公式ドキュメント](https://playwright.dev/)
- [AWS Batch 公式ドキュメント](https://docs.aws.amazon.com/batch/)
- [ニコニコ動画 API (非公式)](https://ext.nicovideo.jp/api/getthumbinfo/)

---

## 備考

### 開発方針の要点

1. **安全性優先**: ニコニコ動画のサーバーに配慮し、速度よりも安全性を重視
2. **段階的な実装**: まずは Core パッケージから着手、テストを書きながら進める
3. **既存実装の参考**: Python 版の動作確認済みロジックを参考にする
4. **ドキュメント駆動**: 要件定義 → アーキテクチャ → 実装の順で進める

### 重要な注意事項

- `register` と `register-batch` の2つが既存リポジトリにあるが、**現行動いているのは register-batch のみ**
- Lambda の時間制限を気にする必要はない（AWS Batch を使用）
- 30個単位でのチェーン実行は不要（100個まで一括処理）

---

**最終更新日**: 2026-01-14
