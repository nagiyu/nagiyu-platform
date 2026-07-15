# リブトーク 知識・記憶の Topic 中心モデル - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/livetalk/architecture.md に ADR として抽出し、
    tasks/livetalk-knowledge/ ディレクトリごと削除します。

    入力: tasks/livetalk-knowledge/requirements.md
    実装タスクのフェーズ分け・進捗管理は Issue 本文 + サブ Issue で行います。
    ※ 本書は fresh-eyes レビュー（4 観点）を反映した確定版です。
-->

## 0. 設計サマリ

知識・記憶の単位を **Topic（話題）** に置く。Topic は物理レコード 1 個ではなく、SK プレフィックスで束ねた item 群。

- 恒久: `Topic ヘッダ(META)` ＋ `SELF fact ×N`（会話由来・削除単位）＋ `WEB fact ×N`（勉強由来・鮮度単位）＋ `共有ログ(Note)`。
- 一時（元データ・90日 TTL）: 会話 `Message`（既存流用）＋ `Web 取得生(WEBRAW)`。集約進捗は `集約カーソル(CURSOR)` で管理。
- 書込は元データに append のみ。集約（畳み）は毎時バッチで LLM。**想起は埋め込み類似度（関連度 only）**。忘却は SELF の決定的削除。優先度は `care` に一元化。
- 律速リスクは **Topic ルーティング／マージ品質**。生断片の provenance 保持で誤マージを可逆化し、条件付き書込・人手削除を最優先とする。

---

## 1. API 仕様

新規の外部公開エンドポイントは最小限。既存の memory / notes API をデータ源差し替えで再構成する。

### エンドポイント一覧（再構成）

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| GET | /api/memory | SELF fact 一覧（主題横断） | 要 `livetalk:chat` |
| DELETE | /api/memory/:selfId | SELF fact の決定的削除＋所属 Topic 要約再生成 | 要 |
| GET | /api/notes | 共有ログ（Note）一覧（新着順） | 要 |
| GET | /api/notes/:noteId | ノート詳細（参照先 Topic の最新を反映） | 要 |

チャット（`/api/chat`）はストリーム形式を変えない（JSON 全振りはスコープ外）。想起経路のみ差し替える。

---

## 2. データモデル

### 2.1 論理モデル

```typescript
type Topic = {
    userId: string;
    characterId: string;
    topicId: string;          // ULID（ランダム。名寄せは consolidation の LLM 判断に委ねる）
    subject: string;          // 例: "ラーメン"
    canonicalSummary: string; // 導出物・再生成可
    category: string;
    care: number;             // 注目度（回数ベースの興味強度。情動重み付けはしない）。上昇はユーザー起点の fold のみ（→ 4.5）
    embedding: number[];      // 想起用の座標。Topic 本体に同居。更新は consolidation 時のみ
    updatedAt: number;        // 楽観ロック用（delete→要約再生成 と consolidation の競合回避）
};

type SelfFact = {            // 会話由来・ユーザー所有・削除単位
    topicId: string;
    factId: string;          // ULID
    text: string;
    provenance?: string;     // 誤マージ可逆化のための出所メモ
    createdAt: number;
};

type WebFact = {             // 勉強由来・鮮度単位
    topicId: string;
    factId: string;          // ULID
    text: string;
    sourceUrls: string[];
    volatility: 'stable' | 'low' | 'medium' | 'high';
    nextReview?: number;     // 揮発のみ。鮮度掃引の期限
    observedAt: number;
};

type ShareLog = {            // = Note（ギフト）
    noteId: string;          // ULID
    topicId: string;         // 参照
    headline: string;        // SELF フック＋WEB の合成文
    sharedAt: number;
    reaction?: string;       // 感想連携
};

type RawCapture = {          // 元データ（未集約）。会話は既存 Message を流用
    source: 'conversation' | 'web';
    createdAt: number;       // 90日 TTL
};

// ストリーム別・楽観ロックで条件付き前進（二重処理・backdated 欠落の防止）
type ConsolidationCursor = { msgCursor: number; webrawCursor: number; updatedAt: number };
```

> **関連（related）** は事前計算しない。想起時に埋め込み近傍でその場算出する（tags・隣接リストは持たない）。

### 2.2 物理モデル（DynamoDB Single Table）

テーブルは既存 `nagiyu-livetalk-dynamodb-{env}` に相乗り。`PK = USER#<uid>` 固定。

