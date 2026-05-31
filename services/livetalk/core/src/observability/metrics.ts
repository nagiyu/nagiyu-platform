import { logger } from '@nagiyu/common';
import { buildEmfPayload, type EmfMetricDefinition } from './emf.js';

/** チャット 1 回分の計測値を集約するアキュムレータ。 */
export interface ChatMetrics {
  userId: string;
  characterId: string;
  timestamp: string;

  /** プロンプトトークン内訳（概算・tiktoken gpt-4o ベース） */
  promptTokens: {
    /** system プロンプトの基底部分（メモリ・サマリを除く） */
    system: number;
    /** プロンプトに注入されたサマリ部分（現在は常に 0、将来の注入に備えて追跡） */
    summary: number;
    /** プロンプトに注入された記憶・学習内容（Tier A/B + newLearnings） */
    memory: number;
    /** 会話履歴 + 今回のユーザー発話 */
    messages: number;
    total: number;
  };

  /** retrieval で注入した件数（プロンプト gating が機能しているか確認用） */
  retrievedTierACount: number;
  retrievedTierBCount: number;

  /** DynamoDB に保存されている MemorySummary のサイズ（単調増加の検知用） */
  summaryTokenCount: number;
  summaryCharCount: number;

  /** Tier A の総件数（リトリーバルで全件取得されるため線形コスト） */
  tierATotalCount: number;

  /** 各フェーズのレイテンシ（ms）。計測できなかった場合は undefined */
  latency: {
    retrieve?: number;
    promotionCheck?: number;
    llmTtfb?: number;
    llmTotal?: number;
    voicevoxTotal?: number;
    chatTotal?: number;
  };

  /** DynamoDB 消費 RCU（取得できた範囲のみ）*/
  dynamodb: {
    messagesConsumedRcu?: number;
    memoryConsumedRcu?: number;
  };
}

export function createChatMetrics(userId: string, characterId: string): ChatMetrics {
  return {
    userId,
    characterId,
    timestamp: new Date().toISOString(),
    promptTokens: { system: 0, summary: 0, memory: 0, messages: 0, total: 0 },
    retrievedTierACount: 0,
    retrievedTierBCount: 0,
    summaryTokenCount: 0,
    summaryCharCount: 0,
    tierATotalCount: 0,
    latency: {},
    dynamodb: {},
  };
}

/** L1: 構造化ログを emit する（PII を含まない）。 */
export function emitChatMetricsLog(metrics: ChatMetrics): void {
  logger.info('[chat-observability] チャット計測', {
    userId: metrics.userId,
    characterId: metrics.characterId,
    promptTokens: metrics.promptTokens,
    retrievedTierACount: metrics.retrievedTierACount,
    retrievedTierBCount: metrics.retrievedTierBCount,
    summaryTokenCount: metrics.summaryTokenCount,
    summaryCharCount: metrics.summaryCharCount,
    tierATotalCount: metrics.tierATotalCount,
    latencyMs: metrics.latency,
    dynamodbRcu: metrics.dynamodb,
  });
}

/** L2: CloudWatch EMF メトリクスを emit する（Namespace: LiveTalk/Chat）。 */
export function emitChatMetricsEMF(metrics: ChatMetrics): void {
  const environment = process.env.NODE_ENV ?? 'unknown';

  const emfMetrics: EmfMetricDefinition[] = [
    { name: 'PromptTotalTokens', value: metrics.promptTokens.total, unit: 'Count' },
    { name: 'TierACount', value: metrics.tierATotalCount, unit: 'Count' },
    { name: 'MemorySummaryTokens', value: metrics.summaryTokenCount, unit: 'Count' },
  ];

  if (metrics.latency.llmTtfb !== undefined) {
    emfMetrics.push({
      name: 'LLMTimeToFirstToken',
      value: metrics.latency.llmTtfb,
      unit: 'Milliseconds',
    });
  }
  if (metrics.latency.chatTotal !== undefined) {
    emfMetrics.push({
      name: 'ChatTotalLatency',
      value: metrics.latency.chatTotal,
      unit: 'Milliseconds',
    });
  }
  if (metrics.latency.retrieve !== undefined) {
    emfMetrics.push({
      name: 'RetrieveLatency',
      value: metrics.latency.retrieve,
      unit: 'Milliseconds',
    });
  }

  const payload = buildEmfPayload({
    namespace: 'LiveTalk/Chat',
    dimensions: { Environment: environment, CharacterId: metrics.characterId },
    metrics: emfMetrics,
  });
  console.log(payload);
}

/** 圧縮バッチ 1 回分の計測値。 */
export interface BatchMetrics {
  userId: string;
  characterId: string;
  timestamp: string;
  messageCount: number;
  /** 圧縮後の MemorySummary トークン数（単調増加の検知用） */
  summaryTokenCount: number;
  summaryCharCount: number;
  latencyMs?: number;
}

/** L1: バッチ計測の構造化ログを emit する。 */
export function emitBatchMetricsLog(metrics: BatchMetrics): void {
  logger.info('[batch-observability] 圧縮バッチ計測', {
    userId: metrics.userId,
    characterId: metrics.characterId,
    messageCount: metrics.messageCount,
    summaryTokenCount: metrics.summaryTokenCount,
    summaryCharCount: metrics.summaryCharCount,
    latencyMs: metrics.latencyMs,
  });
}

/** L2: バッチ EMF メトリクスを emit する（Namespace: LiveTalk/Batch）。 */
export function emitBatchMetricsEMF(metrics: BatchMetrics): void {
  const environment = process.env.NODE_ENV ?? 'unknown';

  const emfMetrics: EmfMetricDefinition[] = [
    { name: 'MemorySummaryTokens', value: metrics.summaryTokenCount, unit: 'Count' },
    { name: 'CompressedMessageCount', value: metrics.messageCount, unit: 'Count' },
  ];

  if (metrics.latencyMs !== undefined) {
    emfMetrics.push({ name: 'BatchLatency', value: metrics.latencyMs, unit: 'Milliseconds' });
  }

  const payload = buildEmfPayload({
    namespace: 'LiveTalk/Batch',
    dimensions: { Environment: environment, CharacterId: metrics.characterId },
    metrics: emfMetrics,
  });
  console.log(payload);
}
