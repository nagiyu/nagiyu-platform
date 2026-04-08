<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に docs/services/quick-clip/requirements.md に統合して削除します。
-->

# さくっとクリップ - 感情スコアによる見どころ抽出（F-009）要件定義

---

## 1. ビジネス要件

### 1.1 背景・目的

**背景**:

既存の見どころ抽出は映像変化量（motion）と音量（volume）の2要素のみで、発言内容の感情的な盛り上がりを考慮できない。ゲーム実況アーカイブのような長時間配信から「笑いが多い場面」「テンションが上がる場面」を切り出したいニーズに対応できていない。

**目的**:

OpenAI の文字起こし API（gpt-4o-mini-transcribe）+ 感情分析（gpt-5-mini）を組み合わせ、発言内容の感情的強度を見どころスコアの第3要素として追加する。将来のパート分割機能（時間範囲ごとにクリップ数を指定して抽出）への拡張も考慮した設計とする。

### 1.2 対象ユーザー

`docs/services/quick-clip/requirements.md` に同じ（動画投稿者）。

**主な想定コンテンツ**: ゲーム実況アーカイブ・バラエティ配信（長時間配信からまとめ動画を作成するユースケース）

### 1.3 ビジネスゴール

- `docs/services/quick-clip/requirements.md` の 1.3 に記載の「将来的な高精度化」を一部実現する
- 感情フィルタにより、同一動画でもユーザーの意図に応じた見どころ選択が可能になる

---

## 2. 機能要件

### 2.1 ユースケース

#### UC-005: 感情フィルタ指定付きジョブ作成

- **概要**: ジョブ作成時に感情フィルタを指定し、見どころ抽出に感情スコアを加える
- **アクター**: 動画投稿者
- **前提条件**: `OPENAI_API_KEY` が設定されている
- **正常フロー**:
    1. ユーザーが動画をアップロードする（既存 UC-001 と同様）
    2. （オプション）ユーザーが感情フィルタを指定する（`laugh` / `excite` / `touch` / `tension` / `any`）
    3. システムがジョブを作成し、Batch ジョブを投入する（感情フィルタを Batch 環境変数として渡す）
    4. Batch が音声ファイルの文字起こしを行う（gpt-4o-mini-transcribe）
    5. Batch が文字起こし結果から感情スコアを算出する（gpt-5-mini）
    6. motion・volume・emotion の3ソースから最大20件のハイライトを round-robin で抽出する
    7. 感情スコア由来のハイライトに `source: 'emotion'`・`dominantEmotion` が付与される
- **代替フロー**:
    - `OPENAI_API_KEY` が未設定の場合: 感情分析をスキップし、motion・volume のみで抽出する（既存動作）
    - 文字起こし結果が空（無音・非音声動画）の場合: 感情スコアを空配列として扱い、emotion ソースなしで抽出する
- **例外フロー**:
    - OpenAI API 呼び出しが失敗した場合（リトライ上限超過）: 感情分析をスキップし、motion・volume のみで抽出を続行する（ジョブ全体は FAILED にしない）

### 2.2 機能一覧（変更・追加分のみ）

既存の機能一覧（`docs/services/quick-clip/requirements.md` の 2.2）に対して、F-009 を以下の内容に更新する:

| 機能ID | 機能名 | 説明 | 優先度 |
| ------ | ------ | ---- | ------ |
| F-009 | 感情スコアによる見どころ抽出 | 文字起こし（gpt-4o-mini-transcribe）と感情分析（gpt-5-mini）から感情スコアを算出し、motion・volume と並列の第3ソースとして見どころ抽出に使用する。感情フィルタ（laugh/excite/touch/tension/any）でスコアリング対象の感情カテゴリを指定できる | 高（Phase 2） |

### 2.3 受け入れ条件

- `OPENAI_API_KEY` 設定済みの環境でジョブを実行すると、音声がある動画では `source: 'emotion'` のハイライトが1件以上抽出される
- 感情スコア由来のハイライトに `dominantEmotion` が設定されている
- `OPENAI_API_KEY` 未設定時は既存の motion・volume のみの動作と変わらない（既存テストが全てパスする）
- OpenAI API 呼び出しが失敗してもジョブ全体は FAILED にならず、motion・volume のみで COMPLETED になる
- 感情フィルタが `any` の場合、4カテゴリ（laugh/excite/touch/tension）の最大値でスコアリングされる

---

## 3. 非機能要件

### 3.1 パフォーマンス要件

| 項目 | 要件 |
| ---- | ---- |
| 感情分析追加後の処理時間増加 | +60秒以内（目安）。文字起こし + 感情分析 API 呼び出しのオーバーヘッド |
| API 呼び出し増加数 | 動画1本あたり +2回（gpt-4o-mini-transcribe × 1、gpt-5-mini × 1） |

### 3.2 セキュリティ要件

- `OPENAI_API_KEY` は環境変数で管理し、コードにハードコードしない
- Lambda（Web）から Batch Job の `containerOverrides.environment` 経由で安全に渡す

### 3.3 その他の非機能要件

- 感情分析は任意機能（`OPENAI_API_KEY` 未設定時は完全に無効化）
- OpenAI API 呼び出し失敗は graceful degradation（既存 motion・volume 抽出は継続）

---

## 4. ドメインオブジェクト

既存のドメインオブジェクト（`docs/services/quick-clip/requirements.md` の 4）に以下を追加:

| エンティティ | 説明 |
| ----------- | ---- |
| EmotionScore | 動画内セグメント単位で算出された感情カテゴリ別スコア（laugh/excite/touch/tension: 各 0.0〜1.0） |
| EmotionLabel | 感情カテゴリの識別子（laugh / excite / touch / tension） |
| EmotionFilter | 見どころ抽出で使用する感情カテゴリの指定（laugh / excite / touch / tension / any） |

---

## 5. スコープ外

- ❌ 感情フィルタ選択 UI（フロントエンドの選択UIは実装しない。APIパラメータの受け口のみ作成）
- ❌ パート分割機能（将来実装予定。EmotionScore を秒単位で保持することで対応準備のみ行う）
- ❌ 感情スコア配列の DynamoDB への永続化（スコア配列は保存せず、抽出済みハイライトの `dominantEmotion` のみ保存）
- ❌ 感情スコアの UI 表示（抽出根拠 `source: 'emotion'` の表示変更は含む）

---

## 6. 用語集

| 用語 | 定義 |
| ---- | ---- |
| 感情スコア | gpt-5-mini が文字起こしの各セグメントに対して算出した感情カテゴリ別のスコア（0.0〜1.0） |
| 感情フィルタ | ハイライト抽出時に重視する感情カテゴリの指定。`any` は全カテゴリの最大値を使用 |
| dominantEmotion | ハイライト区間内で最もスコアが高かった感情カテゴリ |
| round-robin | motion → volume → emotion → motion → ... の順番で交互にピークを選択する集計方式 |
