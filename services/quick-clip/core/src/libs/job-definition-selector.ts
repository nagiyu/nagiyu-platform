export type JobDefinitionSize = 'small' | 'large';

const ONE_GIB = 1024 * 1024 * 1024;

export const selectJobDefinition = (fileSize: number): JobDefinitionSize =>
  fileSize >= ONE_GIB ? 'large' : 'small';
