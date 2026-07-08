# リブトーク 知識・記憶の Topic 中心モデル - 技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/livetalk/architecture.md に ADR として抽出し、
    tasks/livetalk-knowledge/ ディレクトリごと削除します。

    入力: tasks/livetalk-knowledge/requirements.md
    実装タスクのフェーズ分け・進捗管理は Issue 本文 + サブ Issue で行います。
-->

## 0. 設計サマリ

知識・記憶の単位を **Topic（話題）** に置く。Topic は物理レコード 1 個ではなく、SK プレフィックスで束ねた item 群。

- 恒久: `Topic ヘッダ(META)` ＋ `SELF fact ×N`（会話由来・削除単位）＋ `WEB fact ×N`（勉強由来・鮮度単位）＋ `共有ログ(Note)`。
- 一時（元データ・90日 TTL）: 会話 `Message`（既存流用）＋ `Web 取得生(WEBRAW)`。集約進捗は `集約カーソル(CURSOR)` で管理。
- 書込は元データに append のみ。集約（畳み）は毎時バッチで LLM。想起は関連度 only。忘却は SELF の決定的削除。優先度は `care` に一元化。

律速リスクは **Topic ルーティング／マージ品質**。生断片の provenance 保持で誤マージを可逆化し、version 条件付き書込・人手削除を最優先とする。

---

## 1. API 仕様

新規の外部公開エンドポイントは最小限。既存の memory / notes API をデータ源差し替えで再構成する。

### エンドポイント一覧（再構成）

| メソッド | パス | 説明 | 認証 |
|---------|------|------|------|
| GET | /api/memory | SELF fact 一覧（横断） | 要 `livetalk:chat` |
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
    topicId: string;          // 主題スラグ or ULID（upsert キー）
    subject: string;          // 例: "ラーメン"
    canonicalSummary: string; // 導出物・再生成可
    category: string;
    care: number;             // 注目度（優先度信号）
    stability: 'stable' | 'volatile' | 'mixed';
    embedding: number[];      // 想起用
    tags: string[];           // 横リンク（関連 Topic 想起の補助）
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
    novelty?: number;
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
    // web: query, rawText, sourceUrls / conversation: 既存 Message
    createdAt: number;       // 90日 TTL
};

type ConsolidationCursor = { lastConsolidatedAt: number };
```

### 2.2 物理モデル（DynamoDB Single Table）

テーブルは既存 `nagiyu-livetalk-dynamodb-{env}` に相乗り。`PK = USER#<uid>` 固定。

| item | SK | 主な属性 | ライフサイクル |
|------|----|---------|--------------|
| Topic ヘッダ | `CHAR#<c>#TOPIC#<tid>#META` | subject, canonicalSummary, category, care, stability, embedding, tags | 恒久（consolidation 更新） |
| SELF fact | `CHAR#<c>#TOPIC#<tid>#SELF#<ulid>` | text, provenance, createdAt | 恒久・ユーザー削除可 |
| WEB fact | `CHAR#<c>#TOPIC#<tid>#WEB#<ulid>` | text, sourceUrls, volatility, nextReview, observedAt | 恒久（鮮度で更新） |
| 共有ログ Note | `CHAR#<c>#NOTE#<ulid>` | topicId, headline, sharedAt, reaction | 恒久 |
| 会話生ログ | `CHAR#<c>#MSG#<ulid>`（既存） | role, text | 90日 TTL |
| Web 取得生 | `CHAR#<c>#WEBRAW#<ulid>` | query, rawText, sourceUrls | 90日 TTL |
| 集約カーソル | `CHAR#<c>#CURSOR` | lastConsolidatedAt | 恒久・状態 |

**1 Topic 一括取得**: `PK = USER#<uid> AND begins_with(SK, "CHAR#<c>#TOPIC#<tid>#")` → META＋SELF全部＋WEB全部。

### 2.3 GSI（すべて sparse）

| GSI | PK | SK | 用途 |
|-----|----|----|------|
| GSI-SELF | `<c>#SELF#<uid>` | createdAt or topicId | 記憶画面: SELF fact を主題横断で列挙（SELF item のみ投影） |
| GSI-STALE | `STALE#<c>#<時間バケット>` | nextReview | 鮮度掃引: 揮発 WEB fact のみ。時間バケットでシャードしホット化回避 |
| GSI-CARE | `<c>#CARE#<uid>` | care | 自発リサーチ・通知の優先度（care 降順、Topic ヘッダのみ投影） |

Note 一覧は `begins_with(SK, "CHAR#<c>#NOTE#")` で取得（GSI 不要）。

> ⚠️ 既存 GSI1（PROFILE）/ GSI2（SAFETY）と衝突しない名前・射影で追加する。GSI を Query するバッチロールは `fromTableAttributes` + `globalIndexes` で `index/*` を grant する（ADR-2.22 の教訓）。

