import { DynamoDBJobRepository, type JobRepository } from '@nagiyu/quick-clip-core';
import { getDynamoDBDocumentClient, getTableName } from '@/lib/server/aws';

let cachedRepository: JobRepository | null = null;

export const getJobRepository = (): JobRepository => {
  if (!cachedRepository) {
    cachedRepository = new DynamoDBJobRepository(getDynamoDBDocumentClient(), getTableName());
  }
  return cachedRepository;
};
