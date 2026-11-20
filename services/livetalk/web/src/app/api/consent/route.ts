import { NextResponse } from 'next/server';
import { readJsonObjectBody, withAuth } from '@nagiyu/nextjs';
import {
  LIVETALK_TERMS_VERSION,
  LIVETALK_PRIVACY_VERSION,
  createProfileRepository,
} from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getConsentStatus } from '@/lib/server/consent';
import { withApiErrorReporting } from '@/lib/server/api-error-reporting';
import { CONSENT_ERROR_MESSAGES } from './constants';

interface ConsentRequest {
  termsAgreed: boolean;
  privacyAgreed: boolean;
  /** 省略または false のときは、記録済みの申告をそのまま残す */
  ageVerified?: boolean;
}

function isConsentRequest(
  body: Record<string, unknown>
): body is Record<string, unknown> & ConsentRequest {
  return (
    typeof body.termsAgreed === 'boolean' &&
    typeof body.privacyAgreed === 'boolean' &&
    (body.ageVerified === undefined || typeof body.ageVerified === 'boolean')
  );
}

/**
 * GET /api/consent
 *
 * 現在のユーザーの同意状態を返す。
 * `consented: true` の場合はチャット機能を利用可能。
 */
export const GET = withApiErrorReporting(
  'Web API: 同意状態取得エラー',
  withAuth(getSession, 'livetalk:chat', async (session) => {
    const userId = session.user.id;

    const { consented, consents } = await getConsentStatus(userId);

    return NextResponse.json({
      consented,
      requiredVersions: {
        terms: LIVETALK_TERMS_VERSION,
        privacy: LIVETALK_PRIVACY_VERSION,
      },
      current: consents ?? null,
    });
  }),
  { error: 'FETCH_FAILED', message: CONSENT_ERROR_MESSAGES.FETCH_FAILED }
);

/**
 * POST /api/consent
 *
 * 全ての同意を受け付けて DynamoDB Profile に永続化する。
 * 規約・ポリシーの同意が true で、かつ 18 歳以上の自己申告が (今回の true か記録済みの true で)
 * 揃わなければ 400 を返す。申告が記録済みなら、同意の取り直しでは申告を求めず、記録をそのまま残す。
 */
export const POST = withApiErrorReporting(
  'Web API: 同意状態保存エラー',
  withAuth(getSession, 'livetalk:chat', async (session, request: Request) => {
    const bodyResult = await readJsonObjectBody(request);
    if (!bodyResult.ok || !isConsentRequest(bodyResult.body)) {
      return NextResponse.json(
        { error: 'INVALID_REQUEST', message: CONSENT_ERROR_MESSAGES.INVALID_REQUEST },
        { status: 400 }
      );
    }

    const body = bodyResult.body;

    const userId = session.user.id;
    const repository = createProfileRepository();

    if (!body.termsAgreed || !body.privacyAgreed) {
      return NextResponse.json(
        { error: 'ALL_CONSENTS_REQUIRED', message: CONSENT_ERROR_MESSAGES.ALL_CONSENTS_REQUIRED },
        { status: 400 }
      );
    }

    const recorded = (await repository.getById({ userId }))?.consents;
    // 申告が来ていないときは、記録済みの申告で足りるかを確かめる
    const keptAge =
      body.ageVerified !== true && recorded?.ageVerified?.value === true
        ? recorded.ageVerified
        : undefined;

    if (body.ageVerified !== true && !keptAge) {
      return NextResponse.json(
        { error: 'ALL_CONSENTS_REQUIRED', message: CONSENT_ERROR_MESSAGES.ALL_CONSENTS_REQUIRED },
        { status: 400 }
      );
    }

    const now = Date.now();
    // 改定のダイアログは変わった文書のチェックしか出さない。現行の版に同意済みの文書は、
    // 実際に同意した日時を残すため記録を上書きしない
    const termsAgreed =
      recorded?.termsAgreed?.version === LIVETALK_TERMS_VERSION
        ? recorded.termsAgreed
        : { version: LIVETALK_TERMS_VERSION, agreedAt: now };
    const privacyAgreed =
      recorded?.privacyAgreed?.version === LIVETALK_PRIVACY_VERSION
        ? recorded.privacyAgreed
        : { version: LIVETALK_PRIVACY_VERSION, agreedAt: now };

    await repository.upsert(
      { userId },
      {
        lastActiveAt: now,
        consents: {
          termsAgreed,
          privacyAgreed,
          ageVerified: keptAge ?? { value: true, verifiedAt: now },
        },
      }
    );

    return NextResponse.json({ consented: true });
  }),
  { error: 'SAVE_FAILED', message: CONSENT_ERROR_MESSAGES.SAVE_FAILED }
);