### 2.4 アクセスパターン

| 操作 | キー設計 |
|------|---------|
| 元データ未集約分を読む | `MSG#` / `WEBRAW#` を CURSOR 以降で Query |
| Topic に振り分け | ユーザーの Topic 埋め込み群を取得しアプリ内 cosine（Topic 数は集約で小） |
| 1 Topic 更新 | `begins_with TOPIC#<tid>#` で読み、META/SELF/WEB を put/update/delete |
| 会話想起 | 発話 embed → Topic 埋め込みと cosine 閾値 top-K → 対象 Topic を begins_with 取得 |
| 記憶画面 | GSI-SELF を Query |
| 忘却 | SELF item を DeleteItem → 当該 Topic 要約を再生成（put META） |
| 鮮度掃引 | GSI-STALE を現在バケット・nextReview<=now で Query |
| 優先度選定 | GSI-CARE を care 降順で Query |
| Note 一覧 | `begins_with NOTE#` |

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
| Topic リポジトリ | `core/src/repositories/topic.*` | Topic/fact の CRUD・begins_with 取得 |
| consolidation usecase | `core/src/usecases/consolidate.usecase.ts` | 元データ→Topic 畳み（compress を発展） |
| acquire usecase | `core/src/usecases/acquire.usecase.ts` | care/依頼/鮮度で取得（study を発展） |
| retrieval | `core/src/knowledge/retrieval.ts` | 関連度 only 想起（Memory retrieval を置換） |
| note 生成 | `core/src/usecases/generate-note.usecase.ts` | SELF フック＋WEB 合成（既存を発展） |
| 集約カーソル | `core/src/repositories/cursor.*` | lastConsolidatedAt |

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
// retrieval: 関連度 only
function retrieveTopics(userId: string, characterId: string, params: {
    utteranceEmbedding: number[];
    threshold: number;
    topK: number;
}): Promise<Topic[]>; // SELF/WEB は begins_with で付随取得

// consolidation
function consolidate(userId: string, characterId: string, deps: {...}): Promise<{ updatedTopics: number }>;

// 忘却
function forgetSelfFact(key: { userId; characterId; topicId; factId }): Promise<void>; // delete + 要約再生成
```

---

## 4. 実装上の注意点

### 4.1 依存関係・前提条件

- 埋め込みクライアント（OpenAI）と `cosineSimilarity`（既存 `core/src/memory/embedding.ts`）を流用。
- consolidation は既存 `compress-conversation` の at-least-once 設計（カーソルを put より先に更新しない）を踏襲。
- acquire は既存 `study` の `shouldStudyNow`／DLQ／毎時起動を発展させる。

### 4.2 パフォーマンス考慮事項

- 会話ホットパスで集約 LLM を呼ばない。想起は cosine＋注入のみ。
- 埋め込み（約 6KB）を頻繁書換 item に載せない（Topic ヘッダに置くが、頻繁 nudge する care 等と分離検討。必要なら埋め込み別スリム item）。
- GSI-STALE は時間バケットでシャードし単一パーティション集中を避ける。

### 4.3 セキュリティ考慮事項

- 認可は既存 RBAC。PII は計測ログに含めない。
- 忘却は不可逆操作 → 確認ダイアログ。削除時は当該 Topic 要約を必ず再生成し、導出物への残存を断つ。
- 想起ポリシー: 関連度 only。core プロフィール常時注入は「素性（名前・制約）」のみ・嗜好は含めない（コーヒー病回避）。care は想起の下駄にしない。

### 4.4 撤去対象（破壊的・移行なし）

Memory Tier A–D / MemorySummary / cooldown・カテゴリキャップ / InterestCategory（→ care）/ 旧 Knowledge・Note / StudyTopic キュー。通知の escalation は InterestCategory.Weight → care へ差し替える。

---

## 5. docs/ への移行メモ

- [ ] `docs/services/livetalk/requirements.md`：知識・記憶を Topic 中心に再定義したユースケース（集約・関連度想起・決定的忘却・鮮度追随・ギフトノート・care 優先度）を統合。
- [ ] `docs/services/livetalk/external-design.md`：memory（Tier タブ/ピン撤去・SELF のみ・決定的削除）と notes（ギフト化）の画面設計・概念データモデルを統合。
- [ ] `docs/services/livetalk/architecture.md` に ADR として追記：
      - Topic 中心モデル（原子は fact でなく Topic／SELF・WEB per-fact／元データ 90日＋集約カーソル）
      - 想起は関連度 only（Tier・cooldown・常時注入を廃止、コーヒー病を構造で回避）
      - 忘却は決定的削除＋要約再生成（ADR-007 の前向き整合の延長・LLM 抑制非依存）
      - 優先度は care に一元化（InterestCategory 廃止・通知 escalation も care 化）
      - ルーティング/マージ品質が律速 → provenance で可逆化・version 条件付き書込
