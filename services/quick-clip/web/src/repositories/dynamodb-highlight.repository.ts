import { DynamoDBHighlightRepository, type HighlightRepository } from '@nagiyu/quick-clip-core';
import { getDynamoDBDocumentClient, getTableName } from '@/lib/server/aws';

let cachedRepository: HighlightRepository | null = null;

export const getHighlightRepository = (): HighlightRepository => {
  if (!cachedRepository) {
    cachedRepository = new DynamoDBHighlightRepository(getDynamoDBDocumentClient(), getTableName());
  }
  return cachedRepository;
};
