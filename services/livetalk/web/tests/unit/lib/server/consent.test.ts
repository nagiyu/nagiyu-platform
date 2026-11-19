/**
 * @jest-environment node
 */
import { getConsentStatus } from '@/lib/server/consent';
import { createProfileRepository } from '@nagiyu/livetalk-core';

jest.mock('@nagiyu/livetalk-core', () => ({
  ...jest.requireActual('@nagiyu/livetalk-core'),
  createProfileRepository: jest.fn(),
}));

const mockGetProfileRepo = createProfileRepository as jest.Mock;

const validConsents = {
  termsAgreed: { version: '1.1.0', agreedAt: 0 },
  privacyAgreed: { version: '1.1.0', agreedAt: 0 },
  ageVerified: { value: true, verifiedAt: 0 },
};

const mockProfile = (profile: unknown) => {
  const getById = jest.fn().mockResolvedValue(profile);
  mockGetProfileRepo.mockReturnValue({ getById });
  return getById;
};

describe('getConsentStatus', () => {
  beforeEach(() => jest.clearAllMocks());

  it('現行の版の同意が揃っていれば consented: true と同意の内容を返す', async () => {
    const getById = mockProfile({ userId: 'u1', consents: validConsents });
    await expect(getConsentStatus('u1')).resolves.toEqual({
      consented: true,
      consents: validConsents,
    });
    expect(getById).toHaveBeenCalledWith({ userId: 'u1' });
  });

  it('プロフィールがなければ consented: false で consents は undefined', async () => {
    mockProfile(null);
    await expect(getConsentStatus('u1')).resolves.toEqual({
      consented: false,
      consents: undefined,
    });
  });

  it('版が古ければ consented: false で保存済みの同意の内容は返す', async () => {
    const old = { ...validConsents, termsAgreed: { version: '1.0.0', agreedAt: 0 } };
    mockProfile({ userId: 'u1', consents: old });
    await expect(getConsentStatus('u1')).resolves.toEqual({ consented: false, consents: old });
  });

  it('年齢が未確認なら consented: false', async () => {
    mockProfile({
      userId: 'u1',
      consents: { ...validConsents, ageVerified: { value: false, verifiedAt: 0 } },
    });
    const status = await getConsentStatus('u1');
    expect(status.consented).toBe(false);
  });

  it('プロフィール取得の失敗は握りつぶさず投げる', async () => {
    mockGetProfileRepo.mockReturnValue({ getById: jest.fn().mockRejectedValue(new Error('down')) });
    await expect(getConsentStatus('u1')).rejects.toThrow('down');
  });
});