| item | SK | 主な属性 | ライフサイクル |
|------|----|---------|--------------|
| Topic ヘッダ | `CHAR#<c>#TOPIC#<tid>#META` | subject, canonicalSummary, category, care, embedding, updatedAt | 恒久（consolidation 更新） |
| SELF fact | `CHAR#<c>#TOPIC#<tid>#SELF#<ulid>` | text, provenance, createdAt | 恒久・ユーザー削除可 |
| WEB fact | `CHAR#<c>#TOPIC#<tid>#WEB#<ulid>` | text, sourceUrls, volatility, nextReview, observedAt | 恒久（鮮度で更新） |
| 共有ログ Note | `CHAR#<c>#NOTE#<ulid>` | topicId, headline, sharedAt, reaction | 恒久 |
| 会話生ログ | `CHAR#<c>#MSG#<ulid>`（既存） | role, text | 90日 TTL |
| Web 取得生 | `CHAR#<c>#WEBRAW#<ulid>` | query, rawText, sourceUrls | 90日 TTL |
| 集約カーソル | `CHAR#<c>#CURSOR` | msgCursor, webrawCursor, updatedAt | 恒久・状態 |

**1 Topic 一括取得**: `PK = USER#<uid> AND begins_with(SK, "CHAR#<c>#TOPIC#<tid>#")` → META＋SELF全部＋WEB全部。

### 2.3 GSI（すべて sparse）

`#META` は接尾辞のため `begins_with` で Topic ヘッダだけを列挙できない。列挙は専用 GSI で行う。

| GSI | PK | SK | 用途・射影 |
|-----|----|----|----------|
| GSI-TOPIC | `<c>#TOPICS#<uid>` | care | Topic ヘッダの列挙。**embedding・care・subject・topicId を射影**。想起（全 Topic の座標取得→自前 cosine）と acquire（care 降順）の両方を賄う |
| GSI-SELF | `<c>#SELF#<uid>` | `<topicId>#<createdAt>` | 記憶画面: SELF fact を主題ごとにまとめて時系列表示（SELF item のみ投影） |
| GSI-STALE | `<c>#STALE#<uid>` | nextReview | 鮮度掃引: 揮発 WEB fact のみ。`nextReview<=now` を直近まとめて走査 |

- **スケール方針**: 現状 1 ユーザー。GSI-STALE の時間バケットシャーディングは不要（病的設計回避に留める）。将来ホット化したらシャード／embedding のメモリキャッシュを足す（後回しの最適化）。
- **想起の読み方針**: GSI-TOPIC は座標を射影するため、想起は「Topic 本体を全読み」せず「座標だけ」を読める（過剰読取の回避）。embedding は Topic 本体同居のまま（別 item にはしない。更新は毎時集約のみ＝書込増幅なし）。
- ⚠️ GSI を Query するロールは `fromTableAttributes` + `globalIndexes` で `index/*` を grant する（ADR-2.22 の教訓・二度の AccessDenied）。既存 GSI1(PROFILE)/GSI2(SAFETY) と衝突しない名前で追加する。

### 2.4 アクセスパターン

| 操作 | キー設計 |
|------|---------|
| 元データ未集約分を読む | `MSG#` を msgCursor 以降、`WEBRAW#` を webrawCursor 以降で Query（ストリーム別） |
| Topic に振り分け | GSI-TOPIC で座標群を取得しアプリ内 cosine で近傍を絞る → LLM が merge/新規を判定 |
| 1 Topic 更新 | `begins_with TOPIC#<tid>#` で読み、META/SELF/WEB を put/update/delete |
| 会話想起 | 発話を embed → GSI-TOPIC で全 Topic の座標取得 → 自前 cosine で閾値 top-K → 選ばれた Topic のみ begins_with で SELF/WEB 取得 |
| 記憶画面 | GSI-SELF を Query（主題ごと時系列） |
| 忘却 | SELF item を DeleteItem → 当該 Topic 要約を再生成（`updatedAt` 条件付きで put META、失敗時リトライ） |
| 鮮度掃引 | GSI-STALE を `nextReview<=now` で走査（バケットシャード無し） |
| 優先度選定 | GSI-TOPIC を care 降順で Query（acquire バッチ） |
| カーソル前進 | `updatedAt` 条件付き put で二重処理を防ぐ（or CHATLOCK 相当のロック） |

---

## 3. コンポーネント設計

### 3.1 パッケージ責務分担

| パッケージ | 責務 |
|----------|------|
| `livetalk/core` | エンティティ・リポジトリ IF・集約/想起/取得/ノート生成のユースケース・埋め込み類似度 |
| `livetalk/web` | memory / notes 画面・API Routes・チャット想起の接続 |
| `livetalk/batch` | consolidation（畳み）・acquire（取得）の Lambda ハンドラ |
| `infra/livetalk` | GSI 追加・バッチ定義（既存 study/compress の発展） |

### 3.2 実装モジュール一覧（主要）

**core**

