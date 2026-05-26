/**
 * @jest-environment node
 */
import { GET, POST } from '@/app/api/consent/route';
import { CONSENT_ERROR_MESSAGES } from '@/app/api/consent/constants';
import { getSession } from '@/lib/server/session';
import { getProfileRepository } from '@/lib/server/repositories';
import type { ProfileRepository } from '@nagiyu/livetalk-core';

jest.mock('@/lib/server/session', () => ({
  getSession: jest.fn(),
}));

jest.mock('@/lib/server/repositories', () => ({
  getProfileRepository: jest.fn(),
}));

const mockGetSession = getSession as jest.MockedFunction<typeof getSession>;
const mockGetProfileRepo = getProfileRepository as jest.MockedFunction<typeof getProfileRepository>;

const validSession = {
  user: {
    userId: 'u1',
    googleId: 'g1',
    email: 'u@example.com',
    name: 'U',
    roles: ['livetalk-user'],
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  expires: new Date(Date.now() + 60 * 1000).toISOString(),
};

const consentedProfile = {
  UserID: 'g1',
  LastActiveAt: 0,
  CreatedAt: 0,
  UpdatedAt: 0,
  Consents: {
    TermsAgreed: { Version: '1.0.0', AgreedAt: 0 },
    PrivacyAgreed: { Version: '1.0.0', AgreedAt: 0 },
    AgeVerified: { Value: true, VerifiedAt: 0 },
  },
};

const makeProfileRepo = (
  profile: typeof consentedProfile | null = consentedProfile
): ProfileRepository => ({
  getById: jest.fn(async () => profile),
  upsert: jest.fn(async () => consentedProfile),
});

const buildGetRequest = (): Request =>
  new Request('http://localhost/api/consent', { method: 'GET' });

const buildPostRequest = (body: unknown): Request =>
  new Request('http://localhost/api/consent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

describe('GET /api/consent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(401);
  });

  it('同意済みプロファイルがあれば consented: true を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    mockGetProfileRepo.mockReturnValue(makeProfileRepo(consentedProfile));
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.consented).toBe(true);
    expect(json.requiredVersions).toEqual({ terms: '1.0.0', privacy: '1.0.0' });
  });

  it('プロファイルがなければ consented: false を返す', async () => {
    mockGetSession.mockResolvedValue(validSession);
    mockGetProfileRepo.mockReturnValue(makeProfileRepo(null));
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.consented).toBe(false);
    expect(json.current).toBeNull();
  });

  it('バージョン不一致なら consented: false', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const oldProfile = {
      ...consentedProfile,
      Consents: {
        ...consentedProfile.Consents,
        TermsAgreed: { Version: '0.9.0', AgreedAt: 0 },
      },
    };
    mockGetProfileRepo.mockReturnValue(makeProfileRepo(oldProfile));
    const res = await GET(buildGetRequest());
    const json = await res.json();
    expect(json.consented).toBe(false);
  });

  it('DB エラーは 500', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValue(validSession);
    mockGetProfileRepo.mockReturnValue({
      getById: jest.fn(async () => {
        throw new Error('db error');
      }),
      upsert: jest.fn(async () => consentedProfile),
    });
    const res = await GET(buildGetRequest());
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toBe(CONSENT_ERROR_MESSAGES.FETCH_FAILED);
    consoleSpy.mockRestore();
  });
});

describe('POST /api/consent', () => {
  beforeEach(() => jest.clearAllMocks());

  it('未認証は 401', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const res = await POST(
      buildPostRequest({ termsAgreed: true, privacyAgreed: true, ageVerified: true })
    );
    expect(res.status).toBe(401);
  });

  it('JSON でない body は 400', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(buildPostRequest('invalid-json'));
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe(CONSENT_ERROR_MESSAGES.INVALID_REQUEST);
  });

  it('型が違う body は 400', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(
      buildPostRequest({ termsAgreed: 'yes', privacyAgreed: true, ageVerified: true })
    );
    expect(res.status).toBe(400);
  });

  it('termsAgreed が false なら 400 ALL_CONSENTS_REQUIRED', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(
      buildPostRequest({ termsAgreed: false, privacyAgreed: true, ageVerified: true })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe(CONSENT_ERROR_MESSAGES.ALL_CONSENTS_REQUIRED);
  });

  it('ageVerified が false なら 400 ALL_CONSENTS_REQUIRED', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const res = await POST(
      buildPostRequest({ termsAgreed: true, privacyAgreed: true, ageVerified: false })
    );
    expect(res.status).toBe(400);
    const json = await res.json();
    expect(json.message).toBe(CONSENT_ERROR_MESSAGES.ALL_CONSENTS_REQUIRED);
  });

  it('全て true なら 200 で consented: true を返し upsert が呼ばれる', async () => {
    mockGetSession.mockResolvedValue(validSession);
    const repo = makeProfileRepo();
    mockGetProfileRepo.mockReturnValue(repo);
    const res = await POST(
      buildPostRequest({ termsAgreed: true, privacyAgreed: true, ageVerified: true })
    );
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.consented).toBe(true);
    expect(repo.upsert).toHaveBeenCalledWith(
      { UserID: 'g1' },
      expect.objectContaining({
        Consents: expect.objectContaining({
          TermsAgreed: expect.objectContaining({ Version: '1.0.0' }),
          PrivacyAgreed: expect.objectContaining({ Version: '1.0.0' }),
          AgeVerified: { Value: true, VerifiedAt: expect.any(Number) },
        }),
      })
    );
  });

  it('upsert が失敗すると 500 SAVE_FAILED', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockGetSession.mockResolvedValue(validSession);
    mockGetProfileRepo.mockReturnValue({
      getById: jest.fn(async () => null),
      upsert: jest.fn(async () => {
        throw new Error('db error');
      }),
    });
    const res = await POST(
      buildPostRequest({ termsAgreed: true, privacyAgreed: true, ageVerified: true })
    );
    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.message).toBe(CONSENT_ERROR_MESSAGES.SAVE_FAILED);
    consoleSpy.mockRestore();
  });
});
