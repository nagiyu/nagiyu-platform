import type { ScheduledEvent } from '../../../src/handlers/study.js';

jest.mock('@nagiyu/aws', () => ({
  getDynamoDBDocumentClient: jest.fn(() => ({})),
  getTableName: jest.fn(() => 'test-table'),
  reportErrorEvent: jest.fn().mockResolvedValue(null),
}));

jest.mock('@nagiyu/livetalk-core', () => ({
  DynamoDBLifecycleRepository: jest.fn(),
  DynamoDBInterestRepository: jest.fn(),
  DynamoDBKnowledgeRepository: jest.fn(),
  DynamoDBProfileRepository: jest.fn(),
  OpenAIResearchClient: jest.fn(),
  defaultUlidFactory: jest.fn(),
}));

const mockStudyAll = jest.fn();
jest.mock('../../../src/usecases/study.usecase.js', () => ({
  studyAllUsers: (...args: unknown[]) => mockStudyAll(...args),
}));

const makeEvent = (overrides: Partial<ScheduledEvent> = {}): ScheduledEvent => ({
  version: '0',
  id: 'event-001',
  'detail-type': 'Scheduled Event',
  source: 'aws.events',
  account: '123456789012',
  time: '2026-06-01T00:00:00Z',
  region: 'us-east-1',
  resources: [],
  detail: {},
  ...overrides,
});

describe('study handler', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('正常処理時に 200 を返す', async () => {
    mockStudyAll.mockResolvedValue({
      studiedUsers: 2,
      skippedUsers: 3,
      failedUsers: 0,
      failedUserIds: [],
    });

    const { handler } = await import('../../../src/handlers/study.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(200);
    const body = JSON.parse(response.body);
    expect(body.studiedUsers).toBe(2);
    expect(body.skippedUsers).toBe(3);
  });

  it('例外発生時に 500 を返す', async () => {
    mockStudyAll.mockRejectedValue(new Error('DynamoDB 障害'));

    const { handler } = await import('../../../src/handlers/study.js');
    const response = await handler(makeEvent());

    expect(response.statusCode).toBe(500);
    const body = JSON.parse(response.body);
    expect(body.error).toContain('DynamoDB 障害');
  });
});
