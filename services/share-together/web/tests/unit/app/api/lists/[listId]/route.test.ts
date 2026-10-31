/**
 * @jest-environment node
 */

jest.mock('next/server', () => {
  class MockNextResponse {
    public status: number;
    private readonly body: unknown;

    constructor(body?: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
      this.body = body;
    }

    public static json(body: unknown, init?: { status?: number }): MockNextResponse {
      if (init?.status === 204) {
        throw new TypeError('Response constructor: ステータスコード 204 は無効です');
      }

      return new MockNextResponse(body, init);
    }

    public async json(): Promise<unknown> {
      return this.body;
    }
  }

  return { NextResponse: MockNextResponse };
});

jest.mock('@/lib/auth/session', () => ({
  getSessionOrUnauthorized: jest.fn(),
}));

jest.mock('@nagiyu/aws', () => ({
  ...jest.requireActual('@nagiyu/aws'),
  getDynamoDBDocumentClient: jest.fn(),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/share-together-core', () => ({
  LIST_ERROR_MESSAGES: jest.requireActual<typeof import('@nagiyu/share-together-core')>(
    '@nagiyu/share-together-core'
  ).LIST_ERROR_MESSAGES,
  DynamoDBListRepository: jest.fn(),
  createListRepository: jest.fn(),
  createTodoRepository: jest.fn(),
  ListService: jest.fn(),
}));

import { DELETE, GET, PUT } from '@/app/api/lists/[listId]/route';
import { getSessionOrUnauthorized } from '@/lib/auth/session';
import { EntityNotFoundError, getDynamoDBDocumentClient } from '@nagiyu/aws';
import { InvalidInputError } from '@nagiyu/common';
import {
  DynamoDBListRepository,
  LIST_ERROR_MESSAGES,
  ListService,
} from '@nagiyu/share-together-core';

const mockGetSessionOrUnauthorized = getSessionOrUnauthorized as jest.MockedFunction<
  typeof getSessionOrUnauthorized
>;
const mockGetDynamoDBDocumentClient = getDynamoDBDocumentClient as jest.MockedFunction<
  typeof getDynamoDBDocumentClient
>;
const mockDynamoDBListRepository = DynamoDBListRepository as jest.MockedClass<
  typeof DynamoDBListRepository
>;
(
  jest.requireMock('@nagiyu/share-together-core') as { createListRepository: jest.Mock }
).createListRepository.mockImplementation((...args: unknown[]) =>
  mockDynamoDBListRepository(...args)
);
const mockListService = ListService as jest.MockedClass<typeof ListService>;
type SessionOrUnauthorized = Awaited<ReturnType<typeof getSessionOrUnauthorized>>;

import {
  createRequestWithJson,
  MALFORMED_BODY_CASES,
  type InvalidBodyCase,
} from '../../invalidBodyCases';

