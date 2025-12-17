import {
  parseTransitText,
  validateInput,
  ERROR_MESSAGES,
} from '../transitParser';

describe('transitParser', () => {
  describe('validateInput', () => {
    it('正常系: 正しいフォーマットのテキストは検証を通過する', () => {
      const input = 'A駅 ⇒ B駅\n2025年1月15日(月)\n09:00 ⇒ 09:45';
      const result = validateInput(input);
      expect(result.valid).toBe(true);
      expect(result.error).toBeUndefined();
    });

    it('異常系: 空文字列でエラーになる', () => {
      const result = validateInput('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
    });

    it('異常系: スペースのみの文字列でエラーになる', () => {
      const result = validateInput('   ');
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.EMPTY_INPUT);
    });

    it('異常系: ⇒が含まれない場合エラーになる', () => {
      const input = 'A駅からB駅へ\n2025年1月15日(月)\n09:00 - 09:45';
      const result = validateInput(input);
      expect(result.valid).toBe(false);
      expect(result.error).toBe(ERROR_MESSAGES.INVALID_FORMAT);
    });
  });

  describe('parseTransitText', () => {
    it('正常系: 正しいフォーマットのテキストをパースできる', () => {
      const input = `A駅 ⇒ B駅
2025年1月15日(月)
09:00 ⇒ 09:45
------------------------------
所要時間 45分
運賃[IC優先] 500円
乗換 1回
距離 30.5 km
------------------------------

■A駅
↓ 09:00〜09:20
↓ XX線快速 C駅行
↓ 1番線発 → 2番線着
■C駅
↓ 09:25〜09:45
↓ YY線 B駅方面
↓ 3番線発 → 4番線着
■B駅`;

      const result = parseTransitText(input);

      expect(result).not.toBeNull();
      expect(result?.departure).toBe('A駅');
      expect(result?.arrival).toBe('B駅');
      expect(result?.date).toBe('2025年1月15日(月)');
      expect(result?.departureTime).toBe('09:00');
      expect(result?.arrivalTime).toBe('09:45');
      expect(result?.duration).toBe('45分');
      expect(result?.fare).toBe('500円');
      expect(result?.routeSteps).toHaveLength(3);

      // 最初の駅
      expect(result?.routeSteps[0]).toEqual({
        station: 'A駅',
        timeRange: '09:00〜09:20',
        line: 'XX線快速 C駅行',
        platform: '1番線発 → 2番線着',
      });

      // 乗り換え駅
      expect(result?.routeSteps[1]).toEqual({
        station: 'C駅',
        timeRange: '09:25〜09:45',
        line: 'YY線 B駅方面',
        platform: '3番線発 → 4番線着',
      });

      // 最終駅
      expect(result?.routeSteps[2]).toEqual({
        station: 'B駅',
      });
    });

    it('異常系: ヘッダー行が不正な場合nullを返す', () => {
      const input = `A駅からB駅へ
2025年1月15日(月)
09:00 ⇒ 09:45`;

      const result = parseTransitText(input);
      expect(result).toBeNull();
    });

    it('異常系: 時刻行が不正な場合nullを返す', () => {
      const input = `A駅 ⇒ B駅
2025年1月15日(月)
09:00 - 09:45`;

      const result = parseTransitText(input);
      expect(result).toBeNull();
    });

    it('正常系: 最小限のデータでもパースできる', () => {
      const input = `A駅 ⇒ B駅
2025年1月15日(月)
09:00 ⇒ 09:45`;

      const result = parseTransitText(input);
      expect(result).not.toBeNull();
      expect(result?.departure).toBe('A駅');
      expect(result?.arrival).toBe('B駅');
      expect(result?.date).toBe('2025年1月15日(月)');
      expect(result?.departureTime).toBe('09:00');
      expect(result?.arrivalTime).toBe('09:45');
      expect(result?.duration).toBe('');
      expect(result?.fare).toBe('');
      expect(result?.routeSteps).toHaveLength(0);
    });
  });
});
