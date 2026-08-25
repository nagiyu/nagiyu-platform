/**
 * TopicRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離（GSI3/GSI4射影・ソート順など）を機械的に検知する。
 * 各テストは決定的で単一の結末を持ち（実行時分岐で結末を変えない・自己スキップしない）、
 * 形骸化テストは書かない。
 */

import type { TopicRepository } from '../../src/repositories/topic.repository.interface.js';
import type { CreateTopicInput } from '../../src/entities/topic.entity.js';
import type { CreateWebFactInput } from '../../src/entities/web-fact.entity.js';

/**
 * 契約テストの対象実装が満たすべきフック
 */
export interface TopicRepositoryContractHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<TopicRepository>;
  /** 各テスト前にストア／テーブルをクリーンな状態に戻す */
  reset: () => Promise<void>;
  /** 全テスト終了後の後始末（テーブル削除等） */
  teardown?: () => Promise<void>;
}

function buildTopicInput(overrides: Partial<CreateTopicInput> = {}): CreateTopicInput {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'TOPIC-001',
    Subject: 'コーヒー',
    CanonicalSummary: 'コーヒーが好き',
    Category: '飲み物',
    Care: 3,
    Embedding: [0.1, 0.2],
    ...overrides,
  };
}

function buildWebFactInput(overrides: Partial<CreateWebFactInput> = {}): CreateWebFactInput {
  return {
    UserID: 'u1',
    CharacterID: 'hiyori',
    TopicID: 'TOPIC-001',
    Text: 'コーヒーの適量は1日3〜4杯まで',
    SourceUrls: ['https://example.com/coffee'],
    Volatility: 'medium',
    ObservedAt: 1_700_000_000_000,
    ...overrides,
  };
}