describe('/api/lists/[listId] route handlers', () => {
  const mockGetPersonalListById = jest.fn();
  const mockUpdatePersonalList = jest.fn();
  const mockDeletePersonalList = jest.fn();

  const createRequest = (body: unknown): Request =>
    ({
      json: async () => body,
    }) as Request;
  const createContext = (listId = 'list-1'): { params: Promise<{ listId: string }> } => ({
    params: Promise.resolve({ listId }),
  });

  beforeEach(() => {
    process.env.DYNAMODB_TABLE_NAME = 'test-share-together-main';

    mockGetDynamoDBDocumentClient.mockReturnValue({ send: jest.fn() } as ReturnType<
      typeof getDynamoDBDocumentClient
    >);

    mockDynamoDBListRepository.mockImplementation(
      () => ({}) as InstanceType<typeof DynamoDBListRepository>
    );

    mockListService.mockImplementation(
      () =>
        ({
          getPersonalListById: mockGetPersonalListById,
          updatePersonalList: mockUpdatePersonalList,
          deletePersonalList: mockDeletePersonalList,
        }) as InstanceType<typeof ListService>
    );
  });

  afterEach(() => {
    delete process.env.DYNAMODB_TABLE_NAME;
    jest.clearAllMocks();
    // 500 の経路で黙らせた console.error を、後続のテストへ持ち越さない
    jest.restoreAllMocks();
  });

  it('GET: 個人リストを返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockGetPersonalListById.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '買い物',
      isDefault: false,
      createdAt: 1767225600000,
      updatedAt: 1767312000000,
    });

    const response = await GET({} as Request, createContext());

    expect(response.status).toBe(200);
    expect(mockGetPersonalListById).toHaveBeenCalledWith('user-1', 'list-1');
    await expect(response.json()).resolves.toEqual({
      data: {
        listId: 'list-1',
        userId: 'user-1',
        name: '買い物',
        isDefault: false,
        createdAt: 1767225600000,
        updatedAt: 1767312000000,
      },
    });
  });

  it('PUT: 個人リスト名を更新して返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockUpdatePersonalList.mockResolvedValue({
      listId: 'list-1',
      userId: 'user-1',
      name: '仕事',
      isDefault: false,
      createdAt: 1767225600000,
      updatedAt: 1767312000000,
    });

    const response = await PUT(createRequest({ name: '仕事' }), createContext());

    expect(response.status).toBe(200);
    expect(mockUpdatePersonalList).toHaveBeenCalledWith('user-1', 'list-1', '仕事');
    await expect(response.json()).resolves.toEqual({
      data: {
        listId: 'list-1',
        userId: 'user-1',
        name: '仕事',
        isDefault: false,
        createdAt: 1767225600000,
        updatedAt: 1767312000000,
      },
    });
  });

  it('DELETE: 個人リストを削除する', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockDeletePersonalList.mockResolvedValue(undefined);

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(204);
    expect(mockDeletePersonalList).toHaveBeenCalledWith('user-1', 'list-1');
  });

  it('DELETE: デフォルトリスト削除時は DEFAULT_LIST_NOT_DELETABLE を返す', async () => {
    mockGetSessionOrUnauthorized.mockResolvedValue({
      user: { id: 'user-1' },
    } as SessionOrUnauthorized);
    mockDeletePersonalList.mockRejectedValue(
      new Error(LIST_ERROR_MESSAGES.DEFAULT_LIST_NOT_DELETABLE)
    );

    const response = await DELETE({} as Request, createContext());

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: 'DEFAULT_LIST_NOT_DELETABLE',
      message: 'デフォルトリストは削除できません',
    });
  });

  describe('エラーの振り分け', () => {
    const notFound = (): EntityNotFoundError =>
      new EntityNotFoundError('PersonalList', 'USER#user-1#PLIST#list-1');
    const notFoundBody = { error: 'NOT_FOUND', message: '対象のデータが見つかりません' };

    beforeEach(() => {
      mockGetSessionOrUnauthorized.mockResolvedValue({
        user: { id: 'user-1' },
      } as SessionOrUnauthorized);
    });

    it('GET: EntityNotFoundError の場合は404を返す', async () => {
      mockGetPersonalListById.mockRejectedValue(notFound());

      const response = await GET({} as Request, createContext());

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual(notFoundBody);
    });

    it('GET: InvalidInputError の場合は400を返す', async () => {
      mockGetPersonalListById.mockRejectedValue(new InvalidInputError('リストIDは必須です'));

      const response = await GET({} as Request, createContext());

      expect(response.status).toBe(400);
    });

    it('GET: 不在や検証エラーと同じ文言でも素の Error は400/404にせず500を返す', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockGetPersonalListById.mockRejectedValue(new Error('個人リストが見つかりません'));
      const notFoundResponse = await GET({} as Request, createContext());
      mockGetPersonalListById.mockRejectedValue(new Error('リストIDは必須です'));
      const validationResponse = await GET({} as Request, createContext());

      expect(notFoundResponse.status).toBe(500);
      expect(validationResponse.status).toBe(500);
    });

    it('PUT: EntityNotFoundError の場合は404を返す', async () => {
      mockUpdatePersonalList.mockRejectedValue(notFound());

      const response = await PUT(createRequest({ name: '仕事' }), createContext());

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual(notFoundBody);
    });

    it('PUT: InvalidInputError の場合は400を返す', async () => {
      mockUpdatePersonalList.mockRejectedValue(
        new InvalidInputError('リスト名は1〜100文字で入力してください')
      );

      const response = await PUT(createRequest({ name: '仕事' }), createContext());

      expect(response.status).toBe(400);
    });

    it('PUT: 素の Error は400/404にせず500を返す', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockUpdatePersonalList.mockRejectedValue(new Error('個人リストが見つかりません'));

      const response = await PUT(createRequest({ name: '仕事' }), createContext());

      expect(response.status).toBe(500);
    });

    it('DELETE: EntityNotFoundError の場合は404を返す', async () => {
      mockDeletePersonalList.mockRejectedValue(notFound());

      const response = await DELETE({} as Request, createContext());

      expect(response.status).toBe(404);
      await expect(response.json()).resolves.toEqual(notFoundBody);
    });

    it('DELETE: InvalidInputError の場合は400を返す', async () => {
      mockDeletePersonalList.mockRejectedValue(new InvalidInputError('リストIDは必須です'));

      const response = await DELETE({} as Request, createContext());

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({ error: 'VALIDATION_ERROR' });
    });

    it('DELETE: 素の Error は400/404にせず500を返す', async () => {
      jest.spyOn(console, 'error').mockImplementation(() => undefined);
      mockDeletePersonalList.mockRejectedValue(new Error('個人リストが見つかりません'));

      const response = await DELETE({} as Request, createContext());

      expect(response.status).toBe(500);
    });
  });

  it.each<InvalidBodyCase>([...MALFORMED_BODY_CASES, ['name が数値', async () => ({ name: 123 })]])(
    'PUT: リクエストボディが不正な場合 (%s) は400を返す',
    async (_label, json) => {
      mockGetSessionOrUnauthorized.mockResolvedValue({
        user: { id: 'user-1' },
      } as SessionOrUnauthorized);

      const response = await PUT(createRequestWithJson(json), createContext());

      expect(response.status).toBe(400);
      expect(mockUpdatePersonalList).not.toHaveBeenCalled();
    }
  );
});
