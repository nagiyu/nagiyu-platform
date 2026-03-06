import * as echarts from 'echarts';
import { createChartImageBase64 } from '../../../src/lib/chart-renderer.js';

describe('createChartImageBase64', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('履歴データが空の場合は undefined を返す', () => {
    const result = createChartImageBase64([]);

    expect(result).toBeUndefined();
  });

  it('チャート画像を PNG の base64 data URL で返す', () => {
    const result = createChartImageBase64([
      {
        date: '2026-03-05',
        open: 110,
        high: 120,
        low: 105,
        close: 118,
      },
      {
        date: '2026-03-04',
        open: 100,
        high: 112,
        low: 95,
        close: 108,
      },
    ]);

    expect(result).toMatch(/^data:image\/png;base64,/);
    const encoded = result?.replace(/^data:image\/png;base64,/, '') ?? '';
    const pngBuffer = Buffer.from(encoded, 'base64');
    expect(pngBuffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  });

  it('ECharts の例外時は undefined を返す', () => {
    jest.spyOn(echarts, 'init').mockImplementation(() => {
      throw new Error('render error');
    });

    const result = createChartImageBase64([
      {
        date: '2026-03-04',
        open: 100,
        high: 112,
        low: 95,
        close: 108,
      },
    ]);

    expect(result).toBeUndefined();
  });
});
