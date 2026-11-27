---
sources:
  - services/livetalk/core/src/llm-client/models.ts
  - services/livetalk/core/src/llm-client/openai-client.ts
  - services/livetalk/core/src/llm-client/factory.ts
  - services/livetalk/core/src/llm-client/schemas/consolidation.schema.ts
  - services/livetalk/core/src/llm-client/schemas/escalation.schema.ts
  - services/livetalk/core/src/llm-client/schemas/exploration-angle.schema.ts
  - services/livetalk/core/src/llm-client/schemas/knowledge-gate.schema.ts
  - services/livetalk/core/src/llm-client/schemas/note-letter.schema.ts
  - services/livetalk/core/src/llm-client/schemas/regenerate-summary.schema.ts
  - services/livetalk/core/src/llm-client/schemas/web-fact-change.schema.ts
  - services/livetalk/core/src/research/openai-research-client.ts
  - services/livetalk/core/src/research/web-search-usage.ts
  - services/livetalk/core/src/safety/moderation.ts
  - services/livetalk/core/src/openai-voice/openai-voice-client.ts
  - services/livetalk/core/src/lib/llm-retry.ts
  - services/livetalk/web/src/lib/server/voice.ts
  - services/livetalk/web/src/lib/server/safety.ts
sources_hash: f4d601b0669b9869b3ca5778f775ea74325c19af75ddcbc9b3bcc43cccce67ee
---

# OpenAI の使い方

LiveTalk が OpenAI の API をどう使うか。会話・要約・分類・Web 検索のモデルと推論の強さ、Structured Outputs、埋め込み、Moderation、音声合成 (Realtime API)。API キーは[シークレット](./secrets.md)の OpenAI API キーで、環境変数 `OPENAI_API_KEY` で渡される ([Web の実行環境](./web-runtime.md)、[バッチの実行環境](./batch-runtime.md))。

## モデルと推論の強さ

用途ごとの値は `LLM_MODELS` と `LLM_REASONING_EFFORT` が持つ。会話・要約・分類・Web 検索は、すべて同じモデルで、推論の強さ (`reasoning.effort`) で差を付ける。

| 用途 | モデル | 推論の強さ | 使う場所 |
|---|---|---|---|
| 会話 (`conversation`) | `gpt-5.6-luna` | `low` | チャットの応答 (ストリーミング) |
| 要約 (`summarize`) | `gpt-5.6-luna` | `low` | [集約バッチ](../batch/consolidate-conversations.md)の Topic の集約、記憶の削除のあとの要約の作り直し、[ノート](../term/note.md)の手紙 |
| 分類 (`classify`) | `gpt-5.6-luna` | `none` | 知識ゲート (勉強が要る話題かの判定)、[通知バッチ](../batch/notify.md)の予定の日付の抽出、[取得バッチ](../batch/acquire.md)の変化の判定と探索の角度の選択 |
| Web 検索 (`research`) | `gpt-5.6-luna` | `low` | [取得バッチ](../batch/acquire.md)の Web 検索 |
| 埋め込み | `text-embedding-3-small` (1,536 次元) | - | 話題の想起 (Web)、集約 (バッチ) |
| Moderation | `omni-moderation-latest` | - | チャットの応答の検査 |
| 音声合成 | `gpt-realtime-2.1-mini` (声は `marin`) | - | 音声が OpenAI のキャラクター ([キャラクター](../term/character.md)) |

- 呼び出しには Responses API を使う (`responses.create` と `responses.parse`)。SDK の自動の再試行は切り (`maxRetries: 0`)、アプリ側で一元的に再試行する
- 各用途の使用量 (トークン数) は、構造化ログ `[llm-usage]` に出る ([LLM のトークン使用量のログ](../../../../platform/specs/lib/common/llm-usage.md))。Web 検索の回数は `[web-search-usage] Web 検索回数` に出る
- 推論の強さは、用途で固定する。呼び出しごとに変える口は、本番の経路にない

### 再試行とタイムアウト

| 項目 | 値 |
|---|---|
| 再試行の対象 | 一過性のエラー。タイムアウト、接続エラー、HTTP 408・409・429・500 以上。400・401・403・404 などは再試行しない |
| 再試行の回数 | 3 回。待ち時間は 1 秒から、倍に増やす |
| 再試行しない呼び出し | チャットのストリーミング (出力が重複するため) |
| Web 検索のタイムアウト | 120 秒 |
| 音声合成のタイムアウト | 30 秒 |

## Structured Outputs

分類・要約・判定の呼び出しは、`responses.parse` と Zod のスキーマ (`zodTextFormat`) で、応答を型どおりの JSON に固定する。strict モードのため、すべてのフィールドが必須で、省略できる値は `nullable` で表す。応答を拒否されたときは、専用のエラー (「LLM が応答を拒否しました」) を投げる。スキーマは `services/livetalk/core/src/llm-client/schemas/` にある。

