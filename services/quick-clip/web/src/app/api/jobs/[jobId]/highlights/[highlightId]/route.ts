import { DynamoDBHighlightRepository } from '@nagiyu/quick-clip-core';
import { reportErrorEvent } from '@nagiyu/aws';
import { toErrorMessage } from '@nagiyu/common';
import { readJsonObjectBody } from '@nagiyu/nextjs';
import { NextResponse } from 'next/server';
import { InvokeCommand } from '@aws-sdk/client-lambda';
import {
  getDynamoDBDocumentClient,
  getClipRegenerateFunctionName,
  getLambdaClient,
  getTableName,
} from '@/lib/server/aws';
import { SERVICE_ID, withApiErrorReporting } from '@/lib/api-error-reporting';
import {
  DOMAIN_ERROR_MESSAGES,
  HighlightDomainService,
  isHighlightStatus,
} from '@/lib/server/domain-services';
import type { Highlight, UpdateHighlightInput } from '@/types/quick-clip';

const ERROR_MESSAGES = {
  INVALID_REQUEST: '更新内容が不正です',
  HIGHLIGHT_NOT_FOUND: '指定された見どころが見つかりません',
  INTERNAL_SERVER_ERROR: '見どころの更新に失敗しました',
  CLIP_REGENERATE_INVOKE_FAILED: 'クリップ再生成の起動に失敗しました',
  CLIP_GENERATING: 'クリップを作り直している最中のため、変更できません',
} as const;

type UpdateHighlightRequest = {
  startSec?: UpdateHighlightInput['startSec'];
  endSec?: UpdateHighlightInput['endSec'];
  status?: UpdateHighlightInput['status'];
};

type RouteParams = {
  params: Promise<{
    jobId: string;
    highlightId: string;
  }>;
};

const VALIDATION_ERROR_MESSAGES: ReadonlySet<string> = new Set([
  DOMAIN_ERROR_MESSAGES.UPDATE_FIELDS_REQUIRED,
  DOMAIN_ERROR_MESSAGES.SECOND_VALUE_INVALID,
  DOMAIN_ERROR_MESSAGES.RANGE_INVALID,
]);

/**
 * リクエストボディから更新内容を取り出す
 *
 * 型が不正な場合は null を返す。更新対象外の項目は後段へ渡さない。
 */
const parseUpdateRequest = (body: Record<string, unknown>): UpdateHighlightRequest | null => {
  const { startSec, endSec, status } = body;
  if (startSec !== undefined && typeof startSec !== 'number') {
    return null;
  }
  if (endSec !== undefined && typeof endSec !== 'number') {
    return null;
  }
  if (status !== undefined && !isHighlightStatus(status)) {
    return null;
  }

  return {
    ...(startSec !== undefined ? { startSec } : {}),
    ...(endSec !== undefined ? { endSec } : {}),
    ...(status !== undefined ? { status } : {}),
  };
};

const invokeClipRegenerate = async (jobId: string, highlight: Highlight): Promise<void> => {
  await getLambdaClient().send(
    new InvokeCommand({
      FunctionName: getClipRegenerateFunctionName(),
      InvocationType: 'Event',
      Payload: Buffer.from(
        JSON.stringify({
          jobId,
          highlightId: highlight.highlightId,
          startSec: highlight.startSec,
          endSec: highlight.endSec,
        })
      ),
    })
  );
};

export const PATCH = withApiErrorReporting(
  'Web API: 見どころ更新エラー',
  ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  async (request: Request, { params }: RouteParams): Promise<NextResponse> => {
    const { jobId, highlightId } = await params;
    const highlightService = new HighlightDomainService(
      new DynamoDBHighlightRepository(getDynamoDBDocumentClient(), getTableName())
    );

    const bodyResult = await readJsonObjectBody(request);
    const body = bodyResult.ok ? parseUpdateRequest(bodyResult.body) : null;
    if (body === null) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    if (
      typeof body.startSec === 'number' &&
      typeof body.endSec === 'number' &&
      body.startSec >= body.endSec
    ) {
      return NextResponse.json(
        {
          error: 'INVALID_REQUEST',
          message: ERROR_MESSAGES.INVALID_REQUEST,
        },
        { status: 400 }
      );
    }

    try {
      const hasTimeUpdateRequest =
        typeof body.startSec === 'number' || typeof body.endSec === 'number';
      if (!hasTimeUpdateRequest) {
        const updated = await highlightService.updateHighlight(jobId, highlightId, body);
        return NextResponse.json(updated);
      }

      const currentHighlight = await highlightService.getHighlight(jobId, highlightId);
      if (!currentHighlight) {
        return NextResponse.json(
          {
            error: 'HIGHLIGHT_NOT_FOUND',
            message: ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND,
          },
          { status: 404 }
        );
      }

      // 作り直しが重なると同じ S3 キーへの書き込みが競合し、古い内容が最後に残りうる
      if (currentHighlight.clipStatus === 'GENERATING') {
        return NextResponse.json(
          {
            error: 'CLIP_GENERATING',
            message: ERROR_MESSAGES.CLIP_GENERATING,
          },
          { status: 409 }
        );
      }

      const statusReset =
        currentHighlight.status === 'accepted' || currentHighlight.status === 'rejected'
          ? { status: 'unconfirmed' as const }
          : {};

      const updates = {
        ...body,
        ...statusReset,
        clipStatus: 'GENERATING' as const,
        clipGeneratingStartedAt: Date.now(),
      };

      let updated = await highlightService.updateHighlight(jobId, highlightId, updates);

      try {
        await invokeClipRegenerate(jobId, updated);
      } catch (invokeError) {
        console.error(
          `[PATCH /api/jobs/[jobId]/highlights/[highlightId]] ${ERROR_MESSAGES.CLIP_REGENERATE_INVOKE_FAILED}`,
          {
            jobId,
            highlightId,
            error: invokeError,
          }
        );
        // 起動に失敗しても更新結果を 200 で返すため、例外が上に届かない。ここで報告する
        await reportErrorEvent({
          serviceId: SERVICE_ID,
          severity: 'error',
          title: 'Web API: クリップ再生成起動エラー',
          message: toErrorMessage(invokeError),
          context: {
            jobId,
            highlightId,
            errorName: invokeError instanceof Error ? invokeError.name : typeof invokeError,
            errorMessage: toErrorMessage(invokeError),
            errorStack: invokeError instanceof Error ? invokeError.stack : undefined,
          },
        });
        // 起動されていない以上、GENERATING のまま残すと誰も完了させず、以降の変更も 409 で受け付けられなくなる
        updated = await highlightService.updateHighlight(jobId, highlightId, {
          clipStatus: 'FAILED',
        });
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

      if (error instanceof Error && VALIDATION_ERROR_MESSAGES.has(error.message)) {
        return NextResponse.json(
          {
            error: 'INVALID_REQUEST',
            message: ERROR_MESSAGES.INVALID_REQUEST,
          },
          { status: 400 }
        );
      }

      throw error;
    }
  }
);
