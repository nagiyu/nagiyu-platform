import { formatTransitRoute } from '../formatters';
import { TransitRoute, DisplaySettings, DEFAULT_DISPLAY_SETTINGS } from '@/types/tools';

describe('formatters', () => {
  describe('formatTransitRoute', () => {
    const fullRoute: TransitRoute = {
      departure: 'A駅',
      arrival: 'B駅',
      date: '2025年1月15日(月)',
      departureTime: '09:00',
      arrivalTime: '09:45',
      duration: '45分',
      fare: '500円',
      transferCount: 1,
      distance: '30.5 km',
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

    it('正常系: デフォルト設定で正しくフォーマットできる', () => {
      const result = formatTransitRoute(fullRoute);

      const expected = `【乗り換え案内】2025年1月15日(月)
A駅 09:00 → B駅 09:45
所要時間: 45分 / 運賃: 500円 / 乗換: 1回

[ルート]
■ A駅 (09:00〜09:20)
→ XX線快速 C駅行
■ C駅 (09:25〜09:45)
→ YY線 B駅方面
■ B駅`;

      expect(result).toBe(expected);
    });

    it('正常系: すべての項目を表示する設定で正しくフォーマットできる', () => {
      const settings: DisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        showDistance: true,
        showPlatform: true,
      };

      const result = formatTransitRoute(fullRoute, settings);

      const expected = `【乗り換え案内】2025年1月15日(月)
A駅 09:00 → B駅 09:45
所要時間: 45分 / 運賃: 500円 / 乗換: 1回 / 距離: 30.5 km

[ルート]
■ A駅 (09:00〜09:20)
→ XX線快速 C駅行 [1番線発 → 2番線着]
■ C駅 (09:25〜09:45)
→ YY線 B駅方面 [3番線発 → 4番線着]
■ B駅`;

      expect(result).toBe(expected);
    });

    it('正常系: 日付を非表示にできる', () => {
      const settings: DisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        showDate: false,
      };

      const result = formatTransitRoute(fullRoute, settings);

      expect(result).toContain('【乗り換え案内】');
      expect(result).not.toContain('2025年1月15日(月)');
    });

    it('正常系: 出発地・到着地の行を非表示にできる', () => {
      const settings: DisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        showDepartureArrival: false,
        showTime: false,
      };

      const result = formatTransitRoute(fullRoute, settings);

      const lines = result.split('\n');
      // ヘッダーの後に出発地・到着地の行がないことを確認
      expect(lines[0]).toContain('【乗り換え案内】');
      expect(lines[1]).toContain('所要時間');
      // ルート詳細には駅名が表示される
      expect(result).toContain('[ルート]');
    });

    it('正常系: 所要時間を非表示にできる', () => {
      const settings: DisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        showDuration: false,
      };

      const result = formatTransitRoute(fullRoute, settings);

      expect(result).not.toContain('所要時間');
    });

    it('正常系: 運賃を非表示にできる', () => {
      const settings: DisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        showFare: false,
      };

      const result = formatTransitRoute(fullRoute, settings);

      expect(result).not.toContain('運賃');
    });

    it('正常系: 乗換回数を非表示にできる', () => {
      const settings: DisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        showTransferCount: false,
      };

      const result = formatTransitRoute(fullRoute, settings);

      expect(result).not.toContain('乗換');
    });

    it('正常系: ルート詳細を非表示にできる', () => {
      const settings: DisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        showRouteDetails: false,
      };

      const result = formatTransitRoute(fullRoute, settings);

      expect(result).not.toContain('[ルート]');
      expect(result).not.toContain('C駅');
    });

    it('正常系: 時刻範囲を非表示にできる', () => {
      const settings: DisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        showTimeRange: false,
      };

      const result = formatTransitRoute(fullRoute, settings);

      expect(result).not.toContain('09:00〜09:20');
      expect(result).toContain('A駅');
    });

    it('正常系: 路線名を非表示にできる', () => {
      const settings: DisplaySettings = {
        ...DEFAULT_DISPLAY_SETTINGS,
        showLineName: false,
      };

      const result = formatTransitRoute(fullRoute, settings);

      expect(result).not.toContain('XX線快速 C駅行');
      expect(result).not.toContain('YY線 B駅方面');
    });

    it('エッジケース: すべての項目を非表示にできる', () => {
      const settings: DisplaySettings = {
        showDate: false,
        showDepartureArrival: false,
        showTime: false,
        showDuration: false,
        showFare: false,
        showTransferCount: false,
        showDistance: false,
        showRouteDetails: false,
        showTimeRange: false,
        showLineName: false,
        showPlatform: false,
      };

      const result = formatTransitRoute(fullRoute, settings);

      expect(result).toBe('【乗り換え案内】');
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
A駅 09:00 → B駅 09:45`;

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
■ A駅 (09:00〜09:45)
→ XX線 B駅行
■ B駅`;

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
■ A駅
→ XX線 B駅行
■ B駅`;

      expect(result).toBe(expected);
    });
  });
});
