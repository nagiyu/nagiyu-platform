import OpenAI from 'openai';
import { zodTextFormat } from 'openai/helpers/zod';
import { z } from 'zod';
import { withRetry } from '@nagiyu/common';
import type { AiAnalysisResult } from '@nagiyu/stock-tracker-core';

const OPENAI_MODEL = 'gpt-5-mini';
const MAX_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 120_000;
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/gif', 'image/webp']);
const ERROR_MESSAGES = {
  INVALID_RESPONSE: 'AI解析の応答が不正です',
  TIMEOUT: 'OpenAI APIの呼び出しがタイムアウトしました',
} as const;
const UNSET_VALUE_DISPLAY = '-';

export interface HistoricalPriceData {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

export interface AiAnalysisInput {
  tickerId: string;
  name: string;
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
  buyPatternCount: number;
  sellPatternCount: number;
  patternSummary: string;
  historicalData: HistoricalPriceData[];
  chartImageBase64?: string;
}

type OpenAiImageInput = {
  type: 'input_image';
  image_url: string;
  detail: 'auto';
};

const aiAnalysisResultSchema = z.object({
  priceMovementAnalysis: z.string(),
  patternAnalysis: z.string(),
  supportLevels: z.array(z.number()).length(3),
  resistanceLevels: z.array(z.number()).length(3),
  relatedMarketTrend: z.string(),
  investmentJudgment: z.object({
    signal: z.enum(['BULLISH', 'NEUTRAL', 'BEARISH']),
    reason: z.string(),
  }),
});

export async function generateAiAnalysis(
  apiKey: string,
  input: AiAnalysisInput
): Promise<AiAnalysisResult> {
  const client = new OpenAI({
    apiKey,
    maxRetries: 0,
  });
  const imageInput = toSupportedImageInput(input.chartImageBase64);

  const response = await withRetry(
    async () =>
      withTimeout(
        client.responses.parse({
          model: OPENAI_MODEL,
          stream: false,
          tools: [{ type: 'web_search' }],
          tool_choice: 'required',
          text: {
            format: zodTextFormat(aiAnalysisResultSchema, 'stock_ai_analysis'),
          },
          input: [
            {
              role: 'user',
              content: [
                {
                  type: 'input_text',
                  text: createPrompt(input),
                },
                ...(imageInput ? [imageInput] : []),
              ],
            },
          ],
        }),
        REQUEST_TIMEOUT_MS
      ),
    { maxRetries: MAX_RETRIES }
  );

  if (!response.output_parsed) {
    throw new Error(ERROR_MESSAGES.INVALID_RESPONSE);
  }

  return {
    ...response.output_parsed,
    supportLevels: toLevelTuple(response.output_parsed.supportLevels),
    resistanceLevels: toLevelTuple(response.output_parsed.resistanceLevels),
  };
}

function toSupportedImageInput(chartImageBase64: string | undefined): OpenAiImageInput | undefined {
  if (!chartImageBase64) {
    return undefined;
  }

  const dataUrlMatch = /^data:([^;]+);base64,/.exec(chartImageBase64);
  if (!dataUrlMatch) {
    return undefined;
  }

  const mimeType = dataUrlMatch[1];
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    return undefined;
  }

  return {
    type: 'input_image',
    image_url: chartImageBase64,
    detail: 'auto',
  };
}

function createPrompt(input: AiAnalysisInput): string {
  const historicalDataLines = formatHistoricalData(input.historicalData);
  const historicalDataHeader = `【過去価格推移（取得件数: ${input.historicalData.length}件）】`;

  return [
    'あなたは株式分析の専門家です。必ずJSONスキーマに従って日本語で解析を返してください。',
    '各フィールドの要件:',
    '- priceMovementAnalysis: 当日の値動きの分析',
    '- patternAnalysis: パターン分析結果の解釈（検出漏れを考慮し、必要に応じて添付画像を参照）',
    '- supportLevels: サポートレベルの価格を3件（数値）',
    '- resistanceLevels: レジスタンスレベルの価格を3件（数値）',
    '- relatedMarketTrend: 関連する市場・セクター動向（必ずWeb検索を利用して最新情報を取得し、可能であれば決算発表・重要経済指標など直近ニュースも根拠に含める）',
    '- investmentJudgment.signal: BULLISH / NEUTRAL / BEARISH のいずれか',
    '- investmentJudgment.reason: 投資判断の理由',
    `ティッカーID: ${input.tickerId}`,
    `銘柄名: ${input.name}`,
    `日付: ${input.date}`,
    `始値: ${input.open}`,
    `高値: ${input.high}`,
    `安値: ${input.low}`,
    `終値: ${input.close}`,
    `出来高: ${input.volume ?? UNSET_VALUE_DISPLAY}`,
    `買いシグナル合致数: ${input.buyPatternCount}`,
    `売りシグナル合致数: ${input.sellPatternCount}`,
    `合致パターン: ${input.patternSummary || 'なし'}`,
    '',
    historicalDataHeader,
    '日付, 始値, 高値, 安値, 終値, 出来高',
    ...historicalDataLines,
  ].join('\n');
}

function formatHistoricalData(historicalData: HistoricalPriceData[]): string[] {
  if (historicalData.length === 0) {
    return ['データなし'];
  }

  return [...historicalData]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map(
      (point) =>
        `${point.date}, ${point.open}, ${point.high}, ${point.low}, ${point.close}, ${point.volume ?? UNSET_VALUE_DISPLAY}`
    );
}

function toLevelTuple(levels: number[]): [number, number, number] {
  if (levels.length !== 3) {
    throw new Error(ERROR_MESSAGES.INVALID_RESPONSE);
  }

  return [levels[0], levels[1], levels[2]];
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error(ERROR_MESSAGES.TIMEOUT));
        }, timeoutMs);
      }),
    ]);
  } finally {
    if (timeoutId) {
      clearTimeout(timeoutId);
    }
  }
}
