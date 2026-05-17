import { reportErrorEvent } from '@nagiyu/aws';
import { runQuickClipBatch } from '@nagiyu/quick-clip-core';
import { validateEnvironment } from './lib/environment.js';

const SERVICE_ID = 'quick-clip';

export const main = async (): Promise<void> => {
  let jobId: string | undefined;
  try {
    const env = validateEnvironment();
    jobId = env.jobId;
    console.info(
      `[QuickClipBatch] ジョブ開始: jobId=${env.jobId} command=${env.command} region=${env.awsRegion}`
    );
    await runQuickClipBatch(env);
  } catch (error) {
    // catch を経由しない process.exit(1) 分岐でも必ずイベントを記録するため、
    // main() 内で報告してから再スローする（fire-and-forget 禁止）。
    await reportErrorEvent({
      serviceId: SERVICE_ID,
      severity: 'critical',
      title: 'QuickClip バッチ処理が失敗しました',
      message: error instanceof Error ? error.message : String(error),
      context: {
        jobId,
        errorStack: error instanceof Error ? error.stack : undefined,
      },
    });
    throw error;
  }
};

if (process.env.NODE_ENV !== 'test') {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
