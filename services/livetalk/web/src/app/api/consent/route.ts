import { NextResponse } from 'next/server';
import { readJsonObjectBody, withAuth } from '@nagiyu/nextjs';
import {
  isConsentValid,
  LIVETALK_TERMS_VERSION,
  LIVETALK_PRIVACY_VERSION,
  createProfileRepository,
} from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { withApiErrorReporting } from '@/lib/server/api-error-reporting';
import { CONSENT_ERROR_MESSAGES } from './constants';

interface ConsentRequest {
  termsAgreed: boolean;
  privacyAgreed: boolean;
  ageVerified: boolean;
}

function isConsentRequest(
  body: Record<string, unknown>
): body is Record<string, unknown> & ConsentRequest {
  return (
    typeof body.termsAgreed === 'boolean' &&
    typeof body.privacyAgreed === 'boolean' &&
    typeof body.ageVerified === 'boolean'
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

    const profile = await createProfileRepository().getById({ userId });
    const consented = isConsentValid(profile?.consents, {
      termsVersion: LIVETALK_TERMS_VERSION,
      privacyVersion: LIVETALK_PRIVACY_VERSION,
    });

    return NextResponse.json({
      consented,
      requiredVersions: {
        terms: LIVETALK_TERMS_VERSION,
        privacy: LIVETALK_PRIVACY_VERSION,
      },
      current: profile?.consents ?? null,
    });
  }),
  { error: 'FETCH_FAILED', message: CONSENT_ERROR_MESSAGES.FETCH_FAILED }
);

/**
 * POST /api/consent
 *
 * 全ての同意を受け付けて DynamoDB Profile に永続化する。
 * 3 フラグが全て true でなければ 400 を返す。
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

    if (!body.termsAgreed || !body.privacyAgreed || !body.ageVerified) {
      return NextResponse.json(
        { error: 'ALL_CONSENTS_REQUIRED', message: CONSENT_ERROR_MESSAGES.ALL_CONSENTS_REQUIRED },
        { status: 400 }
      );
    }

    const now = Date.now();
    const userId = session.user.id;

    await createProfileRepository().upsert(
      { userId },
      {
        lastActiveAt: now,
        consents: {
          termsAgreed: { version: LIVETALK_TERMS_VERSION, agreedAt: now },
          privacyAgreed: { version: LIVETALK_PRIVACY_VERSION, agreedAt: now },
          ageVerified: { value: true, verifiedAt: now },
        },
      }
    );

    return NextResponse.json({ consented: true });
  }),
  { error: 'SAVE_FAILED', message: CONSENT_ERROR_MESSAGES.SAVE_FAILED }
);
