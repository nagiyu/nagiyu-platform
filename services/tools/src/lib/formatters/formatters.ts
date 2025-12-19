import { TransitRoute, DisplaySettings, DEFAULT_DISPLAY_SETTINGS } from '@/types/tools';

/**
 * TransitRoute を Plain Text 形式にフォーマット
 */
export function formatTransitRoute(
  route: TransitRoute,
  settings: DisplaySettings = DEFAULT_DISPLAY_SETTINGS,
): string {
  const lines: string[] = [];

  // ヘッダー
  if (settings.showDate) {
    lines.push(`【乗り換え案内】${route.date}`);
  } else {
    lines.push('【乗り換え案内】');
  }

  // 出発地・到着地、時刻
  const departureArrivalParts: string[] = [];
  if (settings.showDepartureArrival) {
    departureArrivalParts.push(route.departure);
  }
  if (settings.showTime && settings.showDepartureArrival) {
    departureArrivalParts.push(route.departureTime);
  }
  departureArrivalParts.push('→');
  if (settings.showDepartureArrival) {
    departureArrivalParts.push(route.arrival);
  }
  if (settings.showTime && settings.showDepartureArrival) {
    departureArrivalParts.push(route.arrivalTime);
  }
  
  // 少なくとも出発地・到着地または時刻のどちらかが表示される場合のみ行を追加
  if (settings.showDepartureArrival || settings.showTime) {
    lines.push(departureArrivalParts.join(' '));
  }

  // 所要時間、運賃、乗換回数、距離
  const detailParts: string[] = [];
  if (settings.showDuration && route.duration) {
    detailParts.push(`所要時間: ${route.duration}`);
  }
  if (settings.showFare && route.fare) {
    detailParts.push(`運賃: ${route.fare}`);
  }
  if (settings.showTransferCount && route.transferCount !== undefined) {
    detailParts.push(`乗換: ${route.transferCount}回`);
  }
  if (settings.showDistance && route.distance) {
    detailParts.push(`距離: ${route.distance}`);
  }

  if (detailParts.length > 0) {
    lines.push(detailParts.join(' / '));
  }

  // ルート詳細
  if (settings.showRouteDetails && route.routeSteps.length > 0) {
    lines.push('');
    lines.push('[ルート]');
    route.routeSteps.forEach((step, index) => {
      // 駅名は常に表示（ルート詳細が有効な場合）
      const timeInfo =
        settings.showTimeRange && step.timeRange ? ` (${step.timeRange})` : '';
      lines.push(`${step.station}${timeInfo}`);

      // 最後の駅以外は路線情報を表示
      if (index < route.routeSteps.length - 1) {
        if (settings.showLineName && step.line) {
          const platform =
            settings.showPlatform && step.platform ? ` [${step.platform}]` : '';
          lines.push(`→ ${step.line}${platform}`);
        }
      }
    });
  }

  return lines.join('\n');
}
