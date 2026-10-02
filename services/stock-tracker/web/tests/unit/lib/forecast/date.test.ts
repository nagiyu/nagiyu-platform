import { isValidDateFormat, shiftDate } from '../../../../lib/forecast/date';

describe('isValidDateFormat', () => {
  it.each(['2026-05-01', '2024-02-29'])('実在する日付 %s は true', (date) => {
    expect(isValidDateFormat(date)).toBe(true);
  });

  it.each(['2026-5-1', '20260501', 'abc', '2026-02-30', '2026-13-01'])(
    '不正な日付 %s は false',
    (date) => {
      expect(isValidDateFormat(date)).toBe(false);
    }
  );
});

describe('shiftDate', () => {
  it('月をまたいで前日を返す', () => {
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('暦日で 29 日前を返す', () => {
    expect(shiftDate('2026-05-30', -29)).toBe('2026-05-01');
  });
});
