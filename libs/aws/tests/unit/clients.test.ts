import { clearAwsClientsCache, getAwsClients } from '../../src/clients';

describe('clients', () => {
  afterEach(() => {
    clearAwsClientsCache();
    delete process.env.AWS_REGION;
  });

  it('同一リージョンではクライアントを再利用する', () => {
    const first = getAwsClients('ap-northeast-1');
    const second = getAwsClients('ap-northeast-1');

    expect(first.docClient).toBe(second.docClient);
    expect(first.s3Client).toBe(second.s3Client);
    expect(first.batchClient).toBe(second.batchClient);
  });

  it('キャッシュクリア後は新しいクライアントを返す', () => {
    const first = getAwsClients('ap-northeast-1');
    clearAwsClientsCache();
    const second = getAwsClients('ap-northeast-1');

    expect(first.docClient).not.toBe(second.docClient);
    expect(first.s3Client).not.toBe(second.s3Client);
    expect(first.batchClient).not.toBe(second.batchClient);
  });
});
