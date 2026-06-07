import type { ILLMClient, IEmbeddingClient } from '../llm-client/types.js';
import { EscalationSchema } from '../llm-client/schemas/escalation.schema.js';
import type { KnowledgeEntity } from '../entities/knowledge.entity.js';
import type { InterestCategoryEntity } from '../entities/interest-category.entity.js';
import { cosineSimilarity } from '../memory/embedding.js';
import {
  INTEREST_DEDUP_SIMILARITY_THRESHOLD,
  NOTIFY_CRITICAL_INTEREST_SHARE_THRESHOLD,
  NOTIFY_CRITICAL_EVENT_HORIZON_DAYS,
} from '../constants.js';

export interface EscalationResult {
  isCritical: boolean;
  knowledgeId: string | null;
}

/**
 * detectCriticalKnowledge の入力インターフェース。
 */
export interface DetectCriticalInput {
  knowledgeList: KnowledgeEntity[];
  /** ユーザーの興味カテゴリ（Weight 付き） */
  interestCategories: InterestCategoryEntity[];
  llmClient: ILLMClient;
  embeddingClient: IEmbeddingClient;
  /** 判定基準時刻（today 計算・LLM プロンプトの今日日付注入に使用） */
  now: Date;
}

/**
 * JST の今日の日付を "YYYY-MM-DD" 形式で返す。
 *
 * Node.js は TZ=Asia/Tokyo で実行されることを前提とする。
 */
function toJstDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * "YYYY-MM-DD" 文字列をローカル時刻の午前 0 時として Date に変換する。解析失敗は null を返す。
 *
 * タイムゾーン非依存（ローカル時刻）で統一することで、本番（TZ=Asia/Tokyo）でも
 * テスト環境（UTC）でも now.setHours(0,0,0,0) と比較できる。
 */
function parseDateString(dateStr: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) return null;
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return null;
  const [year, month, day] = parts;
  // Date コンストラクタに年月日を直接渡す（ローカル時刻の午前 0 時）
  const d = new Date(year, month - 1, day);
  if (isNaN(d.getTime())) return null;
  return d;
}

/**
 * Knowledge の RelatedCategory を interestCategories の正規カテゴリに解決する。
 *
 * 解決手順:
 *   1. Category との完全一致
 *   2. embedding 類似度で INTEREST_DEDUP_SIMILARITY_THRESHOLD 以上のカテゴリを探す
 *   3. 解決できなければ null
 *
 * embed 呼び出し結果は embeddingCache にキャッシュして無駄打ちを避ける。
 */
async function resolveToInterestCategory(
  relatedCategory: string,
  interestCategories: InterestCategoryEntity[],
  embeddingClient: IEmbeddingClient,
  embeddingCache: Map<string, number[]>
): Promise<InterestCategoryEntity | null> {
  if (interestCategories.length === 0) return null;

  // 1. 完全一致
  const exact = interestCategories.find((c) => c.Category === relatedCategory);
  if (exact) return exact;

  // 2. embedding 類似度で解決
  let relatedVec: number[];
  const cached = embeddingCache.get(relatedCategory);
  if (cached) {
    relatedVec = cached;
  } else {
    relatedVec = await embeddingClient.embed(relatedCategory);
    embeddingCache.set(relatedCategory, relatedVec);
  }

  let bestCategory: InterestCategoryEntity | null = null;
  let bestSimilarity = -Infinity;

  for (const category of interestCategories) {
    // カテゴリのベクトルは entity の Embedding があれば使い、無ければ生成
    let catVec: number[];
    const catCached = embeddingCache.get(category.Category);
    if (catCached) {
      catVec = catCached;
    } else if (category.Embedding) {
      catVec = category.Embedding;
      embeddingCache.set(category.Category, catVec);
    } else {
      catVec = await embeddingClient.embed(category.Category);
      embeddingCache.set(category.Category, catVec);
    }

    const similarity = cosineSimilarity(relatedVec, catVec);
    if (similarity > bestSimilarity) {
      bestSimilarity = similarity;
      bestCategory = category;
    }
  }

  if (bestSimilarity >= INTEREST_DEDUP_SIMILARITY_THRESHOLD) {
    return bestCategory;
  }

  return null;
}

/**
 * 興味カテゴリの全 Weight 合計を計算する。
 */
function totalWeight(interestCategories: InterestCategoryEntity[]): number {
  return interestCategories.reduce((sum, c) => sum + c.Weight, 0);
}

