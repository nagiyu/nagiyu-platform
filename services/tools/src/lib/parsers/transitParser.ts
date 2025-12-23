import { TransitRoute, RouteStep } from '@/types/tools';

export const ERROR_MESSAGES = {
  INVALID_FORMAT: '乗り換え案内のテキストを正しく解析できませんでした。',
  EMPTY_INPUT: '入力が空です。乗り換え案内のテキストを貼り付けてください。',
  URL_NOT_SUPPORTED:
    'URLの直接入力は現在サポートされていません。テキストをコピーして貼り付けてください。',
  UNKNOWN_ERROR: '予期しないエラーが発生しました。',
} as const;

/**
 * 入力バリデーション
 */
export function validateInput(input: string): { valid: boolean; error?: string } {
  // 空チェック
  if (!input || input.trim() === '') {
    return {
      valid: false,
      error: ERROR_MESSAGES.EMPTY_INPUT,
    };
  }

  // 必須フォーマットチェック（⇒が含まれているか）
  if (!input.includes('⇒')) {
    return {
      valid: false,
      error: ERROR_MESSAGES.INVALID_FORMAT,
    };
  }

  return { valid: true };
}

/**
 * 乗り換え案内のテキストをパースする
 * 対応フォーマット: 乗換案内のテキスト共有形式（Yahoo!乗換案内など）
 */
export function parseTransitText(input: string): TransitRoute | null {
  const lines = input.split('\n').map((line) => line.trim());

  // 1. 出発地・到着地の抽出
  const headerMatch = lines[0]?.match(/^(.+?)\s*⇒\s*(.+)$/);
  if (!headerMatch) return null;
  const [, departure, arrival] = headerMatch;

  // 2. 日付の抽出
  const date = lines[1] || '';

  // 3. 出発時刻・到着時刻の抽出
  const timeMatch = lines[2]?.match(/^(\d{1,2}:\d{2})\s*⇒\s*(\d{1,2}:\d{2})$/);
  if (!timeMatch) return null;
  const [, departureTime, arrivalTime] = timeMatch;

  // 4. 所要時間の抽出
  const durationMatch = input.match(/所要時間\s+(.+)/);
  const duration = durationMatch ? durationMatch[1] : '';

  // 5. 運賃の抽出
  const fareMatch = input.match(/運賃\[.*?\]\s+(.+)/);
  const fare = fareMatch ? fareMatch[1] : '';

  // 6. 乗換回数の抽出
  const transferCountMatch = input.match(/乗換\s+(\d+)回/);
  const transferCount = transferCountMatch ? parseInt(transferCountMatch[1], 10) : undefined;

  // 7. 距離の抽出
  const distanceMatch = input.match(/距離\s+([\d.]+)\s*km/);
  const distance = distanceMatch ? `${distanceMatch[1]} km` : undefined;

  // 8. ルート詳細の抽出
  const routeSteps: RouteStep[] = [];
  let currentStation = '';
  let currentTimeRange = '';
  let currentLine = '';
  let currentPlatform = '';

  for (const line of lines) {
    // 駅名（■で始まる行）
    if (line.startsWith('■')) {
      if (currentStation) {
        routeSteps.push({
          station: currentStation,
          timeRange: currentTimeRange || undefined,
          line: currentLine || undefined,
          platform: currentPlatform || undefined,
        });
      }
      currentStation = line.substring(1).trim();
      currentTimeRange = '';
      currentLine = '';
      currentPlatform = '';
      continue;
    }

    // 時刻範囲
    const timeRangeMatch = line.match(/^↓\s+(\d{1,2}:\d{2}〜\d{1,2}:\d{2})$/);
    if (timeRangeMatch) {
      currentTimeRange = timeRangeMatch[1];
      continue;
    }

    // 路線名
    if (line.startsWith('↓') && (line.includes('行') || line.includes('方面'))) {
      currentLine = line.substring(1).trim();
      continue;
    }

    // 番線情報
    const platformMatch = line.match(/^↓\s+(.+番線.+)$/);
    if (platformMatch) {
      currentPlatform = platformMatch[1];
      continue;
    }
  }

  // 最後の駅を追加
  if (currentStation) {
    routeSteps.push({
      station: currentStation,
      timeRange: currentTimeRange || undefined,
      line: currentLine || undefined,
      platform: currentPlatform || undefined,
    });
  }

  return {
    departure,
    arrival,
    date,
    departureTime,
    arrivalTime,
    duration,
    fare,
    transferCount,
    distance,
    routeSteps,
  };
}
