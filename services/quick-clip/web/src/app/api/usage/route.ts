import { NextResponse } from 'next/server';
import { withApiErrorReporting } from '@/lib/api-error-reporting';
import {
  applyPendingCookie,
  createUsageService,
  resolveUsageContext,
  stagePendingCookie,
  type PendingCookie,
} from '@/lib/server/usage-context';

const ERROR_MESSAGES = {
  INTERNAL_SERVER_ERROR: '利用状況の取得に失敗しました',
} as const;

const getUsage = withApiErrorReporting(
  'Web API: 利用状況取得エラー',
  ERROR_MESSAGES.INTERNAL_SERVER_ERROR,
  async (request: Request, pendingCookie: PendingCookie): Promise<NextResponse> => {
    const context = await resolveUsageContext(request);
    stagePendingCookie(context, pendingCookie);
    const usage = await createUsageService().getUsage(context.subject, context.tier);

    return NextResponse.json(usage);
  }
);

/** 残り回数と段を返す。未ログインで Cookie が無ければ、ここで匿名 ID を発行する */
export const GET = async (request: Request): Promise<Response> => {
  const pendingCookie: PendingCookie = {};
  return applyPendingCookie(await getUsage(request, pendingCookie), pendingCookie);
};
