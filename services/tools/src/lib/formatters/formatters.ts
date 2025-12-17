import { TransitRoute } from '@/types/tools';

/**
 * TransitRoute を Plain Text 形式にフォーマット
 */
export function formatTransitRoute(route: TransitRoute): string {
  const lines: string[] = [];

  // ヘッダー
  lines.push(`【乗り換え案内】${route.date}`);
  lines.push(
    `${route.departure} ${route.departureTime} → ${route.arrival} ${route.arrivalTime}`,
  );
  lines.push(`所要時間: ${route.duration} / 運賃: ${route.fare}`);
  lines.push('');

  // ルート
  lines.push('[ルート]');
  route.routeSteps.forEach((step, index) => {
    const timeInfo = step.timeRange ? ` (${step.timeRange})` : '';
    lines.push(`${step.station}${timeInfo}`);

    // 最後の駅以外は路線情報を表示
    if (index < route.routeSteps.length - 1 && step.line) {
      const platform = step.platform ? ` [${step.platform}]` : '';
      lines.push(`→ ${step.line}${platform}`);
    }
  });

  return lines.join('\n');
}
