# リブトーク（LiveTalk）技術設計

<!--
    このドキュメントは開発時のみ使用します。
    開発完了後に重要な設計決定を docs/services/livetalk/architecture.md に
    ADR として抽出し、tasks/livetalk/ ディレクトリごと削除します。

    入力: tasks/livetalk/requirements.md, tasks/livetalk/external-design.md
    親 Issue: #3182

    本ドキュメントは Phase の進行に応じて加筆していく。
    Phase 1 着手時点では API 仕様・コンポーネント設計の詳細は未確定。
-->

---

## 1. システム構成

### 1.1 全体構成図

```
┌─ AWS ───────────────────────────────────────────────────┐
│                                                         │
│  ┌─ CloudFront ─────┐                                   │
│  │  /livetalk/*     │                                   │
│  └────────┬─────────┘                                   │
│           │                                             │
│           ↓                                             │
│  ┌─ ALB (dev/prod) ─┐                                   │
│  └────────┬─────────┘                                   │
│           ↓                                             │
│  ┌─ ECS Task (Fargate) ─────────────────┐               │
│  │  ┌─ Container: Next.js ──┐           │               │
│  │  │  Lambda Web Adapter   │           │               │
│  │  │  port 3000            │           │               │
│  │  └───┬───────────────────┘           │               │
│  │      │ localhost:50021               │               │
│  │      ↓                                │               │
│  │  ┌─ Container: VOICEVOX ┐            │               │
│  │  │  voicevox_engine     │            │               │
│  │  │  port 50021          │            │               │
│  │  └──────────────────────┘            │               │
│  └──────────────────────────────────────┘               │
│           │                                             │
│           ├→ [Auth Service (Existing)]                  │
│           ├→ [OpenAI / Anthropic]                       │
│           ├→ [DynamoDB Single Table]                    │
│           ├→ [Push API (Existing)]                      │
│           └→ [S3] models / audio / static               │
│                                                         │
│  ┌─ EventBridge Scheduler ─┐                            │
│  ├→ [Compression Lambda]   ─┐                           │
│  ├→ [Study Lambda]          │                           │
│  ├→ [Event Lambda]          ├→ [DynamoDB]               │
│  └→ [Push Lambda]           ┘                           │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### 1.2 環境別構成

| 環境 | コンピューティング | DB | バッチ |
|---|---|---|---|
| dev | ECS Fargate（Spot 推奨） | DynamoDB（dev テーブル） | EventBridge（dev） |
| prod | ECS Fargate（オンデマンド） | DynamoDB（prod テーブル） | EventBridge（prod） |

dev 環境は Phase 0 で整備（Issue #3183 配下）。

**リージョンは `us-east-1` で固定**（`infra/bin/nagiyu-platform.ts:19`）。CloudFront 関連の制約（ACM 証明書必須リージョン、Lambda@Edge 等）に合わせるための選択であり、`ap-northeast-1` 等への切替は不可。AZ は prod / dev 共に `us-east-1a + us-east-1b` を使用する。

### 1.3 開発ブランチ戦略

本プロジェクトでは **`integration/3182-livetalk` を共通の integration ブランチ**として使用する（Phase ごとには分けない）。

```
develop
  └── integration/3182-livetalk    ← プロジェクト全体の統合先
        ├── claude/...              ← 各 Sub Issue の作業ブランチ
        ├── claude/...
        └── ...
