import { runQuickClipBatch } from '@nagiyu/quick-clip-core';
import { validateEnvironment } from './lib/environment.js';

export const main = async (): Promise<void> => {
  const env = validateEnvironment();
  console.info(
    `[QuickClipBatch] ジョブ開始: jobId=${env.jobId} command=${env.command} region=${env.awsRegion}`
  );
  await runQuickClipBatch(env);
};

if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
