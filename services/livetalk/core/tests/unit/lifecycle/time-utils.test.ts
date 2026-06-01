import {
  parseTimeToMinutes,
  formatMinutesToTime,
  smoothTime,
  clampTime,
} from '../../../src/lifecycle/time-utils.js';

describe('parseTimeToMinutes', () => {
  it.each([
    ['00:00', 0],
    ['01:30', 90],
    ['09:30', 570],
    ['23:59', 1439],
    ['12:00', 720],
    ['21:00', 1260],
  ])('%s → %i 分', (input, expected) => {
    expect(parseTimeToMinutes(input)).toBe(expected);
  });
});

describe('formatMinutesToTime', () => {
  it.each([
    [0, '00:00'],
    [90, '01:30'],
    [570, '09:30'],
    [1439, '23:59'],
    [720, '12:00'],
    [1260, '21:00'],
  ])('%i 分 → %s', (input, expected) => {
    expect(formatMinutesToTime(input)).toBe(expected);
  });

  it('1440 は 00:00 に折り返す', () => {
    expect(formatMinutesToTime(1440)).toBe('00:00');
  });

  it('負の値は後方からラップする', () => {
    expect(formatMinutesToTime(-30)).toBe('23:30');
  });
});

describe('smoothTime', () => {
  it('alpha=0 のとき current のまま変化しない', () => {
    expect(smoothTime(570, 480, 0)).toBe(570);
  });

  it('alpha=1 のとき target に完全一致する', () => {
    expect(smoothTime(570, 480, 1)).toBe(480);
  });

  it('通常補間: 600 から 660 へ alpha=0.3', () => {
    // diff = 60, 0.3*60=18
    expect(smoothTime(600, 660, 0.3)).toBe(618);
  });

  it('0時跨ぎ補間: 23:30(1410) → 01:00(60) alpha=0.3 は前方向に進む', () => {
    // diff = 60 - 1410 = -1350 < -720 → diff += 1440 = 90
    // 1410 + 0.3*90 = 1410 + 27 = 1437
    expect(smoothTime(1410, 60, 0.3)).toBe(1437);
  });

  it('0時跨ぎ補間: 01:00(60) → 23:00(1380) alpha=0.3 は後方向に進む', () => {
    // diff = 1380 - 60 = 1320 > 720 → diff -= 1440 = -120
    // 60 + 0.3*(-120) = 60 - 36 = 24
    expect(smoothTime(60, 1380, 0.3)).toBe(24);
  });
});

describe('clampTime', () => {
  describe('通常範囲 [300, 720]（05:00〜12:00）', () => {
    it('範囲内の値はそのまま返す', () => {
      expect(clampTime(500, 300, 720)).toBe(500);
    });

    it('下限未満は下限にクランプ', () => {
      expect(clampTime(200, 300, 720)).toBe(300);
    });

    it('上限超過は上限にクランプ', () => {
      expect(clampTime(800, 300, 720)).toBe(720);
    });
  });

  describe('0時跨ぎ範囲 [1260, 240]（21:00〜翌04:00）', () => {
    it('21:00（1260）は範囲内', () => {
      expect(clampTime(1260, 1260, 240)).toBe(1260);
    });

    it('23:30（1410）は範囲内', () => {
      expect(clampTime(1410, 1260, 240)).toBe(1410);
    });

    it('01:30（90）は範囲内', () => {
      expect(clampTime(90, 1260, 240)).toBe(90);
    });

    it('04:00（240）は範囲内', () => {
      expect(clampTime(240, 1260, 240)).toBe(240);
    });

    it('08:20（500）は下限 21:00 と上限 04:00 のうち近い 04:00 にクランプ', () => {
      // distToMin(1260-500=760) > distToMax(500-240=260) → clamp to 240
      expect(clampTime(500, 1260, 240)).toBe(240);
    });

    it('15:00（900）は 21:00 に近いのでクランプ', () => {
      // distToMin(1260-900=360) < distToMax(900-240=660) → clamp to 1260
      expect(clampTime(900, 1260, 240)).toBe(1260);
    });
  });
});