```

CLAUDE.md の原則「1 Issue につき 1 integration ブランチ」からは外れるが、Phase 横断的なリブトーク開発の継続性を優先した運用方針。

#### サブセッション着手時のブランチ運用

各 Sub Issue / 孫 Issue を実装する際は：

1. `integration/3182-livetalk` から `claude/...` 作業ブランチを切る
2. 実装・コミット
3. `git push -u origin claude/...`
4. Draft PR を作成（ターゲットは必ず `integration/3182-livetalk`）
5. 人レビュー → Ready 化 → マージ（Claude は介入しない）

#### Phase 完了後

全 Phase の作業が完了したら：

1. **人の確認を取った上で**、`integration/3182-livetalk` → `develop` の Draft PR を作成
2. 人レビュー → Ready 化 → マージ

### 1.4 ECS Cluster / ALB 戦略

**プラットフォーム共通の Cluster と ALB** を新設して、リブトーク以降の ECS サービスはこれを共有する方針とする。

#### 背景・前提

既存の `infra/root/` 配下にある ECS Cluster（`nagiyu-root-cluster-{env}`）と ALB は、命名上「root」となっているが、これは「**root ドメイン（nagiyu.com）を提供する Portal サービス専用**」のリソースである（`Component: root-domain` タグ、`infra/root/ecs-service-stack.ts` 内のコンテナ名 `portal-app` 等から確認可能）。

したがって、リブトークは：

- 既存 `nagiyu-root-cluster-{env}` を流用しない（意味的に Portal 専用）
- サービスごとに Cluster を作る運用も避けたい（Cluster 数が肥大化）

→ **新たにプラットフォーム共通の Cluster / ALB を `infra/shared/lib/` 配下に新設**する。

#### 配置と命名

```
infra/shared/lib/
  ├── vpc-stack.ts               (既存)
  ├── ecs-cluster-stack.ts       (新規) ← Phase 0 で追加
  └── alb-stack.ts               (新規) ← Phase 0 で追加
```

| リソース | 命名 |
|---|---|
| ECS Cluster | `nagiyu-shared-cluster-{env}` |
| ALB | `nagiyu-shared-alb-{env}` |
| ALB Security Group | `nagiyu-shared-alb-sg-{env}` |
| SSM Parameter | `/nagiyu/shared/{env}/ecs/cluster-name` 等 |
| Tag | `Component: shared` |

#### 各サービスとの責任分担

| 責任 | 配置 |
|---|---|
| Cluster | `infra/shared/lib/ecs-cluster-stack.ts` |
| ALB（本体 + デフォルト Listener） | `infra/shared/lib/alb-stack.ts` |
| Target Group + Listener Rule | 各サービス（`infra/livetalk/` 等） |
| ECS Task Definition + Service | 各サービス |

サービス追加時は、共通 Cluster に Service を Attach し、共通 ALB に Listener Rule（ホスト or パスベース）を追加して Target Group を紐づける形となる。

#### Portal との並存

Portal は既存の `nagiyu-root-cluster-prod` + 専用 ALB のまま運用継続。dev 環境では Portal は Lambda Function URL なので ECS 影響なし。

将来的に Portal を `nagiyu-shared-cluster-prod` へ移行する選択肢は残すが、Phase 0〜5 のスコープ外（必須ではない、緊急性もない）。

---

## 2. API 仕様

> 詳細な型定義・エラーレスポンスは Phase 1〜2 の実装時に確定する。
> ここでは MVP 段階で必要なエンドポイントの輪郭のみ示す。

### 2.1 ベース URL・認証

- Base URL: `https://livetalk.{dev|prod}.{domain}/api`
- 認証: NextAuth JWT Cookie（既存 Auth サービス経由）
- 認可: `livetalk:chat` permission を要求

### 2.2 エンドポイント一覧（暫定）

| メソッド | パス | 説明 | 認証 | Phase |
|---|---|---|---|---|
| POST | `/api/chat` | メッセージ送信、応答ストリーミング受信 | 要 | 1 |
| POST | `/api/tts` | テキスト→音声合成（chat 内部利用、外部公開なし） | 要 | 1 |
| GET | `/api/messages?limit=20` | 直近メッセージ取得 | 要 | 2 |
| GET | `/api/memory` | 記憶アイテム一覧取得 | 要 | 3 |
| PATCH | `/api/memory/:id` | 記憶アイテム編集 | 要 | 3 |
| DELETE | `/api/memory/:id` | 記憶アイテム削除 | 要 | 3 |
| GET | `/api/notes?limit=20` | ノート一覧取得 | 要 | 5 |
| GET | `/api/notes/:id` | ノート詳細取得 | 要 | 5 |
| POST | `/api/push/subscribe` | Push 通知 subscription 登録（既存ライブラリ流用） | 要 | 5 |

### 2.3 ストリーミング応答

`POST /api/chat` は Server-Sent Events（SSE）または Response Streaming で返す。

形式（暫定）：

```
event: text
data: {"delta": "こ"}

event: text
data: {"delta": "ん"}

event: audio
data: {"audioUrl": "https://...wav", "sentenceIndex": 0}

event: motion
data: {"motion": "talking"}

event: done
data: {}
```

詳細は Phase 1 実装時に確定。

---

