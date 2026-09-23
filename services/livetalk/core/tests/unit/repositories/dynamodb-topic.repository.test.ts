import {
  DeleteCommand,
  GetCommand,
  PutCommand,
  QueryCommand,
  UpdateCommand,
} from '@aws-sdk/lib-dynamodb';
import { DatabaseError } from '@nagiyu/aws';
import { DynamoDBTopicRepository } from '../../../src/repositories/dynamodb-topic.repository.js';
import { OptimisticLockError } from '../../../src/repositories/optimistic-lock.error.js';

const TABLE = 'nagiyu-livetalk-test';
const FIXED_NOW = 1_700_000_000_000;

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

function makeRepo(handler: SendHandler, ulid = () => 'ULID-FIXED') {
  return new DynamoDBTopicRepository(makeClient(handler) as never, TABLE, ulid, () => FIXED_NOW);
}

const baseTopicInput = {
  UserID: 'u1',
  CharacterID: 'hiyori',
  TopicID: 'TOPIC-001',
  Subject: 'コーヒー',
  CanonicalSummary: 'コーヒーが好き',
  Category: '飲み物',
  Care: 3,
  Embedding: [0.1, 0.2],
};

const topicItem = {
  PK: 'USER#u1',
  SK: 'CHAR#hiyori#TOPIC#TOPIC-001#META',
  Type: 'Topic',
  UserID: 'u1',
  CharacterID: 'hiyori',
  TopicID: 'TOPIC-001',
  Subject: 'コーヒー',
  CanonicalSummary: 'コーヒーが好き',
  Category: '飲み物',
  Care: 3,
  Embedding: [0.1, 0.2],
  GSI3PK: 'hiyori#TOPICS#u1',
  GSI3SK: 3,
  CreatedAt: FIXED_NOW - 10_000,
  UpdatedAt: FIXED_NOW - 10_000,
};

