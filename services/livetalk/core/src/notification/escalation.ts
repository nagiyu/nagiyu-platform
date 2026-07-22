import type { ILLMClient } from '../llm-client/types.js';
import { EscalationSchema } from '../llm-client/schemas/escalation.schema.js';
import type { TopicEntity } from '../entities/topic.entity.js';
import type { WebFactEntity } from '../entities/web-fact.entity.js';
import { NOTIFY_CRITICAL_EVENT_HORIZON_DAYS } from '../constants.js';

/**
 * escalation 判定 1 候補分について LLM に渡す WEB fact を絞り込む件数。
 * ObservedAt 降順で直近この件数のみを判定対象にし、LLM コストを抑える。
 */
const ESCALATION_RECENT_WEB_FACTS_LIMIT = 3;

export interface EscalationResult {
  isCritical: boolean;
  topicId: string | null;
  factId: string | null;
}

/**
 * detectCriticalTopic の入力候補 1 件（Topic ヘッダ + その配下の WEB fact 全件）。
 */
export interface DetectCriticalCandidate {
  topic: TopicEntity;
  webFacts: WebFactEntity[];
}

/**
 * detectCriticalTopic の入力インターフェース（リブトーク知識・記憶再設計 P5）。
 */
export interface DetectCriticalInput {
  /** care 降順などで並べた Topic 候補（WEB fact 込み）。先頭から順に評価する。 */
  candidates: DetectCriticalCandidate[];
  /** この値以上の Topic.Care を「高 care」とみなす閾値。 */
  careThreshold: number;
  llmClient: ILLMClient;
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
 * LLM に今日の日付を含む厳格なプロンプトで eventDate を抽出させる。
 */
function buildEscalationPrompt(todayStr: string): string {
  return `あなたは通知の緊急度を判定するアシスタントです。
今日の日付: ${todayStr}（JST）

以下のトピック情報から、「新作リリース・期間限定イベント・締切のある緊急情報」に関する具体的な日付（発売日・開催日・締切・終了日）を YYYY-MM-DD 形式で1つだけ抽出してください。

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
 * Topic 候補リストから時間帯外でも配信すべきクリティカル情報を判定する
 * （リブトーク知識・記憶再設計 P5: 通知の critical/ネタ源を Topic.Care + WEB fact へ移行）。
 *
 * 判定ロジック（AND ゲート）:
 *   critical = isHighCare AND isUrgent
 *
 * - isHighCare: `topic.Care >= careThreshold` か
 * - isUrgent: LLM で抽出した eventDate が今日以降 NOTIFY_CRITICAL_EVENT_HORIZON_DAYS 以内か
 *
 * LLM 呼び出しは isHighCare=true の Topic の WEB fact のみに行い、コストを節約する。
 * 各 Topic につき ObservedAt 降順で直近 ESCALATION_RECENT_WEB_FACTS_LIMIT 件のみを評価する。
 *
 * - 候補が複数あっても最初に urgent と判定した 1 件のみ返す（頻度キャップはバッチ側で担保）
 * - LLM 呼び出し失敗は best-effort（例外を握りつぶして次の候補へ）
 */
export async function detectCriticalTopic(input: DetectCriticalInput): Promise<EscalationResult> {
  const { candidates, careThreshold, llmClient, now } = input;

  const todayStr = toJstDateString(now);

  for (const candidate of candidates) {
    const { topic, webFacts } = candidate;

    // isHighCare=false の Topic は LLM を呼ばずスキップ
    if (topic.Care < careThreshold) continue;

    const recentWebFacts = [...webFacts]
      .sort((a, b) => b.ObservedAt - a.ObservedAt)
      .slice(0, ESCALATION_RECENT_WEB_FACTS_LIMIT);

    for (const webFact of recentWebFacts) {
      try {
        const result = await llmClient.chatStructured(
          [
            { role: 'system', content: buildEscalationPrompt(todayStr) },
            {
              role: 'user',
              content: `トピック: ${topic.Subject}\n内容: ${webFact.Text}`,
            },
          ],
          EscalationSchema,
          { purpose: 'classify' }
        );

        if (isUrgent(result.eventDate, now)) {
          return { isCritical: true, topicId: topic.TopicID, factId: webFact.FactID };
        }
      } catch {
        // best-effort: LLM 呼び出し失敗は無視して次の候補へ
      }
    }
  }

  return { isCritical: false, topicId: null, factId: null };
}
