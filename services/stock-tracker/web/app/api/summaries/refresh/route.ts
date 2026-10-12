import { NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';
import { createInternalErrorReporting } from '../../../../lib/api-error-reporting';

const ERROR_MESSAGES = {
  TRIGGER_FAILED: 'サマリーバッチの実行に失敗しました',
} as const;

const withInternalErrorReporting = createInternalErrorReporting(ERROR_MESSAGES.TRIGGER_FAILED);

const getSummaryBatchFunctionName = (): string => {
  if (process.env.STOCK_TRACKER_SUMMARY_BATCH_FUNCTION_NAME) {
    return process.env.STOCK_TRACKER_SUMMARY_BATCH_FUNCTION_NAME;
  }

  const envName = process.env.NODE_ENV === 'production' ? 'prod' : 'dev';
  return `nagiyu-stock-tracker-batch-summary-${envName}`;
};

export const POST = withInternalErrorReporting(
  'Web API: サマリーバッチ実行エラー',
  withAuth(getSession, 'stocks:manage-data', async () => {
    const lambdaClient = new LambdaClient({});
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: getSummaryBatchFunctionName(),
        InvocationType: 'Event',
      })
    );

    return NextResponse.json({ message: 'サマリーバッチの実行を開始しました' }, { status: 202 });
  })
);
