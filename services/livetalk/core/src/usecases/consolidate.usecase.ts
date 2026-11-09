import { performance } from 'perf_hooks';
import { logger } from '@nagiyu/common';
import {
  TOPIC_ROUTING_SIMILARITY_THRESHOLD,
  TOPIC_ROUTING_MAX_CANDIDATES,
  CONSOLIDATION_ROUTING_TEXT_MAX_CHARS,
  WEBFACT_REVIEW_INTERVAL_MS,
  WEB_FACT_TOPIC_LIMIT,
} from '../constants.js';
import { cosineSimilarity } from '../memory/embedding.js';
import { emitBatchMetricsLog, emitBatchMetricsEMF } from '../observability/metrics.js';
import { defaultUlidFactory, type UlidFactory } from '../lib/ulid.js';
import { formatJstMonthDay } from '../lib/format-date.js';
import { selectRecentWebFacts } from '../knowledge/recent-web-facts.js';
import { ConsolidationSchema } from '../llm-client/schemas/consolidation.schema.js';
import { buildConsolidatePrompt } from './consolidate.prompt.js';
import type { WebRawEntity } from '../entities/webraw.entity.js';
import type { IEmbeddingClient, ILLMClient } from '../llm-client/types.js';
import type { ConsolidationRaw } from '../llm-client/schemas/consolidation.schema.js';
import type { TopicEntity } from '../entities/topic.entity.js';
import type { WebFactEntity, WebFactVolatility } from '../entities/web-fact.entity.js';
import type { TopicRepository } from '../repositories/topic.repository.interface.js';
import type { MessageRepository } from '../repositories/message.repository.interface.js';
import type { WebRawRepository } from '../repositories/webraw.repository.interface.js';
import type { ConsolidationCursorRepository } from '../repositories/consolidation-cursor.repository.interface.js';

export interface ConsolidateParams {
  topicRepo: TopicRepository;
  messageRepo: MessageRepository;
  webRawRepo: WebRawRepository;
  cursorRepo: ConsolidationCursorRepository;
  llmClient: ILLMClient;
  embeddingClient: IEmbeddingClient;
  characterName: string;
  now?: () => number;
  /** 新規 Topic の ID 採番に使う（テスト差し替え用）。既定は {@link defaultUlidFactory} */
  ulidFactory?: UlidFactory;
}

/**
 * 揮発性区分から次回再検証予定時刻（nextReview）を計算する。
 * `stable` は再検証不要のため undefined を返す。
 */
function computeNextReview(volatility: WebFactVolatility, readAt: number): number | undefined {
  if (volatility === 'stable') return undefined;
  return readAt + WEBFACT_REVIEW_INTERVAL_MS[volatility];
}

/**
 * ルーティング用テキストを末尾側から `CONSOLIDATION_ROUTING_TEXT_MAX_CHARS` 文字に切り詰める。
 * 直近の話題ほど関連性が高いため、先頭（古い部分）を切り捨てる。
 */
function truncateRoutingText(text: string): string {
  if (text.length <= CONSOLIDATION_ROUTING_TEXT_MAX_CHARS) return text;
  return text.slice(text.length - CONSOLIDATION_ROUTING_TEXT_MAX_CHARS);
}

/**
 * 依頼由来 provenance を index 参照方式で紐付けるための、request-origin かつ
 * 依頼文・依頼日時が揃った WebRaw（甲-1）。
 */
type RequestWebRaw = WebRawEntity & { requestText: string; requestedAt: number };

/**
 * 今回バッチの request-origin WebRaw のうち、依頼文・依頼日時が揃ったものだけを
 * 順序付きリストとして抽出する（甲-1: 依頼由来 provenance）。
 * `filter` は元の順序を保つため、このリストの添字が LLM に提示する `[依頼 #N]` の N と
 * 一対一で対応する（プロンプト表示・解決の双方で同じ添字を権威的に使える）。
 */
