import { SubmitJobCommand } from '@aws-sdk/client-batch';
import {
  DEFAULT_EMOTION_FILTER,
  selectJobDefinition,
  toBatchJobEnvironment,
} from '@nagiyu/quick-clip-core';
import type { EmotionFilter } from '@nagiyu/quick-clip-core';
import { getBatchClient, getBatchJobDefinitionPrefix, getBatchJobQueueArn } from '@/lib/server/aws';

export type SubmitExtractJobInput = {
  jobId: string;
  fileSize: number;
  durationSec?: number;
  /** 未指定時は既定の感情フィルターになる。 */
  emotionFilter?: EmotionFilter;
};

/**
 * ハイライト抽出の Batch ジョブを投入する。
 *
 * テーブル名・バケット名・リージョンはジョブ定義側の環境変数に任せ、起動ごとの値だけを渡す。
 *
 * @returns 投入された Batch ジョブの ID
 */
export const submitExtractJob = async (input: SubmitExtractJobInput): Promise<string> => {
  const response = await getBatchClient().send(
    new SubmitJobCommand({
      jobName: `quick-clip-extract-${input.jobId}`.slice(0, 128),
      jobQueue: getBatchJobQueueArn(),
      jobDefinition: `${getBatchJobDefinitionPrefix()}-${selectJobDefinition(input.fileSize, input.durationSec)}`,
      containerOverrides: {
        environment: toBatchJobEnvironment({
          command: 'extract',
          jobId: input.jobId,
          emotionFilter: input.emotionFilter ?? DEFAULT_EMOTION_FILTER,
        }),
      },
    })
  );

  // Batch は投入に成功したとき必ず jobId を返す
  return response.jobId!;
};
