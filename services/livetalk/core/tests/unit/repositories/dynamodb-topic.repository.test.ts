import { GetCommand, PutCommand, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { DatabaseError, EntityNotFoundError, OptimisticLockError } from '@nagiyu/aws';
import { logger } from '@nagiyu/common';
import { DynamoDBTopicRepository } from '../../../src/repositories/dynamodb-topic.repository.js';

const TABLE = 'nagiyu-livetalk-test';
const FIXED_NOW = 1_700_000_000_000;

type SendHandler = (command: unknown) => Promise<unknown>;
const makeClient = (handler: SendHandler) => ({ send: handler });

function makeRepo(handler: SendHandler, ulid = () => 'ULID-FIXED') {
  return new DynamoDBTopicRepository(makeClient(handler) as never, TABLE, ulid, () => FIXED_NOW);
}

/** 条件失敗の例外。旧 Item が付くかどうかで不在と不一致が分かれる */
function conditionalFailure(withOldItem: boolean) {
  return Object.assign(new Error('conditional check failed'), {
    name: 'ConditionalCheckFailedException',
    ...(withOldItem && { Item: { PK: { S: 'USER#u1' } } }),
  });
}

const baseTopicInput = {
  userId: 'u1',
  characterId: 'hiyori',
  topicId: 'TOPIC-001',
  subject: 'コーヒー',
  canonicalSummary: 'コーヒーが好き',
  category: '飲み物',
  care: 3,
  embedding: [0.1, 0.2],
};

const topicKey = { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001' };

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

const webFactKey = { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: 'F1' };

describe('DynamoDBTopicRepository', () => {
  describe('putTopic', () => {
    it('新規作成は存在しないことを条件に Put し、GSI3 属性を付ける', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });

      const topic = await repo.putTopic(baseTopicInput);

      expect(topic.createdAt).toBe(FIXED_NOW);
      expect(topic.updatedAt).toBe(FIXED_NOW);
      expect(sent).toHaveLength(1);
      const input = (sent[0] as PutCommand).input;
      expect(input.ConditionExpression).toBe('attribute_not_exists(#pk)');
      expect(input.Item?.GSI3PK).toBe('hiyori#TOPICS#u1');
      expect(input.Item?.GSI3SK).toBe(3);
    });

    it('新規作成の衝突は OptimisticLockError に揃える', async () => {
      const repo = makeRepo(async () => {
        throw conditionalFailure(false);
      });

      const promise = repo.putTopic(baseTopicInput);
      await expect(promise).rejects.toBeInstanceOf(OptimisticLockError);
      await expect(promise).rejects.toThrow('Topic=');
    });

    it('更新は既存を読んで createdAt を維持し、expectedUpdatedAt を条件に Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return cmd instanceof GetCommand ? { Item: topicItem } : {};
      });

      const updated = await repo.putTopic(
        { ...baseTopicInput, care: 8 },
        { expectedUpdatedAt: topicItem.UpdatedAt }
      );

      expect(updated.createdAt).toBe(topicItem.CreatedAt);
      expect(updated.updatedAt).toBe(FIXED_NOW);
      expect(sent[0]).toBeInstanceOf(GetCommand);
      const putInput = (sent[1] as PutCommand).input;
      expect(putInput.ConditionExpression).toContain('#updatedAt = :expectedUpdatedAt');
      expect(putInput.ExpressionAttributeValues).toEqual({
        ':expectedUpdatedAt': topicItem.UpdatedAt,
      });
      expect(putInput.Item?.GSI3SK).toBe(8);
    });

    it('更新で UpdatedAt が一致しなければ OptimisticLockError を投げる', async () => {
      const repo = makeRepo(async (cmd) => {
        if (cmd instanceof GetCommand) return { Item: topicItem };
        throw conditionalFailure(true);
      });

      await expect(repo.putTopic(baseTopicInput, { expectedUpdatedAt: 1 })).rejects.toBeInstanceOf(
        OptimisticLockError
      );
    });

    it('更新で Topic が存在しなければ EntityNotFoundError を投げる', async () => {
      const repo = makeRepo(async (cmd) => {
        if (cmd instanceof GetCommand) return {};
        throw conditionalFailure(false);
      });

      await expect(repo.putTopic(baseTopicInput, { expectedUpdatedAt: 1 })).rejects.toBeInstanceOf(
        EntityNotFoundError
      );
    });

    it('その他のエラーは DatabaseError でラップする', async () => {
      const repo = makeRepo(async () => {
        throw new Error('DB down');
      });

      await expect(repo.putTopic(baseTopicInput)).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('getTopic', () => {
    it('Item がなければ null、あれば camelCase のエンティティを返す', async () => {
      const missing = makeRepo(async () => ({}));
      expect(await missing.getTopic(topicKey)).toBeNull();

      const found = makeRepo(async () => ({ Item: topicItem }));
      expect((await found.getTopic(topicKey))?.subject).toBe('コーヒー');
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
        UpdatedAt: FIXED_NOW,
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
        UpdatedAt: FIXED_NOW,
      };
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [topicItem, selfFactItem, webFactItem] };
      });

      const bundle = await repo.getTopicBundle(topicKey);

      expect(sent).toHaveLength(1);
      const input = (sent[0] as QueryCommand).input;
      expect(input.KeyConditionExpression).toContain('begins_with');
      expect(input.ExpressionAttributeValues?.[':prefix']).toBe('CHAR#hiyori#TOPIC#TOPIC-001#');
      expect(bundle.topic?.topicId).toBe('TOPIC-001');
      expect(bundle.selfFacts.map((f) => f.factId)).toEqual(['F1']);
      expect(bundle.webFacts.map((f) => f.factId)).toEqual(['F2']);
    });

    it('LastEvaluatedKey があれば続きを取得する', async () => {
      let call = 0;
      const repo = makeRepo(async () => {
        call++;
        return call === 1 ? { Items: [topicItem], LastEvaluatedKey: { PK: 'x' } } : { Items: [] };
      });

      const bundle = await repo.getTopicBundle(topicKey);

      expect(call).toBe(2);
      expect(bundle.topic?.topicId).toBe('TOPIC-001');
    });

    it('Topic がなければ topic は null', async () => {
      const repo = makeRepo(async () => ({ Items: [] }));

      expect((await repo.getTopicBundle(topicKey)).topic).toBeNull();
    });

    it('エラーは DatabaseError でラップする', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });

      await expect(repo.getTopicBundle(topicKey)).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('listTopicHeaders / listTopicHeadersByCareDesc', () => {
    it('GSI3 を昇順で Query し、LastEvaluatedKey があれば続きを取得する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return sent.length === 1
          ? { Items: [topicItem], LastEvaluatedKey: { PK: 'x' } }
          : { Items: [] };
      });

      const result = await repo.listTopicHeaders('u1', 'hiyori');

      const input = (sent[0] as QueryCommand).input;
      expect(input.IndexName).toBe('GSI3');
      expect(input.ScanIndexForward).toBe(true);
      expect(input.ExpressionAttributeValues?.[':pk']).toBe('hiyori#TOPICS#u1');
      expect(sent).toHaveLength(2);
      expect(result).toHaveLength(1);
    });

    it('care 降順は ScanIndexForward=false と Limit で Query する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [topicItem] };
      });

      await repo.listTopicHeadersByCareDesc('u1', 'hiyori', 5);

      const input = (sent[0] as QueryCommand).input;
      expect(input.ScanIndexForward).toBe(false);
      expect(input.Limit).toBe(5);
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
      expect(result.map((t) => t.topicId)).toEqual(['A']);
    });

    it('エラーは DatabaseError でラップする', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });

      await expect(repo.listTopicHeaders('u1', 'hiyori')).rejects.toBeInstanceOf(DatabaseError);
    });
  });

  describe('SELF fact', () => {
    it('putSelfFact は factId 未指定なら ULID を採番した SK で Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });

      const fact = await repo.putSelfFact({
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'fact',
        provenance: '',
      });

      expect(fact.factId).toBe('ULID-FIXED');
      expect((sent[0] as PutCommand).input.Item?.SK).toBe(
        'CHAR#hiyori#TOPIC#TOPIC-001#SELF#ULID-FIXED'
      );
    });

    it('listSelfFacts は SELF の SK プレフィックスで Query する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [] };
      });

      await repo.listSelfFacts('u1', 'hiyori', 'TOPIC-001');

      expect((sent[0] as QueryCommand).input.ExpressionAttributeValues?.[':prefix']).toBe(
        'CHAR#hiyori#TOPIC#TOPIC-001#SELF#'
      );
    });

    it('deleteSelfFact は対象がなければ EntityNotFoundError を投げる', async () => {
      const repo = makeRepo(async () => {
        throw conditionalFailure(false);
      });

      await expect(
        repo.deleteSelfFact({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: 'TOPIC-001',
          factId: 'F1',
        })
      ).rejects.toBeInstanceOf(EntityNotFoundError);
    });

    it('listSelfFacts のエラーは DatabaseError でラップする', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });

      await expect(repo.listSelfFacts('u1', 'hiyori', 'TOPIC-001')).rejects.toBeInstanceOf(
        DatabaseError
      );
    });
  });

  describe('WEB fact', () => {
    it('putWebFact は nextReview があるときだけ GSI4 属性を付けて Put する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {};
      });
      const base = {
        userId: 'u1',
        characterId: 'hiyori',
        topicId: 'TOPIC-001',
        text: 'web fact',
        sourceUrls: [],
        volatility: 'low' as const,
        observedAt: FIXED_NOW,
      };

      const fact = await repo.putWebFact({ ...base, nextReview: FIXED_NOW + 1 });
      await repo.putWebFact(base);

      expect(fact.factId).toBe('ULID-FIXED');
      const withReview = (sent[0] as PutCommand).input.Item;
      expect(withReview?.GSI4PK).toBe('hiyori#STALE#u1');
      expect(withReview?.GSI4SK).toBe(FIXED_NOW + 1);
      expect((sent[1] as PutCommand).input.Item).not.toHaveProperty('GSI4PK');
    });

    it('listWebFacts は WEB の SK プレフィックスで Query する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [] };
      });

      await repo.listWebFacts('u1', 'hiyori', 'TOPIC-001');

      expect((sent[0] as QueryCommand).input.ExpressionAttributeValues?.[':prefix']).toBe(
        'CHAR#hiyori#TOPIC#TOPIC-001#WEB#'
      );
    });
  });

  describe('listStaleWebFacts（GSI4 の窓走査）', () => {
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
      GSI4PK: 'hiyori#STALE#u1',
      GSI4SK: FIXED_NOW - 1000,
      CreatedAt: FIXED_NOW - 100_000,
    };

    it('GSI4 を GSI4SK<=now の昇順で Query し、GSI4SK から nextReview を復元する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return { Items: [staleFactItem] };
      });

      const result = await repo.listStaleWebFacts('u1', 'hiyori', FIXED_NOW, 10);

      const input = (sent[0] as QueryCommand).input;
      expect(input.IndexName).toBe('GSI4');
      expect(input.ExpressionAttributeValues?.[':pk']).toBe('hiyori#STALE#u1');
      expect(input.ExpressionAttributeValues?.[':now']).toBe(FIXED_NOW);
      expect(input.ScanIndexForward).toBe(true);
      expect(result[0].factId).toBe('F1');
      expect(result[0].nextReview).toBe(FIXED_NOW - 1000);
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
    it('nextReview と GSI4PK/GSI4SK だけを UpdateCommand で更新する', async () => {
      const sent: unknown[] = [];
      const repo = makeRepo(async (cmd) => {
        sent.push(cmd);
        return {
          Attributes: {
            PK: 'USER#u1',
            SK: 'CHAR#hiyori#TOPIC#TOPIC-001#WEB#F1',
            UserID: 'u1',
            CharacterID: 'hiyori',
            TopicID: 'TOPIC-001',
            FactID: 'F1',
            Text: 't',
            SourceUrls: [],
            Volatility: 'high',
            ObservedAt: FIXED_NOW,
            CreatedAt: FIXED_NOW,
          },
        };
      });

      await repo.updateWebFactNextReview(webFactKey, FIXED_NOW + 100_000);

      const input = (sent[0] as UpdateCommand).input;
      expect(input.Key).toEqual({ PK: 'USER#u1', SK: 'CHAR#hiyori#TOPIC#TOPIC-001#WEB#F1' });
      const values = Object.values(input.ExpressionAttributeValues ?? {});
      expect(values).toEqual(
        expect.arrayContaining([FIXED_NOW + 100_000, 'hiyori#STALE#u1', FIXED_NOW])
      );
    });

    it('対象が存在しなければ warn を出して何もしない', async () => {
      const warn = jest.spyOn(logger, 'warn').mockImplementation(() => undefined);
      const repo = makeRepo(async () => {
        throw conditionalFailure(false);
      });

      await expect(
        repo.updateWebFactNextReview(webFactKey, FIXED_NOW + 1000)
      ).resolves.toBeUndefined();
      expect(warn).toHaveBeenCalledTimes(1);
      warn.mockRestore();
    });

    it('その他のエラーは DatabaseError でラップする', async () => {
      const repo = makeRepo(async () => {
        throw new Error('boom');
      });

      await expect(
        repo.updateWebFactNextReview(webFactKey, FIXED_NOW + 1000)
      ).rejects.toBeInstanceOf(DatabaseError);
    });
  });
});
