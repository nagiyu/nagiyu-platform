import { GetCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { getDynamoDBDocumentClient, getTableName } from '@/lib/server/aws';
import type { HighlightRepository } from '@/types/repository';
import type { Highlight, HighlightStatus, UpdateHighlightInput } from '@/types/quick-clip';

let cachedRepository: HighlightRepository | null = null;

export const getHighlightRepository = (): HighlightRepository => {
  if (!cachedRepository) {
    cachedRepository = new DynamoDBHighlightRepository(getTableName());
  }
  return cachedRepository;
};

type HighlightItem = {
  PK: string;
  SK: string;
  Type: 'HIGHLIGHT';
  highlightId: string;
  jobId: string;
  order: number;
  startSec: number;
  endSec: number;
  status: HighlightStatus;
};

class DynamoDBHighlightRepository implements HighlightRepository {
  private readonly tableName: string;

  constructor(tableName: string) {
    this.tableName = tableName;
  }

  public async getByJobId(jobId: string): Promise<Highlight[]> {
    const response = await getDynamoDBDocumentClient().send(
      new QueryCommand({
        TableName: this.tableName,
        KeyConditionExpression: '#pk = :pk AND begins_with(#sk, :highlightPrefix)',
        ExpressionAttributeNames: {
          '#pk': 'PK',
          '#sk': 'SK',
        },
        ExpressionAttributeValues: {
          ':pk': `JOB#${jobId}`,
          ':highlightPrefix': 'HIGHLIGHT#',
        },
      })
    );

    return (response.Items ?? [])
      .map((item) => this.mapToEntity(item as HighlightItem))
      .sort((a, b) => a.order - b.order);
  }

  public async getById(jobId: string, highlightId: string): Promise<Highlight | null> {
    const response = await getDynamoDBDocumentClient().send(
      new GetCommand({
        TableName: this.tableName,
        Key: this.buildKeys(jobId, highlightId),
      })
    );

    if (!response.Item) {
      return null;
    }

    return this.mapToEntity(response.Item as HighlightItem);
  }

  public async update(
    jobId: string,
    highlightId: string,
    updates: UpdateHighlightInput
  ): Promise<Highlight> {
    const expressions: string[] = [];
    const names: Record<string, string> = {};
    const values: Record<string, number | string> = {};

    if (typeof updates.startSec === 'number') {
      expressions.push('#startSec = :startSec');
      names['#startSec'] = 'startSec';
      values[':startSec'] = updates.startSec;
    }
    if (typeof updates.endSec === 'number') {
      expressions.push('#endSec = :endSec');
      names['#endSec'] = 'endSec';
      values[':endSec'] = updates.endSec;
    }
    if (typeof updates.status === 'string') {
      expressions.push('#status = :status');
      names['#status'] = 'status';
      values[':status'] = updates.status;
    }

    if (expressions.length === 0) {
      const current = await this.getById(jobId, highlightId);
      if (!current) {
        throw new Error('見どころが見つかりません');
      }
      return current;
    }

    await getDynamoDBDocumentClient().send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: this.buildKeys(jobId, highlightId),
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );

    const updated = await this.getById(jobId, highlightId);
    if (!updated) {
      throw new Error('見どころが見つかりません');
    }
    return updated;
  }

  private buildKeys(jobId: string, highlightId: string): { PK: string; SK: string } {
    return {
      PK: `JOB#${jobId}`,
      SK: `HIGHLIGHT#${highlightId}`,
    };
  }

  private mapToEntity(item: HighlightItem): Highlight {
    return {
      highlightId: item.highlightId,
      jobId: item.jobId,
      order: item.order,
      startSec: item.startSec,
      endSec: item.endSec,
      status: item.status,
    };
  }
}
