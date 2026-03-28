import { FfmpegVideoAnalyzer } from '../../../src/libs/ffmpeg-video-analyzer.js';

describe('FfmpegVideoAnalyzer', () => {
  it('ensureMinimumDuration: 3秒未満の区間を3秒に補正する', () => {
    const analyzer = new FfmpegVideoAnalyzer();
    expect(analyzer.ensureMinimumDuration(10, 11)).toEqual({ startSec: 10, endSec: 13 });
  });

  it('ensureMinimumDuration: 3秒以上の区間はそのまま返す', () => {
    const analyzer = new FfmpegVideoAnalyzer();
    expect(analyzer.ensureMinimumDuration(10, 15)).toEqual({ startSec: 10, endSec: 15 });
  });
});
