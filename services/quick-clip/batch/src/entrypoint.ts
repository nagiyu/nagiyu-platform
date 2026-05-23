import { withErrorReporting } from '@nagiyu/aws';
import { runQuickClipBatch } from '@nagiyu/quick-clip-core';
import { validateEnvironment } from './lib/environment.js';

export const main = async (): Promise<void> => {
  const env = validateEnvironment();
  console.info(
    `[QuickClipBatch] ジョブ開始: jobId=${env.jobId} command=${env.command} region=${env.awsRegion}`
  );
  await runQuickClipBatch(env);
};

withErrorReporting(
  {
    serviceId: 'quick-clip',
    severity: 'critical',
    title: 'QuickClip バッチ処理が失敗しました',
    exitOnError: true,
    runIfNotTest: true,
  },
  main
);
