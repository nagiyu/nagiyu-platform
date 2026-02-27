import { clearAwsClientsCache, getAwsClients } from '@/lib/aws-clients';

describe('aws-clients', () => {
  afterEach(() => {
    clearAwsClientsCache();
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
