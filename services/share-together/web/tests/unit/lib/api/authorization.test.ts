jest.mock('next/server', () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      status: init?.status ?? 200,
      json: async () => body,
    }),
  },
}));

jest.mock('@/lib/auth/session', () => ({
  getSessionOrUnauthorized: jest.fn(),
}));

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  createMembershipRepository: jest.fn(),
}));

import { getAuthorizedGroupContext } from '@/lib/api/authorization';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { getDynamoDBDocumentClient } from '@nagiyu/aws';
import { createMembershipRepository } from '@nagiyu/share-together-core';

const mockSession = getSessionOrUnauthorized as jest.Mock;
const mockGetClient = getDynamoDBDocumentClient as jest.Mock;
const mockCreateMembershipRepository = createMembershipRepository as jest.Mock;

describe('getAuthorizedGroupContext', () => {
  const mockGetById = jest.fn();
  const originalEnv = process.env;
  const docClient = { id: 'doc-client' };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env = { ...originalEnv, DYNAMODB_TABLE_NAME: 'table', USE_IN_MEMORY_DB: 'false' };
    mockSession.mockResolvedValue({ user: { id: 'user-1' } });
    mockGetClient.mockReturnValue(docClient);
    mockCreateMembershipRepository.mockReturnValue({ getById: mockGetById });
    mockGetById.mockResolvedValue({ status: 'ACCEPTED' });
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  it('ACCEPTED メンバーなら params と認可文脈を返す', async () => {
    const result = await getAuthorizedGroupContext(
      Promise.resolve({ groupId: 'g1', listId: 'l1' })
    );

    expect(result).toEqual({
      groupId: 'g1',
      listId: 'l1',
      userId: 'user-1',
      tableName: 'table',
      docClient,
    });
    expect(mockGetById).toHaveBeenCalledWith('g1', 'user-1');
  });

  it('インメモリ DB 利用時は docClient が undefined になる', async () => {
    process.env.USE_IN_MEMORY_DB = 'true';
    const result = await getAuthorizedGroupContext(Promise.resolve({ groupId: 'g1' }));

    expect(result).toMatchObject({ docClient: undefined });
    expect(mockGetClient).not.toHaveBeenCalled();
  });

  it('未認証ならセッション確認のレスポンスをそのまま返す', async () => {
    const unauthorized = { status: 401 };
    mockSession.mockResolvedValue(unauthorized);

    await expect(getAuthorizedGroupContext(Promise.resolve({ groupId: 'g1' }))).resolves.toBe(
      unauthorized
    );
  });

  it.each([
    ['空文字の groupId', { groupId: '', listId: 'l1' }],
    ['空白だけの groupId', { groupId: '   ', listId: 'l1' }],
    ['空白だけの listId', { groupId: 'g1', listId: '  ' }],
  ])('%s は 400 VALIDATION_ERROR を返す', async (_name, params) => {
    const result = await getAuthorizedGroupContext(Promise.resolve(params));

    expect(result).toMatchObject({ status: 400 });
    expect(await (result as { json: () => Promise<unknown> }).json()).toMatchObject({
      error: 'VALIDATION_ERROR',
    });
    expect(mockGetById).not.toHaveBeenCalled();
  });

  it('ユーザー ID が空白だけなら 400 を返す', async () => {
    mockSession.mockResolvedValue({ user: { id: '  ' } });

    await expect(
      getAuthorizedGroupContext(Promise.resolve({ groupId: 'g1' }))
    ).resolves.toMatchObject({ status: 400 });
  });

  it('テーブル名が未設定ならエラーを投げる', async () => {
    delete process.env.DYNAMODB_TABLE_NAME;

    await expect(getAuthorizedGroupContext(Promise.resolve({ groupId: 'g1' }))).rejects.toThrow();
  });

  it.each([
    ['メンバーでない', null],
    ['招待中', { status: 'PENDING' }],
  ])('%s場合は 403 FORBIDDEN を返す', async (_name, membership) => {
    mockGetById.mockResolvedValue(membership);

    const result = await getAuthorizedGroupContext(Promise.resolve({ groupId: 'g1' }));

    expect(result).toMatchObject({ status: 403 });
    expect(await (result as { json: () => Promise<unknown> }).json()).toMatchObject({
      error: 'FORBIDDEN',
    });
  });
});
