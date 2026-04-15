export type JobDefinitionSize = 'small' | 'large' | 'xlarge';

const ONE_GIB = 1024 * 1024 * 1024;
// FFmpeg が常時 4 プロセス並列実行するため 4 vCPU が必要。large (4 vCPU) のサイズ上限を 4 GiB に設定。
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
