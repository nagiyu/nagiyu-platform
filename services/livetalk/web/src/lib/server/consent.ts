import {
  createProfileRepository,
  isConsentValid,
  LIVETALK_PRIVACY_VERSION,
  LIVETALK_TERMS_VERSION,
} from '@nagiyu/livetalk-core';
import type { UserConsents } from '@nagiyu/livetalk-core';

/**
 * ユーザーの同意状態。
 */
export interface ConsentStatus {
  /** 現行の版の利用規約・プライバシーポリシー・年齢確認がすべて揃っているか */
  consented: boolean;
  /** 保存されている同意の内容 (プロフィールが無い場合、同意が未保存の場合は undefined) */
  consents: UserConsents | undefined;
}

/**
 * ユーザーの同意が現行の版で有効かを判定する。
 *
 * 同意は規約上のゲートなので、プロフィールを取得できない場合は例外を握りつぶさず投げる。
 * 呼び出し側は通さずに失敗として扱うこと (ロックやレートリミットのフェイルオープンとは逆の方針)。
 */
export async function getConsentStatus(userId: string): Promise<ConsentStatus> {
  const profile = await createProfileRepository().getById({ userId });
  const consented = isConsentValid(profile?.consents, {
    termsVersion: LIVETALK_TERMS_VERSION,
    privacyVersion: LIVETALK_PRIVACY_VERSION,
  });
  return { consented, consents: profile?.consents };
}
