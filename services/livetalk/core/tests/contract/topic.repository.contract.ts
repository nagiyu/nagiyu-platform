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
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 'TOPIC-001',
    subject: 'コーヒー',
    canonicalSummary: 'コーヒーが好き',
    category: '飲み物',
    care: 3,
    embedding: [0.1, 0.2],
    ...overrides,
  };
}

function buildWebFactInput(overrides: Partial<CreateWebFactInput> = {}): CreateWebFactInput {
  return {
    userId: 'u1',
    characterId: 'hiyori',
    topicId: 'TOPIC-001',
    text: 'コーヒーの適量は1日3〜4杯まで',
    sourceUrls: ['https://example.com/coffee'],
    volatility: 'medium',
    observedAt: 1_700_000_000_000,
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
        userId: input.userId,
        characterId: input.characterId,
        topicId: input.topicId,
      });

      expect(fetched).toEqual(created);
    });

    describe('listTopicHeaders（GSI3）', () => {
      it('指定ユーザー・キャラの Topic ヘッダのみを列挙する（SelfFact/WebFact・他ユーザーは含まない）', async () => {
        await repository.putTopic(buildTopicInput({ topicId: 'TOPIC-A' }));
        await repository.putTopic(buildTopicInput({ topicId: 'TOPIC-B' }));
        // 別ユーザー・別キャラの Topic は対象外
        await repository.putTopic(
          buildTopicInput({ userId: 'other-user', topicId: 'TOPIC-OTHER-USER' })
        );
        await repository.putTopic(
          buildTopicInput({ characterId: 'ageha', topicId: 'TOPIC-OTHER-CHAR' })
        );
        // 同じ Topic 配下の SELF/WEB fact は META（Topic ヘッダ）ではないため対象外
        await repository.putSelfFact({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: 'TOPIC-A',
          text: 'ユーザーは猫を飼っている',
          provenance: 'chat-001',
        });
        await repository.putWebFact(buildWebFactInput({ topicId: 'TOPIC-A' }));

        const headers = await repository.listTopicHeaders('u1', 'hiyori');

        expect(headers.map((h) => h.topicId).sort()).toEqual(['TOPIC-A', 'TOPIC-B']);
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
          topicId: 'TOPIC-REQUEST',
          requestText: '〇〇について調べて',
          requestedAt: 1_700_000_050_000,
        });
        await repository.putTopic(input);

        const fetched = await repository.getTopic({
          userId: input.userId,
          characterId: input.characterId,
          topicId: input.topicId,
        });
        expect(fetched?.requestText).toBe(input.requestText);
        expect(fetched?.requestedAt).toBe(input.requestedAt);

        const headers = await repository.listTopicHeaders('u1', 'hiyori');
        const header = headers.find((h) => h.topicId === 'TOPIC-REQUEST');

        expect(header).toBeDefined();
        expect(header?.requestText).toBeUndefined();
        expect(header?.requestedAt).toBeUndefined();
      });

      it('GSI3 の射影だけで TopicEntity を復元できる（射影に含まれない RequestText/RequestedAt を除く）', async () => {
        const input = buildTopicInput({ topicId: 'TOPIC-RESTORE', care: 4 });
        const created = await repository.putTopic(input);

        const headers = await repository.listTopicHeaders('u1', 'hiyori');
        const restored = headers.find((h) => h.topicId === 'TOPIC-RESTORE');

        // RequestText/RequestedAt は GSI3 の射影に含まれないため、比較対象から除く
        const expected: Record<string, unknown> = { ...created };
        delete expected.requestText;
        delete expected.requestedAt;

        expect(restored).toEqual(expected);
      });
    });

    describe('putTopic の楽観ロック', () => {
      it('新規作成時（expectedUpdatedAt未指定）に同一キーへ再度putTopicするとOptimisticLockErrorを投げる', async () => {
        await repository.putTopic(buildTopicInput());

        await expect(repository.putTopic(buildTopicInput())).rejects.toThrow(
          expect.objectContaining({ name: 'OptimisticLockError' })
        );
      });

      it('更新時（expectedUpdatedAt指定）は現在のUpdatedAtと一致すれば成功し、CreatedAtを維持する', async () => {
        const created = await repository.putTopic(buildTopicInput());

        const updated = await repository.putTopic(buildTopicInput({ care: 7 }), {
          expectedUpdatedAt: created.updatedAt,
        });

        expect(updated.care).toBe(7);
        expect(updated.createdAt).toBe(created.createdAt);
      });

      it('更新時（expectedUpdatedAt指定）に対象の Topic が存在しないと EntityNotFoundError を投げる', async () => {
        await expect(
          repository.putTopic(buildTopicInput(), { expectedUpdatedAt: 1 })
        ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));
      });

      it('更新時（expectedUpdatedAt指定）に実際のUpdatedAtと不一致だとOptimisticLockErrorを投げる', async () => {
        await repository.putTopic(buildTopicInput());

        await expect(
          repository.putTopic(buildTopicInput({ care: 7 }), { expectedUpdatedAt: -1 })
        ).rejects.toThrow(expect.objectContaining({ name: 'OptimisticLockError' }));
      });
    });

    describe('deleteSelfFact', () => {
      it('SELF fact を削除し、同じ fact をもう一度削除すると EntityNotFoundError を投げる', async () => {
        const fact = await repository.putSelfFact({
          userId: 'u1',
          characterId: 'hiyori',
          topicId: 'TOPIC-001',
          text: 'ユーザーは猫を飼っている',
          provenance: 'chat-001',
        });
        const key = {
          userId: fact.userId,
          characterId: fact.characterId,
          topicId: fact.topicId,
          factId: fact.factId,
        };

        await repository.deleteSelfFact(key);

        expect(await repository.listSelfFacts('u1', 'hiyori', 'TOPIC-001')).toEqual([]);
        await expect(repository.deleteSelfFact(key)).rejects.toThrow(
          expect.objectContaining({ name: 'EntityNotFoundError' })
        );
      });
    });

    describe('listTopicHeadersByCareDesc（GSI3）', () => {
      it('Care 降順で返し、limit で件数を絞る（数値順と辞書順で結果が変わる値で検証する）', async () => {
        // GSI3SK（Care）は NUMBER 型で、実DynamoDBは数値順にソートする。
        // 現状の InMemoryTopicRepository.listTopicHeadersByCareDesc は取得後に
        // JS 側で `b.care - a.care` の数値ソートを明示的に行っており、
        // InMemorySingleTableStore.queryByAttribute の sk 条件（String()比較の辞書順）には
        // 依存していないため、このテストは現状どちらの実装でも数値順どおりに通る。
        // それでも桁数の異なる値（2 / 9 / 10）を混ぜているのは、この経路が将来
        // store の GSI ソートキー経由のソート（sk 条件付き queryByAttribute）に
        // 乗せ替えられた場合に、辞書順ソートへ退行したことを検知するガードとして
        // 機能させるため（数値降順: 10, 9, 2 / 辞書降順: "9", "2", "10"）。
        await repository.putTopic(buildTopicInput({ topicId: 'TOPIC-LOW', care: 2 }));
        await repository.putTopic(buildTopicInput({ topicId: 'TOPIC-HIGH', care: 10 }));
        await repository.putTopic(buildTopicInput({ topicId: 'TOPIC-MID', care: 9 }));

        const result = await repository.listTopicHeadersByCareDesc('u1', 'hiyori', 2);

        // 数値降順なら TOPIC-HIGH(10), TOPIC-MID(9) が上位2件。
        // 辞書順（"9" > "2" > "10"）だと TOPIC-MID, TOPIC-LOW になり、この期待値とは一致しない。
        expect(result.map((t) => t.topicId)).toEqual(['TOPIC-HIGH', 'TOPIC-MID']);
        expect(result.map((t) => t.care)).toEqual([10, 9]);
      });
    });

    describe('listStaleWebFacts（GSI4）', () => {
      // GSI4SK（NextReview）は NUMBER 型で、実DynamoDBは数値順にソートする。
      // 現状の InMemoryTopicRepository.listStaleWebFacts も取得後に
      // JS 側で NextReview の数値差分によるソートを明示的に行っており、
      // InMemorySingleTableStore.queryByAttribute の sk 条件（String()比較の辞書順）には
      // 依存していないため、このブロックのテストは現状どちらの実装でも数値順どおりに通る。
      // それでも NextReview の値の桁数を意図的に不揃いにしているのは、この経路が将来
      // store の GSI ソートキー経由のソート（sk 条件付き queryByAttribute）に
      // 乗せ替えられた場合に、辞書順ソートへ退行したことを検知するガードとして機能させるため。
      // ObservedAt は NextReview と同じ小さいスケールに揃え、
      // 「観測より前に再検証期限が来る」という非現実的な数値の混在を避けている。
      const nowMs = 1_000_000;
      const OBSERVED_AT_MS = 1;

      it('NextReview<=nowMs のものだけを昇順・limit件で返し、stable/未来分は除外する', async () => {
        // 数値昇順: 2, 20, 100。辞書昇順だと "100" < "2" < "20" になり順序が入れ替わる。
        await repository.putWebFact(
          buildWebFactInput({
            factId: 'FACT-100',
            volatility: 'high',
            nextReview: 100,
            observedAt: OBSERVED_AT_MS,
          })
        );
        await repository.putWebFact(
          buildWebFactInput({
            factId: 'FACT-2',
            volatility: 'high',
            nextReview: 2,
            observedAt: OBSERVED_AT_MS,
          })
        );
        await repository.putWebFact(
          buildWebFactInput({
            factId: 'FACT-20',
            volatility: 'medium',
            nextReview: 20,
            observedAt: OBSERVED_AT_MS,
          })
        );
        // 未来（まだ再検証不要）は対象外
        await repository.putWebFact(
          buildWebFactInput({
            factId: 'FACT-FUTURE',
            volatility: 'low',
            nextReview: nowMs + 10_000,
            observedAt: OBSERVED_AT_MS,
          })
        );
        // stable（NextReview未設定）は対象外
        await repository.putWebFact(
          buildWebFactInput({
            factId: 'FACT-STABLE',
            volatility: 'stable',
            observedAt: OBSERVED_AT_MS,
          })
        );

        const result = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);

        // 数値昇順（期限が古い順）：FACT-2(2) → FACT-20(20) → FACT-100(100)。
        // 辞書昇順だと FACT-100, FACT-2, FACT-20 になり、この期待値とは一致しない。
        expect(result.map((f) => f.factId)).toEqual(['FACT-2', 'FACT-20', 'FACT-100']);
      });

      it('limit で件数を絞る（古い順の先頭からlimit件、数値順と辞書順で結果が変わる値で検証する）', async () => {
        // 数値昇順: 7, 8, 9, 10, 11。
        // 辞書昇順だと "10" < "11" < "7" < "8" < "9" になり、limit=2 の結果が全く別物になる。
        const nextReviews = [7, 8, 9, 10, 11];
        for (const value of nextReviews) {
          await repository.putWebFact(
            buildWebFactInput({
              factId: `FACT-${value}`,
              volatility: 'high',
              nextReview: value,
              observedAt: OBSERVED_AT_MS,
            })
          );
        }

        const result = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 2);

        // 数値順なら先頭2件は FACT-7(7), FACT-8(8)。
        // 辞書順だと FACT-10("10"), FACT-11("11") になり、この期待値とは一致しない。
        expect(result.map((f) => f.factId)).toEqual(['FACT-7', 'FACT-8']);
      });

      it('GSI4 の射影だけで WebFactEntity を完全に復元できる', async () => {
        const input = buildWebFactInput({
          factId: 'FACT-RESTORE',
          text: '復元確認用のfact本文',
          sourceUrls: ['https://example.com/a', 'https://example.com/b'],
          volatility: 'high',
          nextReview: nowMs - 1_000,
          observedAt: OBSERVED_AT_MS,
        });
        const created = await repository.putWebFact(input);

        const [restored] = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);

        expect(restored).toEqual(created);
      });

      describe('updateWebFactNextReview（GSI4SKの追従）', () => {
        it('存在しない WEB fact は何もせず成功する', async () => {
          await expect(
            repository.updateWebFactNextReview(
              { userId: 'u1', characterId: 'hiyori', topicId: 'TOPIC-001', factId: 'missing' },
              nowMs
            )
          ).resolves.toBeUndefined();
        });

        it('NextReviewを窓の外（未来）から窓の中に更新すると、GSI4SKが追従しlistStaleWebFactsの結果に現れる', async () => {
          const created = await repository.putWebFact(
            buildWebFactInput({
              factId: 'FACT-FOLLOW-IN',
              volatility: 'high',
              nextReview: nowMs + 10_000,
              observedAt: OBSERVED_AT_MS,
            })
          );

          // 更新前は窓の外（未来）のため対象外
          const before = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);
          expect(before.map((f) => f.factId)).not.toContain('FACT-FOLLOW-IN');

          await repository.updateWebFactNextReview(
            {
              userId: created.userId,
              characterId: created.characterId,
              topicId: created.topicId,
              factId: created.factId,
            },
            nowMs - 1_000
          );

          const after = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);
          expect(after.map((f) => f.factId)).toContain('FACT-FOLLOW-IN');
        });

        it('NextReviewを窓の中から窓の外（未来）に更新すると、GSI4SKが追従しlistStaleWebFactsの結果から消える', async () => {
          const created = await repository.putWebFact(
            buildWebFactInput({
              factId: 'FACT-FOLLOW-OUT',
              volatility: 'high',
              nextReview: nowMs - 1_000,
              observedAt: OBSERVED_AT_MS,
            })
          );

          // 更新前は窓の中のため対象に含まれる
          const before = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);
          expect(before.map((f) => f.factId)).toContain('FACT-FOLLOW-OUT');

          await repository.updateWebFactNextReview(
            {
              userId: created.userId,
              characterId: created.characterId,
              topicId: created.topicId,
              factId: created.factId,
            },
            nowMs + 10_000
          );

          const after = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);
          expect(after.map((f) => f.factId)).not.toContain('FACT-FOLLOW-OUT');
        });
      });
    });
  });
}
