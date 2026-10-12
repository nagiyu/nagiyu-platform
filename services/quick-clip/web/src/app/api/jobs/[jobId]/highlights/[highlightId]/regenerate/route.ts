import { DynamoDBHighlightRepository } from '@nagiyu/quick-clip-core';
import { NextResponse } from 'next/server';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import {
  getClipRegenerateFunctionName,
  getDynamoDBDocumentClient,
  getLambdaClient,
  getTableName,
} from '@/lib/server/aws';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { DOMAIN_ERROR_MESSAGES, HighlightDomainService } from '@/lib/server/domain-services';

const ERROR_MESSAGES = {
  HIGHLIGHT_NOT_FOUND: '指定された見どころが見つかりません',
  INTERNAL_SERVER_ERROR: 'クリップ再生成の開始に失敗しました',
} as const;

type RouteParams = {
  params: Promise<{
    jobId: string;
    highlightId: string;
  }>;
};

export const POST = withApiErrorReporting(
  'Web API: クリップ再生成開始エラー',
  ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  async (_request: Request, { params }: RouteParams): Promise<NextResponse> => {
    const { jobId, highlightId } = await params;
    const repository = new DynamoDBHighlightRepository(getDynamoDBDocumentClient(), getTableName());
    const highlightService = new HighlightDomainService(repository);

    try {
      const current = await repository.getById(jobId, highlightId);
      if (!current) {
        return NextResponse.json(
          {
            error: 'HIGHLIGHT_NOT_FOUND',
            message: ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND,
          },
          { status: 404 }
        );
      }

      await getLambdaClient().send(
        new InvokeCommand({
          FunctionName: getClipRegenerateFunctionName(),
          InvocationType: 'Event',
          Payload: Buffer.from(
            JSON.stringify({
              jobId,
              highlightId,
              startSec: current.startSec,
              endSec: current.endSec,
            })
          ),
        })
      );

      const updated = await highlightService.updateHighlight(jobId, highlightId, {
        clipStatus: 'GENERATING',
      });
      return NextResponse.json(updated);
    } catch (error) {
      if (error instanceof Error && error.message === DOMAIN_ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND) {
        return NextResponse.json(
          {
            error: 'HIGHLIGHT_NOT_FOUND',
            message: ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND,
          },
          { status: 404 }
        );
      }

      throw error;
    }
  }
);
