import { runQuickClipBatch, validateEnvironment } from '@nagiyu/quick-clip-core';

export const main = async (): Promise<void> => {
  const env = validateEnvironment();
  await runQuickClipBatch(env);
};

if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
