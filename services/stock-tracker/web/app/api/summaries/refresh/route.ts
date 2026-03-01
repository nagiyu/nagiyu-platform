import { NextResponse } from 'next/server';
import { LambdaClient, InvokeCommand } from '@aws-sdk/client-lambda';
import { withAuth } from '@nagiyu/nextjs';
import { getSession } from '../../../../lib/auth';

const ERROR_MESSAGES = {
  TRIGGER_FAILED: 'サマリーバッチの実行に失敗しました',
} as const;

const getSummaryBatchFunctionName = (): string => {
  if (process.env.STOCK_TRACKER_SUMMARY_BATCH_FUNCTION_NAME) {
    return process.env.STOCK_TRACKER_SUMMARY_BATCH_FUNCTION_NAME;
  }

  return `nagiyu-stock-tracker-batch-summary-${process.env.NODE_ENV ?? 'dev'}`;
};

export const POST = withAuth(getSession, 'stocks:manage-data', async () => {
  try {
    const lambdaClient = new LambdaClient({});
    await lambdaClient.send(
      new InvokeCommand({
        FunctionName: getSummaryBatchFunctionName(),
        InvocationType: 'Event',
        Payload: Buffer.from(JSON.stringify({ source: 'stock-tracker-web' })),
      })
    );

    return NextResponse.json({ message: 'サマリーバッチの実行を開始しました' }, { status: 202 });
  } catch {
    return NextResponse.json(
      {
        error: 'INTERNAL_ERROR',
        message: ERROR_MESSAGES.TRIGGER_FAILED,
      },
      { status: 500 }
    );
  }
});
