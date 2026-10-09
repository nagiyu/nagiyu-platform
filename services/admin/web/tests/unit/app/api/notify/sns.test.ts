/**
 * @jest-environment node
 */
import { POST } from '@/app/api/notify/sns/route';
import {
  createPushSubscriptionRepository,
  validateSnsMessage,
  WebPushSender,
} from '@nagiyu/admin-core';

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(),
}));

jest.mock(
  '@nagiyu/admin-core',
  () => ({
    createPushSubscriptionRepository: jest.fn(),
    validateSnsMessage: jest.fn(),
    WebPushSender: jest.fn(),
  }),
  { virtual: true }
);

const mockValidateSnsMessage = validateSnsMessage as jest.MockedFunction<typeof validateSnsMessage>;
const mockCreateRepository = createPushSubscriptionRepository as jest.MockedFunction<
  typeof createPushSubscriptionRepository
>;
const mockWebPushSender = WebPushSender as unknown as jest.Mock;

const ALLOWED_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:nagiyu-admin-self-monitoring-dev';
const OTHER_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:other-topic';
const SUBSCRIBE_URL = 'https://sns.us-east-1.amazonaws.com/?Action=ConfirmSubscription';

const createRequest = (body: unknown) =>
  new Request('http://localhost/api/notify/sns', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  });

const subscriptionConfirmation = (topicArn?: unknown) => ({
  Type: 'SubscriptionConfirmation' as const,
  SubscribeURL: SUBSCRIBE_URL,
  ...(topicArn === undefined ? {} : { TopicArn: topicArn as string }),
});

const notification = (topicArn?: unknown) => ({
  Type: 'Notification' as const,
  Subject: '件名',
  Message: '本文',
  ...(topicArn === undefined ? {} : { TopicArn: topicArn as string }),
});

