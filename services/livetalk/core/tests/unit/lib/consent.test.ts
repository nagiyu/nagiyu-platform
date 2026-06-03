import { isConsentValid } from '../../../src/lib/consent.js';

const requirements = { termsVersion: '1.0.0', privacyVersion: '1.0.0' };

describe('isConsentValid', () => {
  it('consents が undefined なら false', () => {
    expect(isConsentValid(undefined, requirements)).toBe(false);
  });

  it('TermsAgreed がない場合 false', () => {
    expect(
      isConsentValid(
        {
          PrivacyAgreed: { Version: '1.0.0', AgreedAt: 1 },
          AgeVerified: { Value: true, VerifiedAt: 1 },
        },
        requirements
      )
    ).toBe(false);
  });

  it('PrivacyAgreed がない場合 false', () => {
    expect(
      isConsentValid(
        {
          TermsAgreed: { Version: '1.0.0', AgreedAt: 1 },
          AgeVerified: { Value: true, VerifiedAt: 1 },
        },
        requirements
      )
    ).toBe(false);
  });

  it('AgeVerified.Value が false の場合 false', () => {
    expect(
      isConsentValid(
        {
          TermsAgreed: { Version: '1.0.0', AgreedAt: 1 },
          PrivacyAgreed: { Version: '1.0.0', AgreedAt: 1 },
          AgeVerified: { Value: false, VerifiedAt: 1 },
        },
        requirements
      )
    ).toBe(false);
  });

  it('利用規約バージョン不一致なら false', () => {
    expect(
      isConsentValid(
        {
          TermsAgreed: { Version: '0.9.0', AgreedAt: 1 },
          PrivacyAgreed: { Version: '1.0.0', AgreedAt: 1 },
          AgeVerified: { Value: true, VerifiedAt: 1 },
        },
        requirements
      )
    ).toBe(false);
  });

  it('全条件を満たす場合 true', () => {
    expect(
      isConsentValid(
        {
          TermsAgreed: { Version: '1.0.0', AgreedAt: 1 },
          PrivacyAgreed: { Version: '1.0.0', AgreedAt: 1 },
          AgeVerified: { Value: true, VerifiedAt: 1 },
        },
        requirements
      )
    ).toBe(true);
  });
});
