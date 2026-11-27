---
sources:
  - services/livetalk/core/src/constants.ts
  - services/livetalk/web/src/lib/characters/registry.ts
  - services/livetalk/web/src/lib/characters/client-profiles.ts
  - services/livetalk/web/src/lib/characters/CharacterContext.tsx
sources_hash: 5b596dab5ee37212f091fe6074fb6557af2acec71e4992c70c9fa47d1efa5a47
---

# キャラクター

利用者が会話する相手。ID で区別し、記憶・ノート・通知・生活サイクルはキャラクターごとに独立する。

## 説明

| ID | 名前 | 描き方 | 音声 |
|---|---|---|---|
| `hiyori` (既定) | 桃瀬ひより | Live2D | VOICEVOX (冥鳴ひまり) |
| `ageha` | 早瀬アゲハ | 一枚絵 (パーツの重ね合わせ) | OpenAI Realtime API (`gpt-realtime-2.1-mini`、marin) |

- 選んだキャラクターは、ブラウザのローカルストレージ (`livetalk:selectedCharacterId`) に残る。初回は `hiyori`
- ホーム画面は URL の `?character={ID}` でも切り替えられる。通知からの起動で使う
- API の `characterId` を省略すると `hiyori` になる。登録のない ID は、API によって 400 (`INVALID_REQUEST` / `INVALID_CHARACTER`) になるか、既定に読み替える
- 記憶・ノート・通知の記録・生活サイクルを読む API は、`characterId` で絞る

## 理由

- 描画はブラウザ (クライアント) で行い、サーバーは文字と音声だけを返す。サーバーで Live2D を描いて動画で返す案は、費用・遅延・帯域のどれでも実用にならない。クライアントで描けば、応答ごとの遅延が増えず、サーバーに GPU が要らない。Live2D は `pixi-live2d-display-lipsyncpatch` (MIT) で、ブラウザの WebGL に描く
- 最初のキャラクターに桃瀬ひより (Live2D の公式サンプルのモデル) を、声に VOICEVOX の冥鳴ひまり (ライセンスが緩い) を選んだのは、権利のリスクが小さく、すぐ動かせるためである。キャラクターの印象と声が完全には合わないが、許容している
- キャラクター・LLM・音声合成は、それぞれ `CharacterDefinition`・`ILLMClient`・`IVoiceClient` の背後に置く。実装を差し替えても (別の LLM、別の音声合成)、呼び出し側を変えずに済むようにするためである。早瀬アゲハの声が OpenAI の音声合成であるのも、同じ `IVoiceClient` を通している
- キャラクターを、ロジック (`CharacterDefinition`。性格・声・ライセンスなど、フレームワークに依存しない) と、描画・表示 (表示名・短縮名・描画の設定) に分け、キャラクター ID をキーにした静的なレジストリで結ぶ
    - 分けるのは、描画側のクライアントのバンドルに、ロジック側が引き込むサーバー専用の依存 (AWS SDK など) を入れないため。描画側の `client-profiles.ts` は、ロジック側を import しない
    - 表示名と既定のキャラクター ID は、両側に持つ。二重になるが、一致することをレジストリのテストで確かめる。短縮名は描画側だけが持つ
- 一枚絵のキャラクターは、パーツ (目・口) の画像を重ねて、瞬きと口パクを動かす。Live2D のモデルを持たないキャラクターのために Live2D を起こすのは、制作の費用と権利の面で見合わない一方、静止画 1 枚では動きがなく、生きている感じが出ないためである
    - 開いたパーツと閉じたパーツは、排他の二値で切り替える。中間のフェードを入れないのは、動きがはっきりすることと、重ねた下のパーツが透けて二重に見えるのを避けるためである
    - 口パクは、再生中の音声の音量から開閉を判定する。表現力は Live2D に劣り、母音ごとの口の形や連続した表情の変化はできない。主役のキャラクターは Live2D で描き、この方式は脇のキャラクターに使う
    - 動かさないキャラクター向けに、完成した静止画 1 枚を表示するだけの方式もあり、描画の方式はキャラクターごとに選ぶ
    - パーツ画像はリポジトリに入れず、各環境へ事前に置く。置いていなければ表示できない ([アセット](../resource/assets.md))