| モジュール | パス | 役割 |
|----------|------|------|
| Topic/SelfFact/WebFact/ShareLog エンティティ | `core/src/entities/*` | 型定義 |
| Topic リポジトリ | `core/src/repositories/topic.*` | Topic/fact の CRUD・begins_with 取得・GSI Query |
| consolidation usecase | `core/src/usecases/consolidate.usecase.ts` | 元データ→Topic 畳み（compress を発展） |
| acquire usecase | `core/src/usecases/acquire.usecase.ts` | care/依頼/鮮度で取得（study を発展） |
| retrieval | `core/src/knowledge/retrieval.ts` | 埋め込み類似度の関連度 only 想起（Memory retrieval を置換） |
| note 生成 | `core/src/usecases/generate-note.usecase.ts` | SELF フック＋WEB 合成（既存を発展） |
| 集約カーソル | `core/src/repositories/cursor.*` | msgCursor/webrawCursor・条件付き前進 |

**web**

| モジュール | パス | 役割 |
|----------|------|------|
| 記憶画面 | `web/src/app/memory/page.tsx` | SELF 一覧・削除（Tier タブ/ピン撤去） |
| ノート画面 | `web/src/app/notes/page.tsx` | 共有ログ一覧・詳細 |
| memory/notes API | `web/src/app/api/memory|notes/*` | データ源差し替え |

**batch**

| モジュール | パス | 役割 |
|----------|------|------|
| consolidate handler | `batch/src/handlers/consolidate.ts` | 毎時集約（compress 発展） |
| acquire handler | `batch/src/handlers/acquire.ts` | 毎時取得（study 発展） |

### 3.3 モジュール間インターフェース（骨子）

```typescript
// retrieval: 埋め込み類似度・関連度 only
function retrieveTopics(userId: string, characterId: string, params: {
    utteranceEmbedding: number[];
    threshold: number;   // 閾値（要調整・観測）
    topK: number;
}): Promise<Topic[]>; // 選ばれた Topic の SELF/WEB は begins_with で付随取得

// consolidation
function consolidate(userId: string, characterId: string, deps: {...}): Promise<{ updatedTopics: number }>;

// 忘却（決定的削除＋確実な要約再生成）
function forgetSelfFact(key: { userId; characterId; topicId; factId }): Promise<void>;
```

---

## 4. 実装上の注意点

### 4.1 依存関係・前提条件

- 埋め込みクライアント（OpenAI の embedding モデル・安価）と `cosineSimilarity`（既存 `core/src/memory/embedding.ts`）を流用。想起は会話のたびに embedding を 1 回叩き、cosine は自前計算（会話 LLM は最終応答の 1 回のみ）。
- consolidation は既存 `compress-conversation` の at-least-once 設計を踏襲しつつ、**カーソルをストリーム別**にし（MSG/WEBRAW）、**条件付き前進**で二重処理を防ぐ。
- acquire は既存 `study` の `shouldStudyNow`／DLQ／毎時起動を発展。care 降順（GSI-TOPIC）＋依頼＋鮮度切れ（GSI-STALE）を対象に Web 取得し WEBRAW を書く。

### 4.2 パフォーマンス考慮事項

- 会話ホットパスで集約 LLM を呼ばない。想起は「座標だけ」を GSI-TOPIC から読み（Topic 本体は選抜後のみ）自前 cosine。
- care も embedding も更新は毎時集約のみ（会話ごとに書き換えない）＝ 書込増幅なし。
- 座標が重くなったら次元削減／メモリキャッシュを後付けする（1 ユーザー規模では不要）。

### 4.3 セキュリティ・整合性考慮事項

- 認可は既存 RBAC。PII は計測ログに含めない。退会（ADR-2.21）は `PK=USER#` 配下ハード削除で本 item も消える。
- **忘却**: 不可逆操作 → 確認ダイアログ。削除は SELF item の DeleteItem（決定的）＋当該 Topic 要約の再生成（`updatedAt` 条件付き put・失敗時リトライで確実化）。**生 Message の復活は前進のみのカーソルが防ぐ**（畳み済みは再読しない）。既存の Note（共有ログ）はユーザー自身が消した内容でも**履歴として残置**しスクラブしない（割り切り）。
- **想起ポリシー**: 関連度 only（埋め込み閾値 top-K）。閾値・topK・関連 1 ホップは要調整・要観測（緩→無関係の持ち出し／厳→想起漏れ）。core プロフィール常時注入は「素性（名前・制約）」のみ・嗜好は含めない（"コーヒー病" 回避）。care は想起の下駄にしない。
- **ライブ文脈の補完**: 直近未集約の会話履歴は従来どおり別途注入し、Topic 化前の発言の取りこぼし（「さっき言ったのに」）を補う。

### 4.4 撤去対象（破壊的・移行なし）