function buildRequestWebRaws(webraws: WebRawEntity[]): RequestWebRaw[] {
  return webraws.filter(
    (w): w is RequestWebRaw =>
      w.origin === 'request' && w.requestText !== undefined && w.requestedAt !== undefined
  );
}

type TopicResult = ConsolidationRaw['topics'][number];

/**
 * LLM が返した `sourceRequestIndices`（[依頼 #N] の N の配列）から依頼フックを解決する
 * （甲-1: 依頼由来 provenance、index 参照方式）。日時・原文は必ずコード側（`requestWebRaws`、
 * WebRaw.requestText/requestedAt 由来）から取り、LLM は番号を返すだけにする（verbatim
 * エコー＋文字列突合は LLM の整形でずれて不安定だったため廃止）。
 * 範囲外・非整数の index（LLM の捏造・取り違え）は無視する。複数 index が解決できた場合は
 * 最新の requestedAt を採用する。
 */
function resolveRequestHookByIndices(
  indices: number[],
  requestWebRaws: RequestWebRaw[]
): { requestText: string; requestedAt: number } | undefined {
  let best: RequestWebRaw | undefined;
  for (const idx of indices) {
    if (!Number.isInteger(idx) || idx < 0 || idx >= requestWebRaws.length) continue;
    const w = requestWebRaws[idx];
    if (best === undefined || w.requestedAt > best.requestedAt) best = w;
  }
  return best ? { requestText: best.requestText, requestedAt: best.requestedAt } : undefined;
}

/**
 * 既存 Topic への merge グループについて、group.entries 全体の sourceRequestIndices を
 * 集めて依頼フックを解決する（fresh-eyes レビュー軽微#7 相当）。group 内のどのエントリが
 * 依頼由来かに関わらず、最新の依頼を取りこぼさず採用する。
 */
function resolveGroupRequestHook(
  entries: TopicResult[],
  requestWebRaws: RequestWebRaw[]
): { requestText: string; requestedAt: number } | undefined {
  const allIndices = entries.flatMap((e) => e.sourceRequestIndices);
  return resolveRequestHookByIndices(allIndices, requestWebRaws);
}

/**
 * LLM が返した Topic 結果の「解決先」ごとのグループ。
 * 同一の既存 Topic を指す複数エントリは 1 グループに畳み、META の
 * 二重 put（＝古い UpdatedAt を掴んだ 2 件目の `OptimisticLockError`）を防ぐ。
 * 新規（targetTopicId が空、または候補に無い id）エントリは互いに別話題の
 * 可能性があるため畳まず、1 エントリ＝1 グループのまま扱う。
 */
type ResolvedTopicGroup =
  | { kind: 'existing'; topicId: string; entries: TopicResult[] }
  | { kind: 'new'; entry: TopicResult };

/**
 * `result.topics` を解決先（既存 Topic / 新規）でグルーピングする。
 * 挿入順（LLM が返した順）を維持したまま、同一の既存 topicId を指す
 * エントリだけを 1 グループへ畳む。
 */
function groupTopicResults(
  topics: TopicResult[],
  candidateMap: Map<string, TopicEntity>
): ResolvedTopicGroup[] {
  const groups: ResolvedTopicGroup[] = [];
  const existingGroupIndex = new Map<string, number>();

  for (const topicResult of topics) {
    const existing =
      topicResult.targetTopicId !== '' ? candidateMap.get(topicResult.targetTopicId) : undefined;

    if (!existing) {
      groups.push({ kind: 'new', entry: topicResult });
      continue;
    }

    const index = existingGroupIndex.get(existing.topicId);
    if (index === undefined) {
      existingGroupIndex.set(existing.topicId, groups.length);
      groups.push({ kind: 'existing', topicId: existing.topicId, entries: [topicResult] });
      continue;
    }

    const group = groups[index];
    if (group.kind === 'existing') {
      group.entries.push(topicResult);
    }
  }

  return groups;
}

/**
 * グループ内の全エントリが生む SELF fact の合計件数を数える。
 * care は「ユーザー起点の fold でだけ上げる」ため、その fold が SELF fact を
 * 1 件でも生んだか（＝会話由来の情報を含むか）を putTopic 前に判定するのに使う。
 */
