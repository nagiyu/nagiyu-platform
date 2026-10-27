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
          privacyAgreed: { version: '1.0.0', agreedAt: 1 },
          ageVerified: { value: true, verifiedAt: 1 },
        },
        requirements
      )
    ).toBe(false);
  });

  it('PrivacyAgreed がない場合 false', () => {
    expect(
      isConsentValid(
        {
          termsAgreed: { version: '1.0.0', agreedAt: 1 },
          ageVerified: { value: true, verifiedAt: 1 },
        },
        requirements
      )
    ).toBe(false);
  });

  it('AgeVerified.Value が false の場合 false', () => {
    expect(
      isConsentValid(
        {
          termsAgreed: { version: '1.0.0', agreedAt: 1 },
          privacyAgreed: { version: '1.0.0', agreedAt: 1 },
          ageVerified: { value: false, verifiedAt: 1 },
        },
        requirements
      )
    ).toBe(false);
  });

  it('利用規約バージョン不一致なら false', () => {
    expect(
      isConsentValid(
        {
          termsAgreed: { version: '0.9.0', agreedAt: 1 },
          privacyAgreed: { version: '1.0.0', agreedAt: 1 },
          ageVerified: { value: true, verifiedAt: 1 },
        },
        requirements
      )
    ).toBe(false);
  });

  it('全条件を満たす場合 true', () => {
    expect(
      isConsentValid(
        {
          termsAgreed: { version: '1.0.0', agreedAt: 1 },
          privacyAgreed: { version: '1.0.0', agreedAt: 1 },
          ageVerified: { value: true, verifiedAt: 1 },
        },
        requirements
      )
    ).toBe(true);
  });
});