## 3. データモデル

### 3.1 論理モデル

```typescript
type User = {
    userId: string;          // googleId
    displayName: string;
    email: string;
    createdAt: string;       // ISO8601
    lastActiveAt: string;
};

type CharacterState = {
    userId: string;
    characterId: string;     // "hiyori" 等
    affectionLevel: number;
    lastInteractionAt: string;
    onboarded: boolean;
};

type LifecycleState = {
    userId: string;
    characterId: string;
    currentState: 'awake' | 'sleeping';
    bedtime: string;         // HH:mm（キャラの就寝時刻）
    wakeUpTime: string;      // HH:mm
    userActivityProfile: {   // ユーザー活動時間学習結果
        morningPeak: string; // HH:mm
        eveningPeak: string;
    };
};

type Message = {
    userId: string;
    characterId: string;
    messageId: string;       // ULID
    role: 'user' | 'assistant';
    text: string;
    audioS3Key?: string;
    createdAt: string;
    meta?: {
        tokenCount?: number;
        latencyMs?: number;
        motionUsed?: string;
    };
};

type Memory = {
    userId: string;
    characterId: string;
    memoryId: string;
    tier: 'A' | 'B' | 'C' | 'D';
    category: string;
    content: string;
    confidence: number;       // 0.0〜1.0
    referencedCount: number;
    lastReferencedAt?: string;
    createdAt: string;
    updatedAt: string;
};

type MemorySummary = {
    userId: string;
    characterId: string;
    summaryText: string;
    lastCompressedAt: string;
};

type Affection = {
    userId: string;
    characterId: string;
    level: number;
    sources: {                // 親密度上昇の根拠（3 軸）
        infoDisclosure: number;
        timeContinuity: number;
        bidirectionality: number;
    };
};

type Knowledge = {
    userId: string;
    characterId: string;
    knowledgeId: string;
    topic: string;
    summary: string;
    sourceUrls: string[];
    createdAt: string;
};

type Note = {
    userId: string;
    characterId: string;
    noteId: string;
    title: string;
    body: string;
    relatedKnowledgeIds: string[];
    createdAt: string;
    readAt?: string;
};

type StudyTopic = {
    userId: string;
    characterId: string;
    topicId: string;
    topic: string;
    priority: number;
    status: 'pending' | 'in_progress' | 'done';
    createdAt: string;
};

type SafetyEvent = {
    userId: string;
    eventId: string;
    detectedPattern: string;
    inputText: string;       // 検出された入力（PII を含むので別領域）
    responseTemplate: string;
    createdAt: string;
};
```

### 3.2 物理モデル（DynamoDB Single Table）

#### テーブル名: `nagiyu-livetalk-{env}`

| 属性 | 型 | 説明 |
|---|---|---|
| PK | string | `USER#<googleId>` |
| SK | string | エンティティ別（下記参照） |
| type | string | エンティティ種別 |
| data | object | エンティティ本体（JSON） |
| ttl | number | TTL（古いメッセージ削除用、Unix 秒） |
| createdAt | string | ISO8601 |
| updatedAt | string | ISO8601 |

#### SK パターン一覧

| エンティティ | SK | TTL |
|---|---|---|
| User Profile | `PROFILE` | なし |
| CharacterState | `CHAR#<charId>#STATE` | なし |
| LifecycleState | `CHAR#<charId>#LIFECYCLE` | なし |
| Affection | `CHAR#<charId>#AFFECTION` | なし |
| MemorySummary | `CHAR#<charId>#MEMORY#SUMMARY` | なし |
| Memory (Tier A) | `CHAR#<charId>#MEM#A#<category>#<id>` | なし |
| Memory (Tier B) | `CHAR#<charId>#MEM#B#<category>#<id>` | なし |
| Memory (Tier C) | `CHAR#<charId>#MEM#C#<category>#<id>` | 30 日 |
| Memory (Tier D) | `CHAR#<charId>#MEM#D#<id>` | 1 日 |
| Message | `CHAR#<charId>#MSG#<ulid>` | 90 日 |
| Knowledge | `CHAR#<charId>#KNOWLEDGE#<ulid>` | なし |
| Note | `CHAR#<charId>#NOTE#<ulid>` | なし |
| StudyTopic | `CHAR#<charId>#STUDY#<ulid>` | 30 日 |
| InterestCategory | `CHAR#<charId>#INTEREST#<category>` | なし |
| SafetyEvent | `SAFETY#<ulid>` | なし（別テーブル分離も検討） |
| NotificationEvent | `NOTIF#<ulid>` | 30 日 |