function countSelfFacts(entries: TopicResult[]): number {
  return entries.reduce((n, e) => n + e.selfFacts.length, 0);
}

/**
 * 統合先 Topic の既存 WEB fact のうち、LLM に番号付きで見せたもの（番号 → 事実）。
 * この Map に載っている番号だけが、そのグループの replace / duplicate の有効な参照先になる。
 */
type ExistingFactRefs = ReadonlyMap<number, WebFactEntity>;

/** WEB fact の適用結果の件数。 */
interface WebFactCounts {
  added: number;
  replaced: number;
  duplicated: number;
}

/**
 * LLM が返した番号を、統合先 Topic の既存の事実を指す有効な番号だけに絞る。
 * 範囲外・非整数・別 Topic の事実を指す番号（LLM の捏造・取り違え）は無視する。重複は畳む。
 */
function filterValidFactIndices(indices: number[], refs: ExistingFactRefs): number[] {
  return [...new Set(indices.filter((i) => Number.isInteger(i) && refs.has(i)))];
}

/**
 * 1 Topic 分の selfFacts/webFacts をグループ内の全エントリ分連結して追記する。
 *
 * webFacts は既存の事実との見比べ結果（add / replace / duplicate）に従って適用する。
 * 有効な番号が残らない replace / duplicate は add として扱う（溜まりすぎは上限が受け止める）。
 * 適用順は「作成 → 重複の観測日更新 → 古い事実の削除」で、途中で落ちても事実が失われず、
 * 多い側に倒れる。同じ既存の事実を複数のエントリが指しても、削除・更新はそれぞれ 1 回だけ行い、
 * 削除予定の事実は重複の更新対象から外す。
 */
async function appendTopicFacts(
  topicRepo: TopicRepository,
  userId: string,
  characterId: string,
  topicId: string,
  entries: TopicResult[],
  readAt: number,
  existingFacts: ExistingFactRefs
): Promise<{ selfFactCount: number } & WebFactCounts> {
  let selfFactCount = 0;

  type Planned = {
    wf: TopicResult['webFacts'][number];
    action: 'add' | 'replace' | 'duplicate';
    indices: number[];
  };
  const planned: Planned[] = [];

  for (const entry of entries) {
    for (const sf of entry.selfFacts) {
      await topicRepo.putSelfFact({
        userId,
        characterId,
        topicId,
        text: sf.text,
        provenance: sf.provenance,
      });
      selfFactCount++;
    }

    for (const wf of entry.webFacts) {
      const indices =
        wf.action === 'add' ? [] : filterValidFactIndices(wf.existingFactIndices, existingFacts);
      planned.push({
        wf,
        action: indices.length === 0 ? 'add' : wf.action,
        indices,
      });
    }
  }

  // 置き換えで消える事実は、他のエントリの duplicate の更新対象から外す
  const deleteIndices = new Set<number>(
    planned.filter((p) => p.action === 'replace').flatMap((p) => p.indices)
  );
  for (const p of planned) {
    if (p.action !== 'duplicate') continue;
    p.indices = p.indices.filter((i) => !deleteIndices.has(i));
    if (p.indices.length === 0) p.action = 'add';
  }

  const counts: WebFactCounts = { added: 0, replaced: 0, duplicated: 0 };
  const touchIndices = new Set<number>();

  for (const p of planned) {
    if (p.action === 'duplicate') {
      counts.duplicated++;
      p.indices.forEach((i) => touchIndices.add(i));
      continue;
    }
    await topicRepo.putWebFact({
      userId,
      characterId,
      topicId,
      text: p.wf.text,
      sourceUrls: p.wf.sourceUrls,
      volatility: p.wf.volatility,
      observedAt: readAt,
      nextReview: computeNextReview(p.wf.volatility, readAt),
    });
    if (p.action === 'replace') counts.replaced++;
    else counts.added++;
  }

  for (const i of touchIndices) {
    const fact = existingFacts.get(i);
    if (!fact) continue;
    const nextReview = computeNextReview(fact.volatility, readAt);
    await topicRepo.updateWebFactObservation(
      { userId, characterId, topicId, factId: fact.factId },
      { observedAt: readAt, ...(nextReview !== undefined ? { nextReview } : {}) }
    );
  }

  for (const i of deleteIndices) {
    const fact = existingFacts.get(i);
    if (!fact) continue;
    await topicRepo.deleteWebFact({ userId, characterId, topicId, factId: fact.factId });
  }

  return { selfFactCount, ...counts };
}

