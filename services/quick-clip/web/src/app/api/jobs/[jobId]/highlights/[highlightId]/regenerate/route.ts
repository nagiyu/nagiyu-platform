import { createHighlightRepository } from '@nagiyu/quick-clip-core';
import { NextResponse } from 'next/server';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import { getClipRegenerateFunctionName, getLambdaClient } from '@/lib/server/aws';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import { DOMAIN_ERROR_MESSAGES, HighlightDomainService } from '@/lib/server/domain-services';

const ERROR_MESSAGES = {
  HIGHLIGHT_NOT_FOUND: '指定された見どころが見つかりません',
  CLIP_GENERATING: 'クリップを作り直している最中のため、変更できません',
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
    const repository = createHighlightRepository();
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

      // 作り直しが重なると同じ S3 キーへの書き込みが競合し、古い内容が最後に残りうる
      if (current.clipStatus === 'GENERATING') {
        return NextResponse.json(
          {
            error: 'CLIP_GENERATING',
            message: ERROR_MESSAGES.CLIP_GENERATING,
          },
          { status: 409 }
        );
      }

      // Lambda は完了時に GENERATED へ更新するため、起動より先に GENERATING にしておく。
      // 起動後に更新すると、短い作り直しでは Lambda の完了を GENERATING で上書きしかねない
      const updated = await highlightService.updateHighlight(jobId, highlightId, {
        clipStatus: 'GENERATING',
        clipGeneratingStartedAt: Date.now(),
      });

      try {
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
      } catch (invokeError) {
        // 起動されていない以上、GENERATING のまま残すと誰も完了させない
        await highlightService.updateHighlight(jobId, highlightId, { clipStatus: 'FAILED' });
        throw invokeError;
      }

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