describe('DynamoDBTopicRepository', () => {
  describe('putTopic', () => {
    it('新規作成は attribute_not_exists(PK) を条件に Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });

      const topic = await repo.putTopic(baseTopicInput);
      expect(topic.CreatedAt).toBe(FIXED_NOW);
      expect(topic.UpdatedAt).toBe(FIXED_NOW);
      expect(sent).toHaveLength(1);
      expect(sent[0]).toBeInstanceOf(PutCommand);
      const input = (sent[0] as PutCommand).input;
      expect(input.ConditionExpression).toBe('attribute_not_exists(PK)');
      expect(input.ExpressionAttributeValues).toBeUndefined();
      expect(input.Item?.GSI3SK).toBe(3);
    });

    it('更新（expectedUpdatedAt 指定）は既存 Get → CreatedAt 維持 → 条件付き Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        if (cmd instanceof GetCommand) {
          return { Item: topicItem };
        }
        return {};
      });

      const updated = await repo.putTopic(
        { ...baseTopicInput, Care: 8 },
        { expectedUpdatedAt: topicItem.UpdatedAt }
      );

      expect(updated.CreatedAt).toBe(topicItem.CreatedAt);
      expect(updated.UpdatedAt).toBe(FIXED_NOW);
      expect(sent[0]).toBeInstanceOf(GetCommand);
      expect(sent[1]).toBeInstanceOf(PutCommand);
      const putInput = (sent[1] as PutCommand).input;
      expect(putInput.ConditionExpression).toBe('UpdatedAt = :expectedUpdatedAt');
      expect(putInput.ExpressionAttributeValues).toEqual({
        ':expectedUpdatedAt': topicItem.UpdatedAt,
      });
    });

    it('ConditionalCheckFailedException は OptimisticLockError に変換する（error.name を保持）', async () => {
      const error = Object.assign(new Error('conflict'), {
        name: 'ConditionalCheckFailedException',
      });
      const repo = makeRepo(async () => {
        throw error;
      });

      await expect(repo.putTopic(baseTopicInput)).rejects.toBeInstanceOf(OptimisticLockError);
      await expect(repo.putTopic(baseTopicInput)).rejects.toMatchObject({
        name: 'OptimisticLockError',
      });
    });

    it('その他のエラーは DatabaseError でラップする', async () => {
      const repo = makeRepo(async () => {
        throw new Error('DB down');
      });
      await expect(repo.putTopic(baseTopicInput)).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('getTopic', () => {
    it('GetCommand を送り、見つからなければ null', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Item: undefined };
      });
      const result = await repo.getTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
      });
      expect(result).toBeNull();
      expect(sent[0]).toBeInstanceOf(GetCommand);
    });

    it('Item があればエンティティを返す', async () => {
      const repo = makeRepo(async () => ({ Item: topicItem }));
      const result = await repo.getTopic({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
      });
      expect(result?.Subject).toBe('コーヒー');
    });

    it('DynamoDB エラーは DatabaseError でラップ', async () => {
      const repo = makeRepo(async () => {
        throw new Error('timeout');
      });
      await expect(
        repo.getTopic({ userId: 'u1', characterId: 'hiyori', topicId: 'x' })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('getTopicBundle', () => {
    it('begins_with で 1 Query し、Type で振り分ける', async () => {
      const selfFactItem = {
        PK: 'USER#u1',
        SK: 'CHAR#hiyori#TOPIC#TOPIC-001#SELF#F1',
        Type: 'SelfFact',
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        FactID: 'F1',
        Text: 'self fact',
        Provenance: '',
        CreatedAt: FIXED_NOW,
      };
      const webFactItem = {
        PK: 'USER#u1',
        SK: 'CHAR#hiyori#TOPIC#TOPIC-001#WEB#F2',
        Type: 'WebFact',
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        FactID: 'F2',
        Text: 'web fact',
        SourceUrls: [],
        Volatility: 'stable',
        ObservedAt: FIXED_NOW,
        CreatedAt: FIXED_NOW,
      };

      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [topicItem, selfFactItem, webFactItem] };
      });

      const bundle = await repo.getTopicBundle({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
      });

      expect(sent[0]).toBeInstanceOf(QueryCommand);
      const input = (sent[0] as QueryCommand).input;
      expect(input.KeyConditionExpression).toContain('begins_with');
      expect(input.ExpressionAttributeValues?.[':prefix']).toBe('CHAR#hiyori#TOPIC#TOPIC-001#');

      expect(bundle.topic?.TopicID).toBe('TOPIC-001');
      expect(bundle.selfFacts).toHaveLength(1);
      expect(bundle.webFacts).toHaveLength(1);
    });

    it('ページネーション: LastEvaluatedKey があれば再クエリする', async () => {
      let call = 0;
      const repo = makeRepo(async () => {
        call++;
        if (call === 1) return { Items: [topicItem], LastEvaluatedKey: { PK: 'x' } };
        return { Items: [] };
      });
      const bundle = await repo.getTopicBundle({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
      });
      expect(call).toBe(2);
      expect(bundle.topic?.TopicID).toBe('TOPIC-001');
    });

    it('Topic が無い場合 topic は null', async () => {
      const repo = makeRepo(async () => ({ Items: [] }));
      const bundle = await repo.getTopicBundle({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'missing',
      });
      expect(bundle.topic).toBeNull();
    });

    it('DynamoDB エラーは DatabaseError でラップ', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });
      await expect(
        repo.getTopicBundle({ userId: 'u1', characterId: 'hiyori', topicId: 'x' })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('listTopicHeaders', () => {
    it('GSI3 を ScanIndexForward=true で Query する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [topicItem] };
      });
      const result = await repo.listTopicHeaders('u1', 'hiyori');
      expect(sent[0]).toBeInstanceOf(QueryCommand);
      const input = (sent[0] as QueryCommand).input;
      expect(input.IndexName).toBe('GSI3');
      expect(input.ScanIndexForward).toBe(true);
      expect(input.ExpressionAttributeValues?.[':pk']).toBe('hiyori#TOPICS#u1');
      expect(result).toHaveLength(1);
    });

    it('ページネーション: LastEvaluatedKey があれば再クエリする', async () => {
      let call = 0;
      const repo = makeRepo(async () => {
        call++;
        if (call === 1) return { Items: [topicItem], LastEvaluatedKey: { PK: 'x' } };
        return { Items: [] };
      });
      const result = await repo.listTopicHeaders('u1', 'hiyori');
      expect(call).toBe(2);
      expect(result).toHaveLength(1);
    });

    it('DynamoDB エラーは DatabaseError でラップ', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });
      await expect(repo.listTopicHeaders('u1', 'hiyori')).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('listTopicHeadersByCareDesc', () => {
    it('GSI3 を ScanIndexForward=false + Limit で Query する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [topicItem] };
      });
      const result = await repo.listTopicHeadersByCareDesc('u1', 'hiyori', 5);
      const input = (sent[0] as QueryCommand).input;
      expect(input.ScanIndexForward).toBe(false);
      expect(input.Limit).toBe(5);
      expect(result).toHaveLength(1);
    });

    it('limit に到達したら以降のページを取得せず打ち切る', async () => {
      let call = 0;
      const repo = makeRepo(async () => {
        call++;
        return {
          Items: [
            { ...topicItem, TopicID: 'A' },
            { ...topicItem, TopicID: 'B' },
          ],
          LastEvaluatedKey: { PK: 'x' },
        };
      });
      const result = await repo.listTopicHeadersByCareDesc('u1', 'hiyori', 1);
      expect(call).toBe(1);
      expect(result).toHaveLength(1);
    });
  });

  describe('SELF fact', () => {
    it('putSelfFact は FactID 未指定なら ULID を採番して Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const fact = await repo.putSelfFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'fact',
        Provenance: '',
      });
      expect(fact.FactID).toBe('ULID-FIXED');
      expect(sent[0]).toBeInstanceOf(PutCommand);
      expect((sent[0] as PutCommand).input.Item?.SK).toBe(
        'CHAR#hiyori#TOPIC#TOPIC-001#SELF#ULID-FIXED'
      );
    });

    it('listSelfFacts は begins_with で Query する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [] };
      });
      await repo.listSelfFacts('u1', 'hiyori', 'TOPIC-001');
      const input = (sent[0] as QueryCommand).input;
      expect(input.ExpressionAttributeValues?.[':prefix']).toBe(
        'CHAR#hiyori#TOPIC#TOPIC-001#SELF#'
      );
    });

    it('deleteSelfFact は DeleteCommand を送る', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      await repo.deleteSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        factId: 'F1',
      });
      expect(sent[0]).toBeInstanceOf(DeleteCommand);
      expect((sent[0] as DeleteCommand).input.Key).toEqual({
        PK: 'USER#u1',
        SK: 'CHAR#hiyori#TOPIC#TOPIC-001#SELF#F1',
      });
    });

    it('putSelfFact / listSelfFacts / deleteSelfFact のエラーは DatabaseError でラップ', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });
      await expect(
        repo.putSelfFact({
          UserID: 'u1',
          CharacterID: 'hiyori',
          TopicID: 'TOPIC-001',
          Text: 'x',
          Provenance: '',
        })
      ).rejects.toBeInstanceOf(DatabaseError);
      await expect(repo.listSelfFacts('u1', 'hiyori', 'TOPIC-001')).rejects.toBeInstanceOf(
        DatabaseError
      );
      await expect(
        repo.deleteSelfFact({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: 'TOPIC-001',
          factId: 'F1',
        })
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('WEB fact', () => {
    it('putWebFact は FactID 未指定なら ULID を採番して Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const fact = await repo.putWebFact({
        UserID: 'u1',
        CharacterID: 'hiyori',
        TopicID: 'TOPIC-001',
        Text: 'web fact',
        SourceUrls: [],
        Volatility: 'low',
        ObservedAt: FIXED_NOW,
      });
      expect(fact.FactID).toBe('ULID-FIXED');
      expect(sent[0]).toBeInstanceOf(PutCommand);
    });

    it('listWebFacts は begins_with で Query する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [] };
      });
      await repo.listWebFacts('u1', 'hiyori', 'TOPIC-001');
      const input = (sent[0] as QueryCommand).input;
      expect(input.ExpressionAttributeValues?.[':prefix']).toBe('CHAR#hiyori#TOPIC#TOPIC-001#WEB#');
    });

    it('putWebFact / listWebFacts のエラーは DatabaseError でラップ', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });
      await expect(
        repo.putWebFact({
          UserID: 'u1',
          CharacterID: 'hiyori',
          TopicID: 'TOPIC-001',
          Text: 'x',
          SourceUrls: [],
          Volatility: 'stable',
          ObservedAt: FIXED_NOW,
        })
      ).rejects.toBeInstanceOf(DatabaseError);
      await expect(repo.listWebFacts('u1', 'hiyori', 'TOPIC-001')).rejects.toBeInstanceOf(
        DatabaseError
      );
    });
  });

  describe('listStaleWebFacts（GSI4/GSI-STALE の窓走査）', () => {
    const staleFactItem = {
      PK: 'USER#u1',
      SK: 'CHAR#hiyori#TOPIC#TOPIC-001#WEB#F1',
      Type: 'WebFact',
      UserID: 'u1',
      CharacterID: 'hiyori',
      TopicID: 'TOPIC-001',
      FactID: 'F1',
      Text: '鮮度切れの fact',
      SourceUrls: [],
      Volatility: 'high',
      ObservedAt: FIXED_NOW - 100_000,
      NextReview: FIXED_NOW - 1000,
      GSI4PK: 'hiyori#STALE#u1',
      GSI4SK: FIXED_NOW - 1000,
      CreatedAt: FIXED_NOW - 100_000,
      UpdatedAt: FIXED_NOW - 100_000,
    };

    it('GSI4 を GSI4SK<=now・ScanIndexForward=true で Query する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [staleFactItem] };
      });

      const result = await repo.listStaleWebFacts('u1', 'hiyori', FIXED_NOW, 10);

      expect(sent[0]).toBeInstanceOf(QueryCommand);
      const input = (sent[0] as QueryCommand).input;
      expect(input.IndexName).toBe('GSI4');
      expect(input.ExpressionAttributeValues?.[':pk']).toBe('hiyori#STALE#u1');
      expect(input.ExpressionAttributeValues?.[':now']).toBe(FIXED_NOW);
      expect(input.ScanIndexForward).toBe(true);
      expect(result).toHaveLength(1);
      expect(result[0].FactID).toBe('F1');
    });

    it('limit に到達したら以降のページを取得せず打ち切る', async () => {
      let call = 0;
      const repo = makeRepo(async () => {
        call++;
        return {
          Items: [
            { ...staleFactItem, FactID: 'F1' },
            { ...staleFactItem, FactID: 'F2' },
          ],
          LastEvaluatedKey: { PK: 'x' },
        };
      });
      const result = await repo.listStaleWebFacts('u1', 'hiyori', FIXED_NOW, 1);
      expect(call).toBe(1);
      expect(result).toHaveLength(1);
    });

    it('エラーは DatabaseError でラップする', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });
      await expect(repo.listStaleWebFacts('u1', 'hiyori', FIXED_NOW, 10)).rejects.toBeInstanceOf(
        DatabaseError
      );
    });
  });

  describe('updateWebFactNextReview', () => {
    it('NextReview と GSI4PK/GSI4SK を UpdateCommand で更新する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });

      await repo.updateWebFactNextReview(
        { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: 'F1' },
        FIXED_NOW + 100_000
      );

      expect(sent[0]).toBeInstanceOf(UpdateCommand);
      const input = (sent[0] as UpdateCommand).input;
      expect(input.Key).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#TOPIC#TOPIC-001#WEB#F1' });
      expect(input.ExpressionAttributeValues?.[':nextReview']).toBe(FIXED_NOW + 100_000);
      expect(input.ExpressionAttributeValues?.[':gsi4pk']).toBe('hiyori#STALE#u1');
    });

    it('対象が存在しない場合（ConditionalCheckFailedException）は例外を投げず no-op', async () => {
      const repo = makeRepo(async () => {
        const err = new Error('conditional check failed');
        err.name = 'ConditionalCheckFailedException';
        throw err;
      });

      await expect(
        repo.updateWebFactNextReview(
          { userId: 'u1', characterId: 'hiyori', topicId: 'missing', factId: 'missing' },
          FIXED_NOW + 1000
        )
      ).resolves.toBeUndefined();
    });

    it('その他のエラーは DatabaseError でラップする', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });
      await expect(
        repo.updateWebFactNextReview(
          { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: 'F1' },
          FIXED_NOW + 1000
        )
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