describe('POST /api/notify/sns', () => {
  const sendAll = jest.fn();
  const fetchMock = jest.fn();
  const originalFetch = global.fetch;
  const originalAllowedTopicArn = process.env.SNS_ALLOWED_TOPIC_ARN;
  const originalUseInMemoryDb = process.env.USE_IN_MEMORY_DB;
  let warnSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SNS_ALLOWED_TOPIC_ARN = ALLOWED_TOPIC_ARN;
    process.env.USE_IN_MEMORY_DB = 'true';
    global.fetch = fetchMock as unknown as typeof fetch;
    fetchMock.mockResolvedValue({ ok: true });
    mockCreateRepository.mockReturnValue({} as never);
    mockWebPushSender.mockImplementation(() => ({ sendAll }));
    sendAll.mockResolvedValue({ sent: 1, failed: 0 });
    warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => {
    global.fetch = originalFetch;
    warnSpy.mockRestore();
    if (originalAllowedTopicArn === undefined) {
      delete process.env.SNS_ALLOWED_TOPIC_ARN;
    } else {
      process.env.SNS_ALLOWED_TOPIC_ARN = originalAllowedTopicArn;
    }
    if (originalUseInMemoryDb === undefined) {
      delete process.env.USE_IN_MEMORY_DB;
    } else {
      process.env.USE_IN_MEMORY_DB = originalUseInMemoryDb;
    }
  });

  it('許可トピックの SubscriptionConfirmation は 200 を返し、SubscribeURL を取得する', async () => {
    mockValidateSnsMessage.mockResolvedValue(subscriptionConfirmation(ALLOWED_TOPIC_ARN));

    const response = await POST(createRequest({}));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(SUBSCRIBE_URL);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('許可トピックの Notification は 200 を返し、sendAll を呼ぶ', async () => {
    mockValidateSnsMessage.mockResolvedValue(notification(ALLOWED_TOPIC_ARN));

    const response = await POST(createRequest({}));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ success: true, sent: 1, failed: 0 });
    expect(sendAll).toHaveBeenCalledTimes(1);
    expect(sendAll).toHaveBeenCalledWith(expect.objectContaining({ title: '件名', body: '本文' }));
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('許可トピックの UnsubscribeConfirmation は 200 を返し、何も送信しない', async () => {
    mockValidateSnsMessage.mockResolvedValue({
      Type: 'UnsubscribeConfirmation',
      TopicArn: ALLOWED_TOPIC_ARN,
    });

    const response = await POST(createRequest({}));

    expect(response.status).toBe(200);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendAll).not.toHaveBeenCalled();
  });

  it('不一致トピックの SubscriptionConfirmation は 403 を返し、fetch せず警告を出す', async () => {
    mockValidateSnsMessage.mockResolvedValue(subscriptionConfirmation(OTHER_TOPIC_ARN));

    const response = await POST(createRequest({}));

    expect(response.status).toBe(403);
    expect((await response.json()).error).toBe('FORBIDDEN');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(mockCreateRepository).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ topicArn: OTHER_TOPIC_ARN, type: 'SubscriptionConfirmation' })
    );
  });

  it('不一致トピックの UnsubscribeConfirmation は 403 を返す', async () => {
    mockValidateSnsMessage.mockResolvedValue({
      Type: 'UnsubscribeConfirmation',
      TopicArn: OTHER_TOPIC_ARN,
    });

    const response = await POST(createRequest({}));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendAll).not.toHaveBeenCalled();
  });

  it('不一致トピックの Notification は 403 を返し、sendAll を呼ばない', async () => {
    mockValidateSnsMessage.mockResolvedValue(notification(OTHER_TOPIC_ARN));

    const response = await POST(createRequest({}));

    expect(response.status).toBe(403);
    expect(sendAll).not.toHaveBeenCalled();
    expect(mockCreateRepository).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ topicArn: OTHER_TOPIC_ARN, type: 'Notification' })
    );
  });

  it.each([
    ['TopicArn なし', undefined],
    ['TopicArn が文字列でない', 12345],
    ['別環境のトピック', ALLOWED_TOPIC_ARN.replace(/-dev$/, '-prod')],
    ['許可トピックを前方一致で含むトピック', `${ALLOWED_TOPIC_ARN}-extra`],
  ])('%s の場合は 403 を返し、何も実行しない', async (_label, topicArn) => {
    mockValidateSnsMessage.mockResolvedValue(subscriptionConfirmation(topicArn));

    const response = await POST(createRequest({}));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendAll).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it.each([
    ['未設定', undefined],
    ['空文字', ''],
  ])('環境変数が%sの場合は 403 を返し、fetch も sendAll も呼ばない', async (_label, value) => {
    if (value === undefined) {
      delete process.env.SNS_ALLOWED_TOPIC_ARN;
    } else {
      process.env.SNS_ALLOWED_TOPIC_ARN = value;
    }

    for (const message of [
      subscriptionConfirmation(ALLOWED_TOPIC_ARN),
      notification(ALLOWED_TOPIC_ARN),
    ]) {
      mockValidateSnsMessage.mockResolvedValueOnce(message);

      const response = await POST(createRequest({}));

      expect(response.status).toBe(403);
    }

    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendAll).not.toHaveBeenCalled();
    expect(mockCreateRepository).not.toHaveBeenCalled();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('SNS_ALLOWED_TOPIC_ARN'),
      expect.objectContaining({ topicArn: ALLOWED_TOPIC_ARN })
    );
  });

  it('署名検証に失敗した場合は 401 を返す', async () => {
    mockValidateSnsMessage.mockRejectedValue(new Error('署名不正'));

    const response = await POST(createRequest({}));

    expect(response.status).toBe(401);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sendAll).not.toHaveBeenCalled();
  });

  it('不正な JSON の場合は 400 を返す', async () => {
    // jest のサンドボックスと Request 実装で SyntaxError の realm が異なり instanceof が成立しないため、
    // テスト側の realm で生成した SyntaxError を json() から返す
    const request = {
      json: jest.fn().mockRejectedValue(new SyntaxError('不正な JSON')),
    } as unknown as Request;

    const response = await POST(request);

    expect(response.status).toBe(400);
    expect(mockValidateSnsMessage).not.toHaveBeenCalled();
  });
});
