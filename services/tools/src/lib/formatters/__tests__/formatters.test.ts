import { formatTransitRoute } from '../formatters';
import { TransitRoute } from '@/types/tools';

describe('formatters', () => {
  describe('formatTransitRoute', () => {
    it('正常系: TransitRoute を正しくフォーマットできる', () => {
      const route: TransitRoute = {
        departure: 'A駅',
        arrival: 'B駅',
        date: '2025年1月15日(月)',
        departureTime: '09:00',
        arrivalTime: '09:45',
        duration: '45分',
        fare: '500円',
        routeSteps: [
          {
            station: 'A駅',
            timeRange: '09:00〜09:20',
            line: 'XX線快速 C駅行',
            platform: '1番線発 → 2番線着',
          },
          {
            station: 'C駅',
            timeRange: '09:25〜09:45',
            line: 'YY線 B駅方面',
            platform: '3番線発 → 4番線着',
          },
          {
            station: 'B駅',
          },
        ],
      };

      const result = formatTransitRoute(route);

      const expected = `【乗り換え案内】2025年1月15日(月)
A駅 09:00 → B駅 09:45
所要時間: 45分 / 運賃: 500円

[ルート]
A駅 (09:00〜09:20)
→ XX線快速 C駅行 [1番線発 → 2番線着]
C駅 (09:25〜09:45)
→ YY線 B駅方面 [3番線発 → 4番線着]
B駅`;

      expect(result).toBe(expected);
    });

    it('エッジケース: 最小限のデータでもフォーマットできる', () => {
      const route: TransitRoute = {
        departure: 'A駅',
        arrival: 'B駅',
        date: '2025年1月15日(月)',
        departureTime: '09:00',
        arrivalTime: '09:45',
        duration: '',
        fare: '',
        routeSteps: [],
      };

      const result = formatTransitRoute(route);

      const expected = `【乗り換え案内】2025年1月15日(月)
A駅 09:00 → B駅 09:45
所要時間:  / 運賃: 

[ルート]`;

      expect(result).toBe(expected);
    });

    it('エッジケース: 番線情報がない場合も正しくフォーマットできる', () => {
      const route: TransitRoute = {
        departure: 'A駅',
        arrival: 'B駅',
        date: '2025年1月15日(月)',
        departureTime: '09:00',
        arrivalTime: '09:45',
        duration: '45分',
        fare: '500円',
        routeSteps: [
          {
            station: 'A駅',
            timeRange: '09:00〜09:45',
            line: 'XX線 B駅行',
          },
          {
            station: 'B駅',
          },
        ],
      };

      const result = formatTransitRoute(route);

      const expected = `【乗り換え案内】2025年1月15日(月)
A駅 09:00 → B駅 09:45
所要時間: 45分 / 運賃: 500円

[ルート]
A駅 (09:00〜09:45)
→ XX線 B駅行
B駅`;

      expect(result).toBe(expected);
    });

    it('エッジケース: 時刻範囲がない場合も正しくフォーマットできる', () => {
      const route: TransitRoute = {
        departure: 'A駅',
        arrival: 'B駅',
        date: '2025年1月15日(月)',
        departureTime: '09:00',
        arrivalTime: '09:45',
        duration: '45分',
        fare: '500円',
        routeSteps: [
          {
            station: 'A駅',
            line: 'XX線 B駅行',
          },
          {
            station: 'B駅',
          },
        ],
      };

      const result = formatTransitRoute(route);

      const expected = `【乗り換え案内】2025年1月15日(月)
A駅 09:00 → B駅 09:45
所要時間: 45分 / 運賃: 500円

[ルート]
A駅
→ XX線 B駅行
B駅`;

      expect(result).toBe(expected);
    });
  });
});
