export type JobDefinitionSize = 'small' | 'large' | 'xlarge';

const ONE_GIB = 1024 * 1024 * 1024;
const EIGHT_GIB = 8 * ONE_GIB;

export const selectJobDefinition = (fileSize: number): JobDefinitionSize => {
  if (fileSize < ONE_GIB) {
    return 'small';
  }

  if (fileSize < EIGHT_GIB) {
    return 'large';
  }

  return 'xlarge';
};