/**
 * TopicRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineTopicRepositoryContract(
  label: string,
  hooks: TopicRepositoryContractHooks
): void {
  describe(`TopicRepository 契約: ${label}`, () => {
    let repository: TopicRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    it('putTopic で保存した内容が getTopic で取得できる', async () => {
      const input = buildTopicInput();
      const created = await repository.putTopic(input);

      const fetched = await repository.getTopic({
        userId: input.UserID,
        characterId: input.CharacterID,
        topicId: input.TopicID,
      });

      expect(fetched).toEqual(created);
    });

    describe('listTopicHeaders（GSI3）', () => {
      it('指定ユーザー・キャラの Topic ヘッダのみを列挙する（SelfFact/WebFact・他ユーザーは含まない）', async () => {
        await repository.putTopic(buildTopicInput({ TopicID: 'TOPIC-A' }));
        await repository.putTopic(buildTopicInput({ TopicID: 'TOPIC-B' }));
        // 別ユーザー・別キャラの Topic は対象外
        await repository.putTopic(
          buildTopicInput({ UserID: 'other-user', TopicID: 'TOPIC-OTHER-USER' })
        );
        await repository.putTopic(
          buildTopicInput({ CharacterID: 'ageha', TopicID: 'TOPIC-OTHER-CHAR' })
        );
        // 同じ Topic 配下の SELF/WEB fact は META（Topic ヘッダ）ではないため対象外
        await repository.putSelfFact({
          UserID: 'u1',
          CharacterID: 'hiyori',
          TopicID: 'TOPIC-A',
          Text: 'ユーザーは猫を飼っている',
          Provenance: 'chat-001',
        });
        await repository.putWebFact(buildWebFactInput({ TopicID: 'TOPIC-A' }));

        const headers = await repository.listTopicHeaders('u1', 'hiyori');

        expect(headers.map((h) => h.TopicID).sort()).toEqual(['TOPIC-A', 'TOPIC-B']);
      });

      it('Topic が0件のとき空配列を返す', async () => {
        const headers = await repository.listTopicHeaders('u1', 'hiyori');
        expect(headers).toEqual([]);
      });

      it('RequestText/RequestedAt は getTopic（ベーステーブル読み）では取得できるが、listTopicHeaders（GSI3 の射影）には含まれない', async () => {
        // GSI3 の nonKeyAttributes は RequestText/RequestedAt を意図的に含めていない
        // （TopicMapper・infra/livetalk/lib/dynamodb-stack.ts のコメント参照）。
        // Topic ヘッダ列挙はベーステーブルではなく GSI3 経由で行われるため、
        // 依頼フック（RequestText/RequestedAt）はこの経路では取得できない、という契約を検証する。
        const input = buildTopicInput({
          TopicID: 'TOPIC-REQUEST',
          RequestText: '〇〇について調べて',
          RequestedAt: 1_700_000_050_000,
        });
        await repository.putTopic(input);

        const fetched = await repository.getTopic({
          userId: input.UserID,
          characterId: input.CharacterID,
          topicId: input.TopicID,
        });
        expect(fetched?.RequestText).toBe(input.RequestText);
        expect(fetched?.RequestedAt).toBe(input.RequestedAt);

        const headers = await repository.listTopicHeaders('u1', 'hiyori');
        const header = headers.find((h) => h.TopicID === 'TOPIC-REQUEST');

        expect(header).toBeDefined();
        expect(header?.RequestText).toBeUndefined();
        expect(header?.RequestedAt).toBeUndefined();
      });
    });

    describe('listTopicHeadersByCareDesc（GSI3）', () => {
      it('Care 降順で返し、limit で件数を絞る（数値順と辞書順で結果が変わる値で検証する）', async () => {
        // GSI3SK（Care）は NUMBER 型で、実DynamoDBは数値順にソートする。
        // 一方 InMemorySingleTableStore の内部ソートは String() 比較（辞書順）のため、
        // 桁数の異なる値（2 / 9 / 10）を混ぜることで両者の結果が食い違うようにしている
        // （数値降順: 10, 9, 2 / 辞書降順: "9", "2", "10"）。
        // 同じ桁数の値だけだと数値順=辞書順になり、退行を検知できない形骸化テストになる。
        await repository.putTopic(buildTopicInput({ TopicID: 'TOPIC-LOW', Care: 2 }));
        await repository.putTopic(buildTopicInput({ TopicID: 'TOPIC-HIGH', Care: 10 }));
        await repository.putTopic(buildTopicInput({ TopicID: 'TOPIC-MID', Care: 9 }));

        const result = await repository.listTopicHeadersByCareDesc('u1', 'hiyori', 2);

        // 数値降順なら TOPIC-HIGH(10), TOPIC-MID(9) が上位2件。
        // 辞書順（"9" > "2" > "10"）だと TOPIC-MID, TOPIC-LOW になり、この期待値とは一致しない。
        expect(result.map((t) => t.TopicID)).toEqual(['TOPIC-HIGH', 'TOPIC-MID']);
        expect(result.map((t) => t.Care)).toEqual([10, 9]);
      });
    });

    describe('listStaleWebFacts（GSI4）', () => {
      // GSI4SK（NextReview）は NUMBER 型で、実DynamoDBは数値順にソートする。
      // InMemorySingleTableStore の内部ソートは String() 比較（辞書順）のため、
      // このブロックの NextReview 値はすべて桁数を意図的に不揃いにし、
      // 数値順と辞書順で結果が食い違うように選んでいる
      // （同じ桁数の値だけだと数値順=辞書順になり、退行を検知できない形骸化テストになる）。
      const nowMs = 1_000_000;

      it('NextReview<=nowMs のものだけを昇順・limit件で返し、stable/未来分は除外する', async () => {
        // 数値昇順: 2, 20, 100。辞書昇順だと "100" < "2" < "20" になり順序が入れ替わる。
        await repository.putWebFact(
          buildWebFactInput({ FactID: 'FACT-100', Volatility: 'high', NextReview: 100 })
        );
        await repository.putWebFact(
          buildWebFactInput({ FactID: 'FACT-2', Volatility: 'high', NextReview: 2 })
        );
        await repository.putWebFact(
          buildWebFactInput({ FactID: 'FACT-20', Volatility: 'medium', NextReview: 20 })
        );
        // 未来（まだ再検証不要）は対象外
        await repository.putWebFact(
          buildWebFactInput({
            FactID: 'FACT-FUTURE',
            Volatility: 'low',
            NextReview: nowMs + 10_000,
          })
        );
        // stable（NextReview未設定）は対象外
        await repository.putWebFact(
          buildWebFactInput({ FactID: 'FACT-STABLE', Volatility: 'stable' })
        );

        const result = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);

        // 数値昇順（期限が古い順）：FACT-2(2) → FACT-20(20) → FACT-100(100)。
        // 辞書昇順だと FACT-100, FACT-2, FACT-20 になり、この期待値とは一致しない。
        expect(result.map((f) => f.FactID)).toEqual(['FACT-2', 'FACT-20', 'FACT-100']);
      });

      it('limit で件数を絞る（古い順の先頭からlimit件、数値順と辞書順で結果が変わる値で検証する）', async () => {
        // 数値昇順: 7, 8, 9, 10, 11。
        // 辞書昇順だと "10" < "11" < "7" < "8" < "9" になり、limit=2 の結果が全く別物になる。
        const nextReviews = [7, 8, 9, 10, 11];
        for (const value of nextReviews) {
          await repository.putWebFact(
            buildWebFactInput({
              FactID: `FACT-${value}`,
              Volatility: 'high',
              NextReview: value,
            })
          );
        }

        const result = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 2);

        // 数値順なら先頭2件は FACT-7(7), FACT-8(8)。
        // 辞書順だと FACT-10("10"), FACT-11("11") になり、この期待値とは一致しない。
        expect(result.map((f) => f.FactID)).toEqual(['FACT-7', 'FACT-8']);
      });

      it('GSI4 の射影だけで WebFactEntity を完全に復元できる', async () => {
        const input = buildWebFactInput({
          FactID: 'FACT-RESTORE',
          Text: '復元確認用のfact本文',
          SourceUrls: ['https://example.com/a', 'https://example.com/b'],
          Volatility: 'high',
          NextReview: nowMs - 1_000,
          ObservedAt: 1_699_999_000_000,
        });
        const created = await repository.putWebFact(input);

        const [restored] = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);

        expect(restored).toEqual(created);
      });
    });
  });
}
