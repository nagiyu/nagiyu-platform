export type JobDefinitionSize = 'small' | 'large' | 'xlarge';

const ONE_GIB = 1024 * 1024 * 1024;
// Phase 6 後の並列 FFmpeg プロセス数（最大）:
// motion chunks(4) + detectUniformIntervals(2) + volume chunks(4) = 10 プロセス
// large/xlarge は 8 vCPU を使用
const FOUR_GIB = 4 * ONE_GIB;

export const selectJobDefinition = (fileSize: number): JobDefinitionSize => {
  if (fileSize < ONE_GIB) {
    return 'small';
  }

  if (fileSize < FOUR_GIB) {
    return 'large';
  }

  return 'xlarge';
};