#### GSI

| GSI 名 | PK | SK | 用途 |
|---|---|---|---|
| - | - | - | MVP では GSI 不要、Phase 進行で必要になれば追加 |

#### 主要アクセスパターン

| 操作 | キー設計 |
|---|---|
| 起動時：ユーザーの全状態取得 | `Query PK=USER#<gid>, SK begins_with CHAR#<charId>#` |
| 直近 20 メッセージ取得 | `Query PK=USER#<gid>, SK begins_with CHAR#<charId>#MSG#, Limit 20, ScanIndexForward=false` |
| Tier B 記憶取得 | `Query PK=USER#<gid>, SK begins_with CHAR#<charId>#MEM#B#` |
| 親密度更新 | `UpdateItem PK=USER#<gid>, SK=CHAR#<charId>#AFFECTION` |
| メモリ昇格（C→B） | `DeleteItem + PutItem`（SK が変わるため） |

---

## 4. コンポーネント設計

### 4.1 パッケージ責務分担

| パッケージ | 責務 |
|---|---|
| `services/livetalk/core` | ビジネスロジック、リポジトリ、ユースケース |
| `services/livetalk/web` | UI（Next.js）、API Routes |
| `services/livetalk/batch` | バッチ処理（圧縮要約、勉強、通知、オフスクリーンイベント）。Phase 3 以降で追加 |
| `infra/livetalk` | CDK スタック（ECS Task、Target Group、S3 等） |

### 4.2 libs/ への追加候補

既存 `libs/` 配下に追加するライブラリ（汎用化）：

| ライブラリ | 責務 | Phase |
|---|---|---|
| `libs/voicevox-client` | VOICEVOX HTTP API クライアント | 1 |
| `libs/character-renderer` | CharacterDefinition、Live2D 描画ラッパー | 1 |
| `libs/llm-client` | OpenAI / Anthropic 抽象化、ストリーミング統一 | 2 |
| `libs/safety` | 危険発言検出、リソース管理 | 2 |
| `libs/memory` | Tier 管理、retrieval、信頼度スコア | 3 |
| `libs/affection` | 親密度計算 | 3 |
| `libs/lifecycle` | 生活サイクル判定、ユーザー学習 | 4 |
| `libs/study` | Web 検索、知識管理 | 5 |
| `libs/notification` | 通知配信判定、escalation | 5 |

`libs/common/src/auth/` には `livetalk:chat` permission を追加（Phase 1）。

### 4.3 主要モジュール（暫定）

#### core

| モジュール | パス | 役割 |
|---|---|---|
| MessageRepository | `core/src/repositories/messageRepository.ts` | DynamoDB のメッセージ CRUD |
| MemoryRepository | `core/src/repositories/memoryRepository.ts` | 同、メモリ |
| ChatUseCase | `core/src/usecases/chatUseCase.ts` | 入力→セーフティ→LLM→メモリ更新の orchestration |
| StreamingPipeline | `core/src/usecases/streamingPipeline.ts` | LLM stream + 文単位 TTS のパイプライン |
| CharacterPromptBuilder | `core/src/character/promptBuilder.ts` | system prompt の動的構築 |

#### web

| モジュール | パス | 役割 |
|---|---|---|
| ChatPage | `web/src/app/page.tsx` | チャット画面 |
| MemoryPage | `web/src/app/memory/page.tsx` | 記憶編集画面 |
| Live2DCanvas | `web/src/components/Live2DCanvas.tsx` | Live2D 描画 |
| ChatInput | `web/src/components/ChatInput.tsx` | 入力欄 |
| ChatStream | `web/src/components/ChatStream.tsx` | ストリーミング受信処理 |
| chat route | `web/src/app/api/chat/route.ts` | POST /api/chat |

### 4.4 モジュール間インターフェース

