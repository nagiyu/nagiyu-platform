import { randomUUID } from 'node:crypto';
import {
  buildAnonymousSubject,
  buildUserSubject,
  createUsageRepository,
  resolveUsageTier,
  UsageService,
} from '@nagiyu/quick-clip-core';
import type { UsageTier } from '@nagiyu/quick-clip-core';
import { getSession } from '@/lib/auth';
import { errorReporter } from '@/lib/api-error-reporting';

/** 未ログインの利用回数を数えるための識別子を入れる Cookie の名前 */
export const ANONYMOUS_ID_COOKIE_NAME = 'qc_anon_id';

const ANONYMOUS_ID_COOKIE_MAX_AGE_SEC = 365 * 24 * 60 * 60;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type UsageContext = {
  /** 回数を数える主体 */
  subject: string;
  tier: UsageTier;
  /** この要求で新しく発行した匿名 ID。レスポンスで Cookie として渡す */
  issuedAnonymousId?: string;
};

const readCookie = (cookieHeader: string | null, name: string): string | undefined => {
  if (!cookieHeader) {
    return undefined;
  }
  for (const part of cookieHeader.split(';')) {
    const separator = part.indexOf('=');
    if (separator > 0 && part.slice(0, separator).trim() === name) {
      return part.slice(separator + 1).trim();
    }
  }
  return undefined;
};

/**
 * 要求から、回数を数える主体と段を決める。
 *
 * ログイン中はユーザー ID。未ログインは Cookie の匿名 ID で、無い (または形式が違う) ときは新しく発行する。
 * 端末情報からの推定は使わない。
 */
export const resolveUsageContext = async (request: Request): Promise<UsageContext> => {
  const session = await getSession();
  if (session) {
    return {
      subject: buildUserSubject(session.user.id),
      tier: resolveUsageTier(session.user.roles),
    };
  }

  const existing = readCookie(request.headers.get('cookie'), ANONYMOUS_ID_COOKIE_NAME);
  if (existing && UUID_PATTERN.test(existing)) {
    return { subject: buildAnonymousSubject(existing), tier: 'anonymous' };
  }
  const issued = randomUUID();
  return { subject: buildAnonymousSubject(issued), tier: 'anonymous', issuedAnonymousId: issued };
};

/**
 * 匿名 ID の Set-Cookie ヘッダーを返す。
 *
 * Domain を付けず、Quick Clip のホストだけに置く。http のローカル開発では Secure を付けない。
 */
export const buildAnonymousIdSetCookie = (anonymousId: string): string => {
  const attributes = [
    `${ANONYMOUS_ID_COOKIE_NAME}=${anonymousId}`,
    'Path=/',
    `Max-Age=${ANONYMOUS_ID_COOKIE_MAX_AGE_SEC}`,
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (process.env.NODE_ENV === 'production') {
    attributes.push('Secure');
  }
  return attributes.join('; ');
};

/** 新しく匿名 ID を発行したときだけ、レスポンスに付けるヘッダーを返す */
export const buildUsageCookieHeaders = (context: UsageContext): Record<string, string> =>
  context.issuedAnonymousId
    ? { 'Set-Cookie': buildAnonymousIdSetCookie(context.issuedAnonymousId) }
    : {};

/**
 * 例外で 500 を返すときにも、新しく発行した匿名 ID を渡すための受け皿。
 * 例外は withApiErrorReporting が 500 に変換するため、ハンドラの中からはヘッダーを付けられない。
 */
export type PendingCookie = { setCookie?: string };

/** 発行した匿名 ID の Set-Cookie を、受け皿に置く */
export const stagePendingCookie = (context: UsageContext, pending: PendingCookie): void => {
  if (context.issuedAnonymousId) {
    pending.setCookie = buildAnonymousIdSetCookie(context.issuedAnonymousId);
  }
};

/** 受け皿の Set-Cookie が、レスポンスに付いていなければ付ける */
export const applyPendingCookie = <T extends Response>(response: T, pending: PendingCookie): T => {
  if (pending.setCookie && !response.headers.get('set-cookie')) {
    response.headers.append('Set-Cookie', pending.setCookie);
  }
  return response;
};

/** 戻す処理の失敗は元の処理を妨げず、warning で報告する */
export const createUsageService = (): UsageService =>
  new UsageService(createUsageRepository(), {
    reportError: async (message, error) => {
      await errorReporter.report(message, error, { severity: 'warning' });
    },
  });
