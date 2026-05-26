import { NextResponse } from 'next/server';
import { withAuth } from '@nagiyu/nextjs';
import {
  isConsentValid,
  LIVETALK_TERMS_VERSION,
  LIVETALK_PRIVACY_VERSION,
} from '@nagiyu/livetalk-core';
import { getSession } from '@/lib/server/session';
import { getProfileRepository } from '@/lib/server/repositories';
import { CONSENT_ERROR_MESSAGES } from './constants';

interface ConsentRequest {
  termsAgreed: boolean;
  privacyAgreed: boolean;
  ageVerified: boolean;
}

function isConsentRequest(body: unknown): body is ConsentRequest {
  return (
    typeof body === 'object' &&
    body !== null &&
    typeof (body as Partial<ConsentRequest>).termsAgreed === 'boolean' &&
    typeof (body as Partial<ConsentRequest>).privacyAgreed === 'boolean' &&
    typeof (body as Partial<ConsentRequest>).ageVerified === 'boolean'
  );
}

/**
 * GET /api/consent
 *
 * 現在のユーザーの同意状態を返す。
 * `consented: true` の場合はチャット機能を利用可能。
 */
export const GET = withAuth(getSession, 'livetalk:chat', async (session) => {
  const userId = session.user.googleId;

  try {
    const profile = await getProfileRepository().getById({ userId });
    const consented = isConsentValid(profile?.Consents, {
      termsVersion: LIVETALK_TERMS_VERSION,
      privacyVersion: LIVETALK_PRIVACY_VERSION,
    });

    return NextResponse.json({
      consented,
      requiredVersions: {
        terms: LIVETALK_TERMS_VERSION,
        privacy: LIVETALK_PRIVACY_VERSION,
      },
      current: profile?.Consents ?? null,
    });
  } catch (error) {
    console.error('[GET /api/consent] 同意状態の取得に失敗しました', error);
    return NextResponse.json(
      { error: 'FETCH_FAILED', message: CONSENT_ERROR_MESSAGES.FETCH_FAILED },
      { status: 500 }
    );
  }
});

/**
 * POST /api/consent
 *
 * 全ての同意を受け付けて DynamoDB Profile に永続化する。
 * 3 フラグが全て true でなければ 400 を返す。
 */
export const POST = withAuth(getSession, 'livetalk:chat', async (session, request: Request) => {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: CONSENT_ERROR_MESSAGES.INVALID_REQUEST },
      { status: 400 }
    );
  }

  if (!isConsentRequest(body)) {
    return NextResponse.json(
      { error: 'INVALID_REQUEST', message: CONSENT_ERROR_MESSAGES.INVALID_REQUEST },
      { status: 400 }
    );
  }

  if (!body.termsAgreed || !body.privacyAgreed || !body.ageVerified) {
    return NextResponse.json(
      { error: 'ALL_CONSENTS_REQUIRED', message: CONSENT_ERROR_MESSAGES.ALL_CONSENTS_REQUIRED },
      { status: 400 }
    );
  }

  const now = Date.now();
  const userId = session.user.googleId;

  try {
    await getProfileRepository().upsert(
      { UserID: userId },
      {
        LastActiveAt: now,
        Consents: {
          TermsAgreed: { Version: LIVETALK_TERMS_VERSION, AgreedAt: now },
          PrivacyAgreed: { Version: LIVETALK_PRIVACY_VERSION, AgreedAt: now },
          AgeVerified: { Value: true, VerifiedAt: now },
        },
      }
    );

    return NextResponse.json({ consented: true });
  } catch (error) {
    console.error('[POST /api/consent] 同意状態の保存に失敗しました', error);
    return NextResponse.json(
      { error: 'SAVE_FAILED', message: CONSENT_ERROR_MESSAGES.SAVE_FAILED },
      { status: 500 }
    );
  }
});
