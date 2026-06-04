import type { UserConsents } from '../entities/profile.entity.js';

export interface ConsentRequirements {
  termsVersion: string;
  privacyVersion: string;
}

/**
 * ユーザーの同意状態が要件を満たしているか検証する純粋関数。
 *
 * 以下の全条件を満たす場合のみ true を返す:
 * - 利用規約に同意済み（バージョンが一致）
 * - プライバシーポリシーに同意済み（バージョンが一致）
 * - 18 歳以上の自己申告が完了
 */
export function isConsentValid(
  consents: UserConsents | undefined,
  requirements: ConsentRequirements
): boolean {
  if (!consents) return false;
  if (consents.TermsAgreed?.Version !== requirements.termsVersion) return false;
  if (consents.PrivacyAgreed?.Version !== requirements.privacyVersion) return false;
  if (consents.AgeVerified?.Value !== true) return false;
  return true;
}