| スキーマ | 用途 | 返すもの |
|---|---|---|
| `ConsolidationSchema` | 要約 | 集約バッチが、未集約の会話と Web 取得を話題ごとにまとめた結果 (既存 Topic への名寄せか新規か、要約、SELF fact、WEB fact) |
| `RegenerateSummarySchema` | 要約 | SELF fact を消したあとの、Topic の要約の作り直し |
| `NoteLetterSchema` | 要約 | ノートにするか (`skip`)、手紙の文面 |
| `KnowledgeGateSchema` | 分類 | 勉強が要る話題か (`needsStudy`)、正規化した話題名 |
| `EscalationSchema` | 分類 | 予定の日付 (`eventDate`、なければ `null`) |
| `WebFactChangeSchema` | 分類 | 取得し直した内容が、既存の事実から変わったか (`changed`) |
| `ExplorationAngleSchema` | 分類 | 自発リサーチの検索のクエリ (`query`) |

- チャットの応答 (`chatStream`) は、ストリーミングで返すので、Structured Outputs の対象にしない
- Web 検索の応答は、`research` の専用のスキーマ (話題・要約・出典の URL・コメント) で、同じ方法で受ける

## Web 検索

[取得バッチ](../batch/acquire.md)が、`responses.parse` に `web_search` のツールを付けて呼ぶ。ツールの呼び出しは必須 (`tool_choice: required`) にする。検索の回数は、応答の `web_search_call` を、検索・ページを開く・ページ内の検索・その他に分けて数え、検索の成否にかかわらずログに出す。応答が不正でも、検索は課金済みなので、投げる前に数える。

## 埋め込み

テキストを前後の空白を除いて `text-embedding-3-small` に渡し、1,536 次元のベクトルを得る。空のテキストは受け付けない。

## Moderation

チャットの応答の全文を、`omni-moderation-latest` (日本語に対応) で検査する。止められたときの扱いは[チャット API](../api/chat.md)にある。検査が失敗したときは、ログに警告を残して、応答を通す。API キーがないとき (開発) と、インメモリの動作のときは、何も止めない実装 (`NoOpModerationClient`) に切り替わる。

## 音声合成

OpenAI の音声を使うキャラクターは、Realtime API (WebSocket) で合成する。VOICEVOX を使うキャラクターとは、`voice.provider` で振り分ける (`services/livetalk/web/src/lib/server/voice.ts`)。

- 1 回の合成ごとに接続し、読み上げ専用の応答を 1 件だけ生成させ、24 kHz・16 bit・モノラルの PCM を集めて WAV にして返す。接続は、成功・失敗・タイムアウトのどれでも閉じる
- 読み上げ専用の指示 (入力を一字一句そのまま読み、返答や相槌を付けない) に、キャラクターごとの話し方の指示を足す
- 呼び出しは `response.create` の `conversation: none` (会話の履歴に残さない) で行う
- OpenAI の音声のクライアントは、API キーがあるときだけ、最初に使うときに作る。キーがない環境でも、VOICEVOX のキャラクターは動く

## 利用額の上限

OpenAI の利用額そのものの上限は、AWS や CDK では決められない。OpenAI のコンソール (外部のサービス) で、人が設定する。値はここに写さない。LiveTalk 側の保護は、利用者ごとのチャットの回数の制限と同時実行のロックで、これは[チャット API](../api/chat.md)にある。

## 理由

- 会話・要約・分類・Web 検索を、1 つのモデル (`gpt-5.6-luna`) にそろえる。このモデルは、Structured Outputs・関数呼び出し・Web 検索・画像入力のすべてを、全用途で使える。用途ごとにモデルを分けず、推論の強さで差を付ける。推論のトークンは出力として課金されるので、構造化抽出のような推論の要らない用途では推論を切る
- 推論の強さは、dev 環境での実測 (251 呼び出し) をもとに決めている
    - 会話は `low`。推論は実際に出ていて (出力に対する推論の比率が 40.5%、推論のトークンの中央値が 36)、`none` にはしない。ストリーミングの最初のトークンまでの遅延にも、推論の強さが効く。`low` にしたあとの dev の実測 (5 件) では、推論が 0 トークンだった。サンプルが少なく、長い文脈では出うるので `low` を保つ
    - 要約は `low`。純粋な圧縮に近いが、推論のトークンの中央値が 197 とやや大きいので、安全側に `none` にはしない
    - 分類は `none`。構造化抽出で、実測の 123 件のうち 26 件は、モデル自身が推論 0 と判断していた (推論の比率は 49.2% だが、出力が小さい)
    - Web 検索は `low`。検索結果の統合を伴い、推論のトークンの中央値が 580 と最大で、`none` にすると品質が落ちるおそれが大きい
- Structured Outputs を使うのは、「JSON だけを返せ」とプロンプトで指示して `JSON.parse` する方法では、パースの失敗で記憶の抽出が静かに失われる (silent failure)、形式が揺れる、型が保証されない、という問題があるため。デコーダーの水準で型が保証され、揺れも出ない。会話の応答はストリーミングで返すので、JSON のスキーマが適用できず、対象にしない
- 再試行の対象にストリーミングを入れないのは、途中まで出した出力が重複するため
- 音声の合成は、`gpt-realtime-*` が `/v1/audio/speech` では使えず、Realtime API 専用のため、WebSocket で行う。Realtime のモデルは会話用で、何も指示しないと入力の文に返答してしまうので、読み上げ専用の指示を必ず付ける