/**
 * Topic の WEB fact が `WEB_FACT_TOPIC_LIMIT` を超えていれば、超えた分を削除する。
 * 消す順は「stable 以外の観測日の古いもの」→「stable の観測日の古いもの」。stable も件数に数える
 * （stable は再検証されず溜まり続けるため、数えないと上限が効かない）。
 *
 * @returns 削除した件数
 */
async function trimWebFacts(
  topicRepo: TopicRepository,
  userId: string,
  characterId: string,
  topicId: string
): Promise<number> {
  const facts = await topicRepo.listWebFacts(userId, characterId, topicId);
  const excess = facts.length - WEB_FACT_TOPIC_LIMIT;
  if (excess <= 0) return 0;

  const oldestFirst = (a: WebFactEntity, b: WebFactEntity): number =>
    a.observedAt !== b.observedAt
      ? a.observedAt - b.observedAt
      : a.factId < b.factId
        ? -1
        : a.factId > b.factId
          ? 1
          : 0;
  const victims = [
    ...facts.filter((f) => f.volatility !== 'stable').sort(oldestFirst),
    ...facts.filter((f) => f.volatility === 'stable').sort(oldestFirst),
  ].slice(0, excess);

  for (const fact of victims) {
    await topicRepo.deleteWebFact({ userId, characterId, topicId, factId: fact.factId });
  }
  return victims.length;
}

/**
 * 1 ユーザー × 1 キャラの未集約データ（Message / WebRaw）を Topic 中心モデルへ集約する
 * （リブトーク知識再設計 P1 / #3697）。
 *
 * 処理フロー：
 * 1. CURSOR から前回集約済み位置（msgCursor / webrawCursor）を取得
 * 2. カーソル以降の Message / WebRaw を listSince で取得。両方 0 件なら 'skipped'
 * 3. 新規データ（会話 + Web 生データ）から「ルーティング用テキスト」を作り、埋め込みで
 *    既存 Topic ヘッダ（GSI3 経由で全件列挙）との cosine similarity を計算し、閾値以上・
 *    上位 N 件を候補 Topic として LLM プロンプトに渡す
 * 4. LLM が話題ごとに「既存 Topic への merge」または「新規作成」を判断し、
 *    canonicalSummary・selfFacts・webFacts を返す
 * 5. 各 Topic について META（put）→ SELF/WEB fact（append）の順で書き込む
 * 6. 全 Topic の適用が成功したら、カーソルをストリーム別・条件付きで前進させる
 *
 * 書き込み順序の意図（at-least-once 保証、`compressConversation` と同じ設計）：
 * META・fact の書き込みをカーソル前進（cursorRepo.put）より先に行う。
 * 途中で例外が発生した場合はそのまま伝播させ、カーソルは前進しない。
 * 次回実行（DLQ/リトライ含む）で同じ Message/WebRaw が再処理され、集約の永久欠落を防ぐ。
 *
 * カーソルは Message / WebRaw で独立して管理し、消費した範囲の最大 CreatedAt までにしか
 * 前進させない（空ストリームは据え置き）。これにより `listSince` の strict `>` と
 * 条件付き put（楽観ロック）で二重処理を防ぎつつ、backdated なデータの欠落を最小化する。
 *
 * `OptimisticLockError`（putTopic / cursorRepo.put の条件不一致）はここでは捕捉せず、
 * そのまま呼び出し元に伝播させる（カーソル未前進のまま次回再処理される）。
 *
 * @returns 'consolidated' | 'skipped'
 */