```typescript
// libs/character-renderer
export type CharacterDefinition = {
    id: string;
    displayName: string;
    
    // Live2D
    modelPath: string;
    motionMap: Record<LogicalMotion, string | null>;
    expressionMap: Record<LogicalExpression, string | null>;
    defaultScale: number;
    
    // キャラ性
    personality: PersonalityDefinition;
    voiceConfig: VoiceDefinition;
    
    // メタ
    license: {
        displayText: string;
        creditName: string;
    };
};

// libs/voicevox-client
export interface IVoiceClient {
    synthesize(text: string, speakerId: number): Promise<ArrayBuffer>;
}

// libs/llm-client
export interface ILLMClient {
    chatStream(messages: ChatMessage[], options?: ChatOptions): AsyncIterable<string>;
}

// libs/memory
export interface IMemoryRetriever {
    retrieve(query: string, options: RetrieveOptions): Promise<Memory[]>;
}

export interface IMemoryStore {
    add(item: NewMemory): Promise<Memory>;
    update(id: string, patch: Partial<Memory>): Promise<Memory>;
    delete(id: string): Promise<void>;
    promote(id: string, toTier: Tier): Promise<Memory>;
}
```

---

## 5. 実装上の注意点

### 5.1 依存関係・前提条件

- Phase 0 完了（dev ECS / ALB 基盤）
- Auth サービス稼働
- VOICEVOX 公式 Docker イメージへの ECR キャッシュ or 直接 pull
- OpenAI / Anthropic API キー（Secrets Manager）

### 5.2 パフォーマンス考慮事項

- **メッセージ取得は直近 N 件のみ**：全件取得は避ける、ページング不要
- **メモリ retrieval は in-memory cache + DynamoDB**：頻繁にアクセスされる Tier A は cache
- **VOICEVOX 起動時間（30〜60 秒）**：ECS Task の health check は startPeriod 60s 以上に
- **音声キャッシュ**：頻出フレーズは S3 にキャッシュ、md5 hash でキー化
- **LLM コスト**：用途別モデル振り分け（会話: GPT-4o、要約・分類: GPT-4o-mini）

### 5.3 セキュリティ考慮事項

- **認可チェック**：全 API Route で `withAuth(getSession, 'livetalk:chat', ...)` を必須化
- **入力バリデーション**：テキスト長制限、XSS 対策
- **PII 取り扱い**：会話履歴 + 記憶は機密扱い、ログには出さない
- **セーフティログ**：SafetyEvent は別領域、ユーザー会話本文を含むので暗号化を検討
- **OpenAI API キーは Lambda 環境変数ではなく Secrets Manager から動的取得**

### 5.4 テスト方針

- core パッケージ：純粋関数のユニットテスト中心、副作用部分はモック化
- カバレッジ目標 80% 以上（プラットフォーム規約）
- セーフティロジックは特に網羅的にテスト（false negative ゼロを目標）
- E2E テストは Phase 2 完了後に検討

---

## 6. ライセンス・コンプライアンス実装

### 6.1 必須表示

`web/src/components/LicenseFooter.tsx`（仮）で UI に常時表示：

```
Live2D Cubism / 桃瀬ひより
イラスト: かにビーム
VOICEVOX:冥鳴ひまり
```

### 6.2 利用規約 / プライバシーポリシー

- `web/src/app/legal/terms/page.tsx` に利用規約
- `web/src/app/legal/privacy/page.tsx` にプライバシーポリシー
- 18 歳以上同意フローを Phase 2 で実装

---

## 7. docs/ への移行メモ

開発完了後の永続化先：

- [ ] `docs/services/livetalk/requirements.md` に統合
- [ ] `docs/services/livetalk/external-design.md` に統合（画面設計）
- [ ] `docs/services/livetalk/architecture.md` に ADR を抽出して記録
    - ADR-001: クライアント描画
    - ADR-002: Single Table 設計
    - ADR-003: VOICEVOX 文単位パイプライン
    - ADR-004: 1 Task 2 Container
    - ADR-005: 親密度上昇のみ
    - ADR-006: 睡眠はスタイル変調
    - ADR-007: メモリ階層 + 編集 UI
    - ADR-008: 既存 RBAC
    - ADR-009: セーフティ自前実装
    - ADR-010: 桃瀬ひより + 冥鳴ひまり MVP
    - ADR-011: 通知設計
    - ADR-012: 「勉強する」強制ゲート
- [ ] `docs/development/shared-libraries.md` に新規ライブラリを追記（voicevox-client、character-renderer 等）
- [ ] `tasks/livetalk/` ディレクトリ削除
