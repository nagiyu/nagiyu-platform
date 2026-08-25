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

      it('GSI3 の射影だけで TopicEntity を復元できる（射影に含まれない RequestText/RequestedAt を除く）', async () => {
        const input = buildTopicInput({ TopicID: 'TOPIC-RESTORE', Care: 4 });
        const created = await repository.putTopic(input);

        const headers = await repository.listTopicHeaders('u1', 'hiyori');
        const restored = headers.find((h) => h.TopicID === 'TOPIC-RESTORE');

        // RequestText/RequestedAt は GSI3 の射影に含まれないため、比較対象から除く
        const expected: Record<string, unknown> = { ...created };
        delete expected.RequestText;
        delete expected.RequestedAt;

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

        const updated = await repository.putTopic(buildTopicInput({ Care: 7 }), {
          expectedUpdatedAt: created.UpdatedAt,
        });

        expect(updated.Care).toBe(7);
        expect(updated.CreatedAt).toBe(created.CreatedAt);
      });

      it('更新時（expectedUpdatedAt指定）に実際のUpdatedAtと不一致だとOptimisticLockErrorを投げる', async () => {
        await repository.putTopic(buildTopicInput());

        await expect(
          repository.putTopic(buildTopicInput({ Care: 7 }), { expectedUpdatedAt: -1 })
        ).rejects.toThrow(expect.objectContaining({ name: 'OptimisticLockError' }));
      });
    });

    describe('listTopicHeadersByCareDesc（GSI3）', () => {
      it('Care 降順で返し、limit で件数を絞る（数値順と辞書順で結果が変わる値で検証する）', async () => {
        // GSI3SK（Care）は NUMBER 型で、実DynamoDBは数値順にソートする。
        // 現状の InMemoryTopicRepository.listTopicHeadersByCareDesc は取得後に
        // JS 側で `b.Care - a.Care` の数値ソートを明示的に行っており、
        // InMemorySingleTableStore.queryByAttribute の sk 条件（String()比較の辞書順）には
        // 依存していないため、このテストは現状どちらの実装でも数値順どおりに通る。
        // それでも桁数の異なる値（2 / 9 / 10）を混ぜているのは、この経路が将来
        // store の GSI ソートキー経由のソート（sk 条件付き queryByAttribute）に
        // 乗せ替えられた場合に、辞書順ソートへ退行したことを検知するガードとして
        // 機能させるため（数値降順: 10, 9, 2 / 辞書降順: "9", "2", "10"）。
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
            FactID: 'FACT-100',
            Volatility: 'high',
            NextReview: 100,
            ObservedAt: OBSERVED_AT_MS,
          })
        );
        await repository.putWebFact(
          buildWebFactInput({
            FactID: 'FACT-2',
            Volatility: 'high',
            NextReview: 2,
            ObservedAt: OBSERVED_AT_MS,
          })
        );
        await repository.putWebFact(
          buildWebFactInput({
            FactID: 'FACT-20',
            Volatility: 'medium',
            NextReview: 20,
            ObservedAt: OBSERVED_AT_MS,
          })
        );
        // 未来（まだ再検証不要）は対象外
        await repository.putWebFact(
          buildWebFactInput({
            FactID: 'FACT-FUTURE',
            Volatility: 'low',
            NextReview: nowMs + 10_000,
            ObservedAt: OBSERVED_AT_MS,
          })
        );
        // stable（NextReview未設定）は対象外
        await repository.putWebFact(
          buildWebFactInput({
            FactID: 'FACT-STABLE',
            Volatility: 'stable',
            ObservedAt: OBSERVED_AT_MS,
          })
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
              ObservedAt: OBSERVED_AT_MS,
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
          ObservedAt: OBSERVED_AT_MS,
        });
        const created = await repository.putWebFact(input);

        const [restored] = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);

        expect(restored).toEqual(created);
      });

      describe('updateWebFactNextReview（GSI4SKの追従）', () => {
        it('NextReviewを窓の外（未来）から窓の中に更新すると、GSI4SKが追従しlistStaleWebFactsの結果に現れる', async () => {
          const created = await repository.putWebFact(
            buildWebFactInput({
              FactID: 'FACT-FOLLOW-IN',
              Volatility: 'high',
              NextReview: nowMs + 10_000,
              ObservedAt: OBSERVED_AT_MS,
            })
          );

          // 更新前は窓の外（未来）のため対象外
          const before = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);
          expect(before.map((f) => f.FactID)).not.toContain('FACT-FOLLOW-IN');

          await repository.updateWebFactNextReview(
            {
              userId: created.UserID,
              characterId: created.CharacterID,
              topicId: created.TopicID,
              factId: created.FactID,
            },
            nowMs - 1_000
          );

          const after = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);
          expect(after.map((f) => f.FactID)).toContain('FACT-FOLLOW-IN');
        });

        it('NextReviewを窓の中から窓の外（未来）に更新すると、GSI4SKが追従しlistStaleWebFactsの結果から消える', async () => {
          const created = await repository.putWebFact(
            buildWebFactInput({
              FactID: 'FACT-FOLLOW-OUT',
              Volatility: 'high',
              NextReview: nowMs - 1_000,
              ObservedAt: OBSERVED_AT_MS,
            })
          );

          // 更新前は窓の中のため対象に含まれる
          const before = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);
          expect(before.map((f) => f.FactID)).toContain('FACT-FOLLOW-OUT');

          await repository.updateWebFactNextReview(
            {
              userId: created.UserID,
              characterId: created.CharacterID,
              topicId: created.TopicID,
              factId: created.FactID,
            },
            nowMs + 10_000
          );

          const after = await repository.listStaleWebFacts('u1', 'hiyori', nowMs, 10);
          expect(after.map((f) => f.FactID)).not.toContain('FACT-FOLLOW-OUT');
        });
      });
    });
  });
}