export async function consolidate(
  userId: string,
  characterId: string,
  params: ConsolidateParams
): Promise<'consolidated' | 'skipped'> {
  const {
    topicRepo,
    messageRepo,
    webRawRepo,
    cursorRepo,
    llmClient,
    embeddingClient,
    characterName,
    now = () => Date.now(),
    ulidFactory = defaultUlidFactory,
  } = params;

  const batchStart = performance.now();

  const cursor = await cursorRepo.get(userId, characterId);
  const msgCursor = cursor?.msgCursor ?? 0;
  const webrawCursor = cursor?.webrawCursor ?? 0;
  const cursorUpdatedAt = cursor?.updatedAt;

  const messages = await messageRepo.listSince(userId, characterId, msgCursor);
  const webraws = await webRawRepo.listSince(userId, characterId, webrawCursor);

  if (messages.length === 0 && webraws.length === 0) {
    logger.info('[consolidate] スキップ（未集約データなし）', { userId, characterId });
    return 'skipped';
  }

  // listSince 直後にスナップショットを取ることで、WEB fact の観測時刻・再検証起点を
  // 集約処理中の時間経過に依存させない（compressConversation の compressedUpTo と同じ意図）
  const readAt = now();

  logger.info('[consolidate] 集約開始', {
    userId,
    characterId,
    messageCount: messages.length,
    webRawCount: webraws.length,
  });

  // ---- ルーティング候補の算出 ----
  const routingTextRaw = [
    ...messages.map((m) => `${m.role}: ${m.text}`),
    ...webraws.map((w) => w.rawText),
  ].join('\n');
  const routingText = truncateRoutingText(routingTextRaw);

  const queryEmbedding = await embeddingClient.embed(routingText);
  const headers = await topicRepo.listTopicHeaders(userId, characterId);

  const scored = headers
    .map((header) => ({ header, similarity: cosineSimilarity(queryEmbedding, header.embedding) }))
    .filter((s) => s.similarity >= TOPIC_ROUTING_SIMILARITY_THRESHOLD)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, TOPIC_ROUTING_MAX_CANDIDATES);

  const candidateMap = new Map<string, TopicEntity>(
    scored.map((s) => [s.header.topicId, s.header])
  );

  // ---- LLM 呼び出し ----
  // 今回バッチの request-origin WebRaw から、index 参照方式で使う「採用可能な依頼 WebRaw」の
  // 順序付きリストを作る（甲-1: 依頼由来 provenance）。この配列の添字が LLM に見せる
  // `[依頼 #N]` の N になる。LLM には番号だけを返させ、権威ある依頼文・requestedAt は
  // 必ずこのリスト（コード側）から取る。
  const requestWebRaws = buildRequestWebRaws(webraws);
  const requestIndexByRawId = new Map<string, number>(requestWebRaws.map((w, i) => [w.rawId, i]));

  // 候補 Topic ごとの既存 WEB fact を新しい側に絞って読み、プロンプト全体で通しの番号を振る
  // （index 参照方式。LLM には番号だけを返させ、実体は必ずこちらの配列から引く）。
  const candidateFacts = await Promise.all(
    scored.map(async (s) =>
      selectRecentWebFacts(
        await topicRepo.listWebFacts(userId, characterId, s.header.topicId),
        WEB_FACT_TOPIC_LIMIT
      )
    )
  );
  const existingFactRefsByTopic = new Map<string, Map<number, WebFactEntity>>();
  let nextFactIndex = 0;
  const candidateTopics = scored.map((s, i) => {
    const refs = new Map<number, WebFactEntity>();
    const existingWebFacts = candidateFacts[i].map((fact) => {
      const index = nextFactIndex++;
      refs.set(index, fact);
      return {
        index,
        text: fact.text,
        volatility: fact.volatility,
        observedAtLabel: formatJstMonthDay(fact.observedAt),
      };
    });
    existingFactRefsByTopic.set(s.header.topicId, refs);
    return {
      topicId: s.header.topicId,
      subject: s.header.subject,
      category: s.header.category,
      canonicalSummary: s.header.canonicalSummary,
      existingWebFacts,
    };
  });

  const promptMessages = buildConsolidatePrompt({
    characterName,
    candidateTopics,
    newMessages: messages.map((m) => ({ role: m.role, text: m.text })),
    webRaws: webraws.map((w) => ({
      query: w.query,
      rawText: w.rawText,
      sourceUrls: w.sourceUrls,
      origin: w.origin,
      requestText: w.requestText,
      requestedAtLabel: w.requestedAt !== undefined ? formatJstMonthDay(w.requestedAt) : undefined,
      requestIndex: requestIndexByRawId.get(w.rawId),
    })),
  });

  const result = await llmClient.chatStructured(promptMessages, ConsolidationSchema, {
    purpose: 'summarize',
  });

  // ---- 適用（at-least-once: 例外はそのまま伝播させ、カーソルを前進させない）----
  // 解決先（既存 Topic / 新規）でグルーピングしてから適用する。同一の既存 targetTopicId を
  // LLM が複数返しても、META の put は 1 グループにつき 1 回だけになるため、
  // candidateMap 由来の古い UpdatedAt を 2 回目以降に使ってしまう
  // OptimisticLockError（＝恒久スタック）を防ぐ（fresh-eyes レビュー指摘）。
  let newTopicCount = 0;
  let updatedTopicCount = 0;
  let selfFactCount = 0;
  let webFactCount = 0;
  let replacedWebFactCount = 0;
  let duplicateWebFactCount = 0;
  // 上限の適用対象にするため、META を書いた Topic（新規・既存とも）を覚える
  const touchedTopicIds = new Set<string>();

  const groups = groupTopicResults(result.topics, candidateMap);

  for (const group of groups) {
    if (group.kind === 'new') {
      // 新規 Topic（targetTopicId が空文字、または候補に無い id ＝ hallucination 保険）
      const topicResult = group.entry;
      const topicId = ulidFactory();
      const topicEmbedding = await embeddingClient.embed(
        `${topicResult.subject}\n${topicResult.canonicalSummary}`
      );
      const requestHook = resolveRequestHookByIndices(
        topicResult.sourceRequestIndices,
        requestWebRaws
      );
      await topicRepo.putTopic({
        userId,
        characterId,
        topicId,
        subject: topicResult.subject,
        canonicalSummary: topicResult.canonicalSummary,
        category: topicResult.category,
        care: countSelfFacts([topicResult]) > 0 ? 1 : 0,
        embedding: topicEmbedding,
        ...(requestHook ?? {}),
      });
      newTopicCount++;

      const counts = await appendTopicFacts(
        topicRepo,
        userId,
        characterId,
        topicId,
        [topicResult],
        readAt,
        new Map()
      );
      touchedTopicIds.add(topicId);
      selfFactCount += counts.selfFactCount;
      webFactCount += counts.added + counts.replaced;
      replacedWebFactCount += counts.replaced;
      duplicateWebFactCount += counts.duplicated;
      continue;
    }

    // 既存 Topic への merge（名寄せ）。expectedUpdatedAt は candidateMap（GSI3 の結果整合
    // クエリ）由来の値ではなく、ベーステーブルから取り直した権威ある現在値を使う
    // （GSI 反映遅延による spurious な OptimisticLockError を防ぐ）。
    // グループ内で最後に出現したエントリの内容を META に採用する（最新の集約結果を優先）。
    const last = group.entries[group.entries.length - 1];
    const topicEmbedding = await embeddingClient.embed(`${last.subject}\n${last.canonicalSummary}`);
    const current = await topicRepo.getTopic({
      userId,
      characterId,
      topicId: group.topicId,
    });
    // group.entries 全体の sourceRequestIndices から依頼フックを解決する
    // （fresh-eyes レビュー軽微#7）。採用エントリ（last）の index だけでは、依頼フックが
    // 別エントリにある場合に取りこぼす。
    const requestHook = resolveGroupRequestHook(group.entries, requestWebRaws);
    const groupSelfFactCount = countSelfFacts(group.entries);

    let topicId: string;
    if (current) {
      topicId = current.topicId;
      // 今回依頼フックが解決できればそれで上書きし、できなければ既存の依頼フックを引き継ぐ
      // （既存 Topic の依頼フックを非依頼 consolidation で消さないため）。
      const inheritedHook =
        requestHook ??
        (current.requestText !== undefined && current.requestedAt !== undefined
          ? { requestText: current.requestText, requestedAt: current.requestedAt }
          : undefined);
      await topicRepo.putTopic(
        {
          userId,
          characterId,
          topicId,
          subject: last.subject,
          canonicalSummary: last.canonicalSummary,
          category: last.category,
          care: groupSelfFactCount > 0 ? current.care + 1 : current.care,
          embedding: topicEmbedding,
          ...(inheritedHook ?? {}),
        },
        { expectedUpdatedAt: current.updatedAt }
      );
      updatedTopicCount++;
    } else {
      // 防御的フォールバック: candidateMap には存在したが、ベーステーブルからは
      // 既に消えていた（本来あり得ないが、念のため新規 Topic 作成にフォールバックする）
      topicId = ulidFactory();
      await topicRepo.putTopic({
        userId,
        characterId,
        topicId,
        subject: last.subject,
        canonicalSummary: last.canonicalSummary,
        category: last.category,
        care: groupSelfFactCount > 0 ? 1 : 0,
        embedding: topicEmbedding,
        ...(requestHook ?? {}),
      });
      newTopicCount++;
    }

    const counts = await appendTopicFacts(
      topicRepo,
      userId,
      characterId,
      topicId,
      group.entries,
      readAt,
      // 番号は統合先 Topic の事実だけを指せる。META が消えていて新規扱いにした場合は参照先が無い
      current ? (existingFactRefsByTopic.get(group.topicId) ?? new Map()) : new Map()
    );
    touchedTopicIds.add(topicId);
    selfFactCount += counts.selfFactCount;
    webFactCount += counts.added + counts.replaced;
    replacedWebFactCount += counts.replaced;
    duplicateWebFactCount += counts.duplicated;
  }

  // ---- 上限の適用（その実行で触れた Topic すべて。溜まりきった Topic もここで減る）----
  let trimmedWebFactCount = 0;
  for (const topicId of touchedTopicIds) {
    trimmedWebFactCount += await trimWebFacts(topicRepo, userId, characterId, topicId);
  }

  // ---- カーソル前進（ストリーム別・条件付き。空ストリームは据え置き）----
  const newMsgCursor = messages.length ? Math.max(...messages.map((m) => m.createdAt)) : msgCursor;
  const newWebrawCursor = webraws.length
    ? Math.max(...webraws.map((w) => w.createdAt))
    : webrawCursor;

  await cursorRepo.put(
    {
      userId,
      characterId,
      msgCursor: newMsgCursor,
      webrawCursor: newWebrawCursor,
    },
    { expectedUpdatedAt: cursorUpdatedAt }
  );

  // バッチ計測（best-effort）
  try {
    const batchMetrics = {
      userId,
      characterId,
      timestamp: new Date().toISOString(),
      messageCount: messages.length,
      latencyMs: Math.round(performance.now() - batchStart),
    };
    emitBatchMetricsLog(batchMetrics);
    emitBatchMetricsEMF(batchMetrics);
  } catch (err) {
    logger.warn('[consolidate] バッチ計測の emit に失敗しました', { err });
  }

  logger.info('[consolidate] 集約完了', {
    userId,
    characterId,
    topicCount: result.topics.length,
    newTopicCount,
    updatedTopicCount,
    selfFactCount,
    webFactCount,
    addedWebFactCount: webFactCount - replacedWebFactCount,
    replacedWebFactCount,
    duplicateWebFactCount,
    trimmedWebFactCount,
  });

  return 'consolidated';
}
