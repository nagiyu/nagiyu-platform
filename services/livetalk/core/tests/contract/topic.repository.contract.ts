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
    });

    describe('listTopicHeadersByCareDesc（GSI3）', () => {
      it('Care 降順で返し、limit で件数を絞る', async () => {
        await repository.putTopic(buildTopicInput({ TopicID: 'TOPIC-LOW', Care: 1 }));
        await repository.putTopic(buildTopicInput({ TopicID: 'TOPIC-HIGH', Care: 9 }));
        await repository.putTopic(buildTopicInput({ TopicID: 'TOPIC-MID', Care: 5 }));

        const result = await repository.listTopicHeadersByCareDesc('u1', 'hiyori', 2);

        expect(result.map((t) => t.TopicID)).toEqual(['TOPIC-HIGH', 'TOPIC-MID']);
        expect(result.map((t) => t.Care)).toEqual([9, 5]);
      });
    });

    describe('listStaleWebFacts（GSI4）', () => {
      const nowMs = 1_700_000_100_000;

      it('NextReview<=nowMs のものだけを昇順・limit件で返し、stable/未来分は除外する', async () => {
        await repository.putWebFact(
          buildWebFactInput({
            FactID: 'FACT-PAST-2',
            Volatility: 'high',
            NextReview: nowMs - 2_000,
          })
        );
        await repository.putWebFact(
          buildWebFactInput({
            FactID: 'FACT-PAST-1',
            Volatility: 'high',
            NextReview: nowMs - 5_000,
          })
        );
        await repository.putWebFact(
          buildWebFactInput({ FactID: 'FACT-NOW', Volatility: 'medium', NextReview: nowMs })
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

        // 期限が古い順（昇順）：PAST-1(-5000) → PAST-2(-2000) → NOW(0)
        expect(result.map((f) => f.FactID)).toEqual(['FACT-PAST-1', 'FACT-PAST-2', 'FACT-NOW']);
      });

      it('limit で件数を絞る（古い順の先頭からlimit件）', async () => {
        for (let i = 1; i <= 5; i += 1) {
          await repository.putWebFact(
            buildWebFactInput({
              FactID: `FACT-${i}`,
              Volatility: 'high',
              NextReview: nowMs - i * 1_000,
            })
          );
        }

        const result = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 2);

        // NextReview が古い順: FACT-5(-5000) → FACT-4(-4000)
        expect(result.map((f) => f.FactID)).toEqual(['FACT-5', 'FACT-4']);
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
