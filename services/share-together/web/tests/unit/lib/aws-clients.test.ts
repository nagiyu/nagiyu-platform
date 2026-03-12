import { clearAwsClientsCache, getAwsClients, getDocClient } from '@/lib/aws-clients';

describe('aws-clients', () => {
  afterEach(() => {
    clearAwsClientsCache();
    delete process.env.USE_IN_MEMORY_DB;
  });

  it('DynamoDBDocumentClient をシングルトンで返す', () => {
    const first = getAwsClients();
    const second = getAwsClients();

    expect(first.docClient).toBe(second.docClient);
  });

  it('キャッシュクリア後は新しいクライアントを生成する', () => {
    const first = getAwsClients();
    clearAwsClientsCache();
    const second = getAwsClients();

    expect(first.docClient).not.toBe(second.docClient);
  });
});

describe('getDocClient', () => {
  afterEach(() => {
    clearAwsClientsCache();
    delete process.env.USE_IN_MEMORY_DB;
  });

  it('USE_IN_MEMORY_DB が true のとき undefined を返す', () => {
    process.env.USE_IN_MEMORY_DB = 'true';

    expect(getDocClient()).toBeUndefined();
  });

  it('USE_IN_MEMORY_DB が false のとき DynamoDBDocumentClient を返す', () => {
    process.env.USE_IN_MEMORY_DB = 'false';

    expect(getDocClient()).toBeDefined();
  });

  it('USE_IN_MEMORY_DB が未設定のとき DynamoDBDocumentClient を返す', () => {
    delete process.env.USE_IN_MEMORY_DB;

    expect(getDocClient()).toBeDefined();
  });
});
