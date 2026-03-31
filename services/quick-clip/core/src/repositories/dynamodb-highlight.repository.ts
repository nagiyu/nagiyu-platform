import {
  GetCommand,
  QueryCommand,
  UpdateCommand,
  type DynamoDBDocumentClient,
} from '@aws-sdk/lib-dynamodb';
import type { ClipStatus, Highlight, HighlightStatus, UpdateHighlightInput } from '../types.js';
import type { HighlightRepository } from './highlight.repository.interface.js';
import { DOMAIN_ERROR_MESSAGES } from '../libs/domain-error-messages.js';

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
  clipStatus: ClipStatus;
};

export class DynamoDBHighlightRepository implements HighlightRepository {
  private readonly docClient: DynamoDBDocumentClient;
  private readonly tableName: string;

  constructor(docClient: DynamoDBDocumentClient, tableName: string) {
    this.docClient = docClient;
    this.tableName = tableName;
  }

  public async getByJobId(jobId: string): Promise<Highlight[]> {
    const response = await this.docClient.send(
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
    const key = this.buildKeys(jobId, highlightId);
    const response = await this.docClient.send(
      new GetCommand({
        TableName: this.tableName,
        Key: key,
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
    const key = this.buildKeys(jobId, highlightId);
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
        throw new Error(DOMAIN_ERROR_MESSAGES.HIGHLIGHT_NOT_FOUND);
      }
      return current;
    }

    await this.docClient.send(
      new UpdateCommand({
        TableName: this.tableName,
        Key: key,
        UpdateExpression: `SET ${expressions.join(', ')}`,
        ExpressionAttributeNames: names,
        ExpressionAttributeValues: values,
      })
    );

    const updated = await this.getById(jobId, highlightId);
    if (!updated) {
      throw new Error(DOMAIN_ERROR_MESSAGES.HIGHLIGHT_UPDATED_FETCH_FAILED);
    }
    return updated;
  }

  public async createMany(highlights: Highlight[]): Promise<void> {
    // 既存データとの差分適用を許容するため、Phase 4 では UpdateCommand で upsert として扱う。
    await Promise.all(
      highlights.map((highlight) =>
        this.docClient.send(
          new UpdateCommand({
            TableName: this.tableName,
            Key: this.buildKeys(highlight.jobId, highlight.highlightId),
            UpdateExpression:
              'SET #type = :type, #highlightId = :highlightId, #jobId = :jobId, #order = :order, #startSec = :startSec, #endSec = :endSec, #status = :status, #clipStatus = :clipStatus',
            ExpressionAttributeNames: {
              '#type': 'Type',
              '#highlightId': 'highlightId',
              '#jobId': 'jobId',
              '#order': 'order',
              '#startSec': 'startSec',
              '#endSec': 'endSec',
              '#status': 'status',
              '#clipStatus': 'clipStatus',
            },
            ExpressionAttributeValues: {
              ':type': 'HIGHLIGHT',
              ':highlightId': highlight.highlightId,
              ':jobId': highlight.jobId,
              ':order': highlight.order,
              ':startSec': highlight.startSec,
              ':endSec': highlight.endSec,
              ':status': highlight.status,
              ':clipStatus': highlight.clipStatus,
            },
          })
        )
      )
    );
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
      clipStatus: item.clipStatus,
    };
  }
}