Memory Tier A–D / MemorySummary / cooldown・カテゴリキャップ / InterestCategory（→ care）/ 旧 Knowledge・Note / StudyTopic キュー。通知の escalation は InterestCategory.Weight → care へ差し替える。

> **撤去の順序（Phase 側で必ず担保）**: 旧想起経路（Tier/Summary）は、新想起（Topic）が dev で機能確認できるまで残す。P1 で Topic を影で構築 → P2 で想起を切替 → その後に旧経路を撤去。中間の「記憶喪失」状態を作らない。
> **InterestCategory 撤去の波及確認**: `Weight` が親密度計算・通知・セーフティのどこに結合しているかを P5 着手時に洗い、care へ差し替える。care は集約稼働後に埋まるため、通知のコールドスタート（当面は静穏）を許容する。

### 4.5 care 上昇ポリシー（ユーザー起点でのみ上げる）

care は「ユーザーがその話題をどれだけ気にしているか」の信号である。したがって **care を上げてよいのは「ユーザーが会話で触れた fold」だけ**とし、キャラの自発リサーチ（webraw only）を畳んだだけの fold では上げない。

- **判定（SELF fact を代理信号にする）**: consolidation の Topic 更新で、その Topic の fold が生んだ `selfFactCount` を見て分岐する。SELF fact は会話由来、WEB fact は自発リサーチ由来であるため、SELF fact が生まれた fold＝ユーザーが会話で触れた、とみなす。
    - 新規 Topic: `care = selfFactCount > 0 ? 1 : 0`
    - 既存 Topic 更新（名寄せ）: `care = selfFactCount > 0 ? current.care + 1 : current.care`
    - WEB only の fold（自発リサーチ・鮮度切れ再取得）は care を上げない。
- **なぜ必要か（自己強化ループの遮断）**: この分岐が無いと、ユーザーが一言も足していない話題でもキャラが自発リサーチを畳むだけで care が育ち、`care≥3` の notify/ノート閾値や acquire の自発リサーチ選定（care 降順）に載ってしまう。かつ「高 care→もっと自発リサーチ→もっと care」の自己強化ループになる（dev 実測: キャラ自身のパーソナ Topic が care=3 まで育ち、キャラが自分自身を通知した）。
- **割り切り**: 「◯◯調べて」だけで SELF fact が出ない一過性の依頼は care に載らない（一過性の依頼は興味とみなさない）。読み取り側（acquire の care 降順選定・notify/note の care 閾値）は変更しない。既存の膨らんだ care 値は遡及修正しない（dev/prod ともにマイグレーションで作り直される前提）。
- **より厳密な上位版（不採用・要否は都度判断）**: 「fold に会話メッセージが含まれたか」で直接判定する案もあるが、consolidate の入力配線に手が要りスコープが広がる。SELF fact 代理で十分と判断した。

> **将来拡張（レバー2・未実装）: care を「累計回数」から「最近のユーザー興味」へ**
> 現状 care は累計回数で単調増加し、明示的な減衰を持たない。将来的には care を「最近ユーザーが触れたか」に再定義し、明示的な減衰 cron を持たずに **「最後にユーザーが触れた日時／最近性」で通知・ノート・自発リサーチの候補を並べる**ことで、古い話題が希少な通知枠（平常 1 日 1 件）を占め続けるのを自然に防げる。会話での想起は既に関連度 only で自然に薄れている点も踏まえると、優先度側にも最近性を効かせるのが筋。本対応（レバー1）では実装せず、拡張余地として記録に留める。

---

## 5. docs/ への移行メモ

- [ ] `docs/services/livetalk/requirements.md`：知識・記憶を Topic 中心に再定義したユースケース（集約・関連度想起・決定的忘却・鮮度追随・ギフトノート・care 優先度）を統合。
- [ ] `docs/services/livetalk/external-design.md`：memory（Tier タブ/ピン撤去・SELF のみ・決定的削除）と notes（ギフト化）の画面設計・概念データモデルを統合。
- [ ] `docs/services/livetalk/architecture.md` に ADR として追記：
      - Topic 中心モデル（原子は fact でなく Topic／topicId は ULID／SELF・WEB per-fact／元データ 90日＋ストリーム別カーソル）
      - 想起は埋め込み類似度の関連度 only（Tier・cooldown・常時注入を廃止、"コーヒー病" を構造で回避）
      - 忘却は決定的削除＋確実な要約再生成（ADR-007 の前向き整合の延長・LLM 抑制非依存。生復活はカーソルで防止）
      - 優先度は care に一元化（回数ベース・情動重み付けなし。InterestCategory 廃止・通知 escalation も care 化）
      - ルーティング/マージ品質が律速 → provenance で可逆化・条件付き書込