/**
 * LLM に今日の日付を含む厳格なプロンプトで eventDate を抽出させる。
 */
function buildEscalationPrompt(todayStr: string): string {
  return `あなたは通知の緊急度を判定するアシスタントです。
今日の日付: ${todayStr}（JST）

以下の知識情報から、「新作リリース・期間限定イベント・締切のある緊急情報」に関する具体的な日付（発売日・開催日・締切・終了日）を YYYY-MM-DD 形式で1つだけ抽出してください。

抽出ルール:
- 具体的な将来日付が記載されている場合のみ eventDate を返す
- 「最新トレンド」「ランキング」「一般的な雑学」「日付の無い新着情報」「過去の情報」は eventDate=null
- 相対表現（今週末・来月等）は今日の日付（${todayStr}）を基準に YYYY-MM-DD に変換して返す
- 変換できない場合や日付が不明な場合は null
- reason には判定理由を簡潔に記述する`;
}

/**
 * isUrgent を判定する。
 *
 * LLM が抽出した eventDate が今日以降かつ NOTIFY_CRITICAL_EVENT_HORIZON_DAYS 以内であれば true。
 */
function isUrgent(eventDate: string | null, now: Date): boolean {
  if (!eventDate) return false;

  const parsed = parseDateString(eventDate);
  if (!parsed) return false;

  const todayStart = new Date(now);
  todayStart.setHours(0, 0, 0, 0);

  const horizonEnd = new Date(todayStart);
  horizonEnd.setDate(horizonEnd.getDate() + NOTIFY_CRITICAL_EVENT_HORIZON_DAYS);

  // 今日以降かつ horizon 以内（当日含む、horizon の当日含む）
  return parsed >= todayStart && parsed <= horizonEnd;
}

/**
 * KNOWLEDGE リストから時間帯外でも配信すべきクリティカル情報を判定する。
 *
 * 判定ロジック（AND ゲート）:
 *   critical = isStrongInterest AND isUrgent
 *
 * - isStrongInterest: RelatedCategory を正規カテゴリに解決し、そのシェアが閾値以上か
 * - isUrgent: LLM で抽出した eventDate が今日以降 NOTIFY_CRITICAL_EVENT_HORIZON_DAYS 以内か
 *
 * LLM 呼び出しは isStrongInterest=true の場合のみ行い、コストを節約する。
 *
 * - 候補が複数あっても最初の 1 件のみ返す（頻度キャップはバッチ側で担保）
 * - LLM/embedding 呼び出し失敗は best-effort（例外を握りつぶして次の候補へ）
 */
export async function detectCriticalKnowledge(
  input: DetectCriticalInput
): Promise<EscalationResult> {
  const { knowledgeList, interestCategories, llmClient, embeddingClient, now } = input;

  const total = totalWeight(interestCategories);
  const embeddingCache = new Map<string, number[]>();
  const todayStr = toJstDateString(now);

  for (const knowledge of knowledgeList) {
    try {
      // (a) isStrongInterest: RelatedCategory を正規カテゴリに解決してシェアを計算
      let strongInterest = false;

      if (total > 0) {
        const resolvedCategory = await resolveToInterestCategory(
          knowledge.RelatedCategory,
          interestCategories,
          embeddingClient,
          embeddingCache
        );

        if (resolvedCategory) {
          const share = resolvedCategory.Weight / total;
          strongInterest = share >= NOTIFY_CRITICAL_INTEREST_SHARE_THRESHOLD;
        }
      }

      // isStrongInterest=false の場合は LLM を呼ばずスキップ
      if (!strongInterest) continue;

      // (b) isUrgent: LLM で eventDate を抽出し、ルールゲートで判定
      const result = await llmClient.chatStructured(
        [
          { role: 'system', content: buildEscalationPrompt(todayStr) },
          {
            role: 'user',
            content: `トピック: ${knowledge.Topic}\n要約: ${knowledge.Summary}`,
          },
        ],
        EscalationSchema,
        { purpose: 'classify' }
      );

      if (isUrgent(result.eventDate, now)) {
        return { isCritical: true, knowledgeId: knowledge.KnowledgeID };
      }
    } catch {
      // best-effort: LLM/embedding 失敗は無視して次の候補へ
    }
  }

  return { isCritical: false, knowledgeId: null };
}
