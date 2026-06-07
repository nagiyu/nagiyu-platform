import {
  CWV_THRESHOLDS,
  rateLcp,
  rateCls,
  rateInp,
  rateFcp,
  rateTtfb,
  type CwvRating,
} from '@/lib/coreWebVitals';

describe('coreWebVitals', () => {
  describe('CWV_THRESHOLDS', () => {
    it('LCP の Good 閾値が 2500ms である', () => {
      expect(CWV_THRESHOLDS.LCP_GOOD_MS).toBe(2500);
    });

    it('LCP の Poor 閾値が 4000ms である', () => {
      expect(CWV_THRESHOLDS.LCP_POOR_MS).toBe(4000);
    });

    it('CLS の Good 閾値が 0.1 である', () => {
      expect(CWV_THRESHOLDS.CLS_GOOD).toBe(0.1);
    });

    it('CLS の Poor 閾値が 0.25 である', () => {
      expect(CWV_THRESHOLDS.CLS_POOR).toBe(0.25);
    });

    it('INP の Good 閾値が 200ms である', () => {
      expect(CWV_THRESHOLDS.INP_GOOD_MS).toBe(200);
    });

    it('INP の Poor 閾値が 500ms である', () => {
      expect(CWV_THRESHOLDS.INP_POOR_MS).toBe(500);
    });

    it('FCP の Good 閾値が 1800ms である', () => {
      expect(CWV_THRESHOLDS.FCP_GOOD_MS).toBe(1800);
    });

    it('FCP の Poor 閾値が 3000ms である', () => {
      expect(CWV_THRESHOLDS.FCP_POOR_MS).toBe(3000);
    });

    it('TTFB の Good 閾値が 800ms である', () => {
      expect(CWV_THRESHOLDS.TTFB_GOOD_MS).toBe(800);
    });

    it('TTFB の Poor 閾値が 1800ms である', () => {
      expect(CWV_THRESHOLDS.TTFB_POOR_MS).toBe(1800);
    });
  });

  describe('rateLcp', () => {
    it('Good 閾値以内（2500ms）は good を返す', () => {
      expect(rateLcp(2500)).toBe<CwvRating>('good');
    });

    it('Good 閾値より小さい値は good を返す', () => {
      expect(rateLcp(1000)).toBe<CwvRating>('good');
      expect(rateLcp(0)).toBe<CwvRating>('good');
    });

    it('Good 超 Poor 未満（2501ms〜4000ms）は needs-improvement を返す', () => {
      expect(rateLcp(2501)).toBe<CwvRating>('needs-improvement');
      expect(rateLcp(3000)).toBe<CwvRating>('needs-improvement');
      expect(rateLcp(4000)).toBe<CwvRating>('needs-improvement');
    });

    it('Poor 閾値超（4001ms 以上）は poor を返す', () => {
      expect(rateLcp(4001)).toBe<CwvRating>('poor');
      expect(rateLcp(10000)).toBe<CwvRating>('poor');
    });
  });

  describe('rateCls', () => {
    it('Good 閾値以内（0.1）は good を返す', () => {
      expect(rateCls(0.1)).toBe<CwvRating>('good');
    });

    it('Good 閾値より小さい値は good を返す', () => {
      expect(rateCls(0)).toBe<CwvRating>('good');
      expect(rateCls(0.05)).toBe<CwvRating>('good');
    });

    it('Good 超 Poor 未満（0.1〜0.25）は needs-improvement を返す', () => {
      // rateCls は <= で判定するため 0.1 は good になる
      // Good 超は 0.1 より大きい値
      expect(rateCls(0.11)).toBe<CwvRating>('needs-improvement');
      expect(rateCls(0.2)).toBe<CwvRating>('needs-improvement');
      expect(rateCls(0.25)).toBe<CwvRating>('needs-improvement');
    });

    it('Poor 閾値超（0.25 より大きい値）は poor を返す', () => {
      expect(rateCls(0.26)).toBe<CwvRating>('poor');
      expect(rateCls(1.0)).toBe<CwvRating>('poor');
    });
  });

  describe('rateInp', () => {
    it('Good 閾値以内（200ms）は good を返す', () => {
      expect(rateInp(200)).toBe<CwvRating>('good');
    });

    it('Good 閾値より小さい値は good を返す', () => {
      expect(rateInp(0)).toBe<CwvRating>('good');
      expect(rateInp(100)).toBe<CwvRating>('good');
    });

    it('Good 超 Poor 未満（201ms〜500ms）は needs-improvement を返す', () => {
      expect(rateInp(201)).toBe<CwvRating>('needs-improvement');
      expect(rateInp(350)).toBe<CwvRating>('needs-improvement');
      expect(rateInp(500)).toBe<CwvRating>('needs-improvement');
    });

    it('Poor 閾値超（501ms 以上）は poor を返す', () => {
      expect(rateInp(501)).toBe<CwvRating>('poor');
      expect(rateInp(2000)).toBe<CwvRating>('poor');
    });
  });

  describe('rateFcp', () => {
    it('Good 閾値以内（1800ms）は good を返す', () => {
      expect(rateFcp(1800)).toBe<CwvRating>('good');
    });

    it('Good 閾値より小さい値は good を返す', () => {
      expect(rateFcp(0)).toBe<CwvRating>('good');
      expect(rateFcp(900)).toBe<CwvRating>('good');
    });

    it('Good 超 Poor 未満（1801ms〜3000ms）は needs-improvement を返す', () => {
      expect(rateFcp(1801)).toBe<CwvRating>('needs-improvement');
      expect(rateFcp(2500)).toBe<CwvRating>('needs-improvement');
      expect(rateFcp(3000)).toBe<CwvRating>('needs-improvement');
    });

    it('Poor 閾値超（3001ms 以上）は poor を返す', () => {
      expect(rateFcp(3001)).toBe<CwvRating>('poor');
      expect(rateFcp(5000)).toBe<CwvRating>('poor');
    });
  });

  describe('rateTtfb', () => {
    it('Good 閾値以内（800ms）は good を返す', () => {
      expect(rateTtfb(800)).toBe<CwvRating>('good');
    });

    it('Good 閾値より小さい値は good を返す', () => {
      expect(rateTtfb(0)).toBe<CwvRating>('good');
      expect(rateTtfb(400)).toBe<CwvRating>('good');
    });

    it('Good 超 Poor 未満（801ms〜1800ms）は needs-improvement を返す', () => {
      expect(rateTtfb(801)).toBe<CwvRating>('needs-improvement');
      expect(rateTtfb(1200)).toBe<CwvRating>('needs-improvement');
      expect(rateTtfb(1800)).toBe<CwvRating>('needs-improvement');
    });

    it('Poor 閾値超（1801ms 以上）は poor を返す', () => {
      expect(rateTtfb(1801)).toBe<CwvRating>('poor');
      expect(rateTtfb(5000)).toBe<CwvRating>('poor');
    });
  });
});
