/**
 * MembershipRepository 契約テスト（実装非依存の振る舞い仕様）
 *
 * InMemory実装と実DynamoDB実装（DynamoDB Local）の双方に同一の仕様を通し、
 * 実装間の乖離を機械的に検知する。各テストは決定的で単一の結末を持つ。
 *
 * 順序を契約にするのは getByGroupId だけ（同じパーティション内の SK 昇順 = ユーザー ID の昇順）。
 * getByUserId と getPendingInvitationsByUserId は GSI1 の Query のため、結果の順序は契約にせず
 * （保証の範囲を広げない）、集合で比べる。
 *
 * getByGroupId と deleteByGroupId は、グループのメタ情報・グループリストと同じパーティションを
 * 引くため、SK の接頭辞で絞れていること（他の種別を返さない・消さない）を契約にする。
 * deleteByGroupId は BatchWriteItem の上限（1 回 25 件）をまたぐ件数でも全件消す。
 *
 * 招待の期限は TTL 属性にエポック秒で保存する（他の時刻は数値ミリ秒）。
 * 任意項目は update で null を渡すと属性ごと消え、undefined は変更しない。
 *
 * 旧形式（camelCase の属性名・ISO 文字列の時刻・Type なし。TTL だけは今も `TTL`）のアイテムは、
 * 移行前のデータが書き込まれるまで残るために読めて、一覧にも出て、更新で新名に置き換わる必要がある。
 * 特に getPendingInvitationsByUserId は、旧名 `status` が PENDING の招待も返す。
 */

import type { MembershipRepository } from '../../src/repositories/membership/membership-repository.interface.js';
import type { CreateGroupMembershipInput } from '../../src/types/index.js';
import type { RawStoreHooks } from './helpers/raw-store.js';
import {
  LEGACY_CREATED_AT,
  LEGACY_UPDATED_AT,
  toLegacyTimestamp,
  waitForTimestampAdvance,
} from './helpers/time.js';

/** 契約テストの対象実装が満たすべきフック */
export interface MembershipRepositoryContractHooks extends RawStoreHooks {
  /** テスト対象のリポジトリを生成する（reset の後に呼ばれる） */
  makeRepository: () => Promise<MembershipRepository>;
}

const INVITED_AT = Date.UTC(2030, 0, 1, 0, 0, 0);
const RESPONDED_AT = Date.UTC(2030, 0, 2, 0, 0, 0);
const EXPIRES_AT = Date.UTC(2030, 0, 8, 0, 0, 0);

function buildMembershipInput(
  overrides: Partial<CreateGroupMembershipInput> = {}
): CreateGroupMembershipInput {
  return {
    groupId: 'group-1',
    userId: 'user-1',
    role: 'MEMBER',
    status: 'ACCEPTED',
    ...overrides,
  };
}

function buildPendingInput(
  overrides: Partial<CreateGroupMembershipInput> = {}
): CreateGroupMembershipInput {
  return buildMembershipInput({
    status: 'PENDING',
    invitedBy: 'owner-1',
    invitedAt: INVITED_AT,
    expiresAt: EXPIRES_AT,
    ...overrides,
  });
}

/** 旧形式のメンバーシップアイテム（ACCEPTED） */
function buildLegacyMembershipItem(
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const groupId = (overrides.groupId as string | undefined) ?? 'group-1';
  const userId = (overrides.userId as string | undefined) ?? 'legacy-user';
  return {
    PK: `GROUP#${groupId}`,
    SK: `MEMBER#${userId}`,
    GSI1PK: `USER#${userId}`,
    GSI1SK: `GROUP#${groupId}`,
    groupId,
    userId,
    role: 'MEMBER',
    status: 'ACCEPTED',
    createdAt: toLegacyTimestamp(LEGACY_CREATED_AT),
    updatedAt: toLegacyTimestamp(LEGACY_UPDATED_AT),
    ...overrides,
  };
}

/** 旧形式の応答待ちの招待アイテム。TTL はエポック秒 */
function buildLegacyPendingItem(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return buildLegacyMembershipItem({
    status: 'PENDING',
    invitedBy: 'owner-1',
    invitedAt: toLegacyTimestamp(INVITED_AT),
    TTL: EXPIRES_AT / 1000,
    ...overrides,
  });
}

function sortedGroupIds(memberships: Array<{ groupId: string }>): string[] {
  return memberships.map((membership) => membership.groupId).sort();
}

function userIds(memberships: Array<{ userId: string }>): string[] {
  return memberships.map((membership) => membership.userId);
}

function paddedUserId(index: number): string {
  return `user-${String(index).padStart(3, '0')}`;
}

/**
 * MembershipRepository の契約テストスイートを定義する。
 *
 * @param label - テスト対象実装のラベル（describe名に使用）
 * @param hooks - テスト対象実装を操作するためのフック
 */
export function defineMembershipRepositoryContract(
  label: string,
  hooks: MembershipRepositoryContractHooks
): void {
  describe(`MembershipRepository 契約: ${label}`, () => {
    let repository: MembershipRepository;

    beforeEach(async () => {
      await hooks.reset();
      repository = await hooks.makeRepository();
    });

    afterAll(async () => {
      if (hooks.teardown) {
        await hooks.teardown();
      }
    });

    describe('CRUD', () => {
      it('create したメンバーシップを getById で取得できる', async () => {
        const input = buildMembershipInput();

        const created = await repository.create(input);

        expect(created).toMatchObject(input);
        expect(typeof created.createdAt).toBe('number');
        // store が 1 回読んだ時刻を createdAt と updatedAt の両方に使う
        expect(created.updatedAt).toBe(created.createdAt);
        expect(await repository.getById('group-1', 'user-1')).toEqual(created);
      });

      it('保存形式は PascalCase の属性名と数値ミリ秒の時刻で、Type と GSI1 のキーを持ち、任意項目と TTL は持たない', async () => {
        const created = await repository.create(buildMembershipInput());

        const raw = await hooks.getRawItem('GROUP#group-1', 'MEMBER#user-1');
        expect(raw).toMatchObject({
          Type: 'GroupMembership',
          GSI1PK: 'USER#user-1',
          GSI1SK: 'GROUP#group-1',
          GroupID: 'group-1',
          UserID: 'user-1',
          Role: 'MEMBER',
          Status: 'ACCEPTED',
          CreatedAt: created.createdAt,
          UpdatedAt: created.updatedAt,
        });
        for (const absent of [
          'InvitedBy',
          'InvitedAt',
          'RespondedAt',
          'TTL',
          'groupId',
          'userId',
          'role',
          'status',
          'createdAt',
          'updatedAt',
        ]) {
          expect(raw).not.toHaveProperty(absent);
        }
      });

      it('招待の項目つきで作成すると、各属性に保存され、expiresAt は TTL にエポック秒で入る', async () => {
        const created = await repository.create(buildPendingInput());

        expect(created).toMatchObject({
          status: 'PENDING',
          invitedBy: 'owner-1',
          invitedAt: INVITED_AT,
          expiresAt: EXPIRES_AT,
        });
        expect(await hooks.getRawItem('GROUP#group-1', 'MEMBER#user-1')).toMatchObject({
          Status: 'PENDING',
          InvitedBy: 'owner-1',
          InvitedAt: INVITED_AT,
          TTL: EXPIRES_AT / 1000,
        });
        expect(await repository.getById('group-1', 'user-1')).toEqual(created);
      });

      it('expiresAt のミリ秒の端数は TTL で切り捨てられる', async () => {
        const created = await repository.create(buildPendingInput({ expiresAt: EXPIRES_AT + 999 }));

        expect(created.expiresAt).toBe(EXPIRES_AT);
        expect(await hooks.getRawItem('GROUP#group-1', 'MEMBER#user-1')).toMatchObject({
          TTL: EXPIRES_AT / 1000,
        });
      });

      it('getById は存在しないメンバーシップに対して null を返す', async () => {
        expect(await repository.getById('group-1', 'no-such-user')).toBeNull();
      });

      it('同じグループ・ユーザーの重複作成は EntityAlreadyExistsError をスローし、既存のメンバーシップを変えない', async () => {
        const first = await repository.create(buildPendingInput());

        await expect(repository.create(buildMembershipInput({ role: 'OWNER' }))).rejects.toThrow(
          expect.objectContaining({ name: 'EntityAlreadyExistsError' })
        );

        expect(await repository.getById('group-1', 'user-1')).toEqual(first);
      });

      it('update は更新後の Entity を返し、updatedAt が進み、他の項目は変わらない', async () => {
        const created = await repository.create(buildMembershipInput());
        await waitForTimestampAdvance();

        const updated = await repository.update('group-1', 'user-1', { role: 'OWNER' });

        expect(updated).toEqual({ ...created, role: 'OWNER', updatedAt: updated.updatedAt });
        expect(updated.updatedAt).toBeGreaterThan(created.updatedAt);
        expect(await repository.getById('group-1', 'user-1')).toEqual(updated);
      });

      it('招待を承諾する update で status と respondedAt が更新され、expiresAt を null で消すと TTL 属性が消える', async () => {
        await repository.create(buildPendingInput());

        const updated = await repository.update('group-1', 'user-1', {
          status: 'ACCEPTED',
          respondedAt: RESPONDED_AT,
          expiresAt: null,
        });

        expect(updated).toMatchObject({
          status: 'ACCEPTED',
          respondedAt: RESPONDED_AT,
          invitedBy: 'owner-1',
          invitedAt: INVITED_AT,
        });
        expect(updated.expiresAt).toBeUndefined();
        const raw = await hooks.getRawItem('GROUP#group-1', 'MEMBER#user-1');
        expect(raw).toMatchObject({ Status: 'ACCEPTED', RespondedAt: RESPONDED_AT });
        expect(raw).not.toHaveProperty('TTL');
        expect((await repository.getById('group-1', 'user-1'))?.expiresAt).toBeUndefined();
      });

      it('update で expiresAt を数値で渡すと TTL にエポック秒で保存される', async () => {
        await repository.create(buildMembershipInput());

        const updated = await repository.update('group-1', 'user-1', { expiresAt: EXPIRES_AT });

        expect(updated.expiresAt).toBe(EXPIRES_AT);
        expect(await hooks.getRawItem('GROUP#group-1', 'MEMBER#user-1')).toMatchObject({
          TTL: EXPIRES_AT / 1000,
        });
      });

      it('update で任意項目を省くと変更されない', async () => {
        await repository.create(buildPendingInput());

        const updated = await repository.update('group-1', 'user-1', { role: 'OWNER' });

        expect(updated).toMatchObject({
          invitedBy: 'owner-1',
          invitedAt: INVITED_AT,
          expiresAt: EXPIRES_AT,
        });
      });

      it('update で任意項目に null を渡すと、その属性だけが消える', async () => {
        await repository.create(buildPendingInput({ respondedAt: RESPONDED_AT }));

        const updated = await repository.update('group-1', 'user-1', {
          invitedBy: null,
          invitedAt: null,
          respondedAt: null,
        });

        expect(updated.invitedBy).toBeUndefined();
        expect(updated.invitedAt).toBeUndefined();
        expect(updated.respondedAt).toBeUndefined();
        expect(updated.expiresAt).toBe(EXPIRES_AT);
        const raw = await hooks.getRawItem('GROUP#group-1', 'MEMBER#user-1');
        for (const removed of ['InvitedBy', 'InvitedAt', 'RespondedAt']) {
          expect(raw).not.toHaveProperty(removed);
        }
        expect(raw).toHaveProperty('TTL');
      });

      it('存在しないメンバーシップの update は EntityNotFoundError をスローし、アイテムを作らない', async () => {
        await expect(
          repository.update('group-1', 'no-such-user', { role: 'OWNER' })
        ).rejects.toThrow(expect.objectContaining({ name: 'EntityNotFoundError' }));

        expect(await repository.getById('group-1', 'no-such-user')).toBeNull();
        expect(await hooks.getRawItem('GROUP#group-1', 'MEMBER#no-such-user')).toBeUndefined();
      });

      it('delete すると取得できなくなり、他のメンバーシップは残る', async () => {
        await repository.create(buildMembershipInput({ userId: 'user-1' }));
        await repository.create(buildMembershipInput({ userId: 'user-2' }));

        await repository.delete('group-1', 'user-1');

        expect(await repository.getById('group-1', 'user-1')).toBeNull();
        expect(await repository.getById('group-1', 'user-2')).not.toBeNull();
      });

      it('存在しないメンバーシップの delete は EntityNotFoundError をスローする', async () => {
        await expect(repository.delete('group-1', 'no-such-user')).rejects.toThrow(
          expect.objectContaining({ name: 'EntityNotFoundError' })
        );
      });
    });

    describe('getByGroupId', () => {
      it('グループのメンバーシップだけを、ユーザー ID の昇順で返す', async () => {
        // 作成順と ID 順が食い違う順で作り、SK 順で返ることを確かめる
        for (const userId of ['user-c', 'user-a', 'user-b']) {
          await repository.create(buildMembershipInput({ userId }));
        }
        await repository.create(buildMembershipInput({ groupId: 'group-2', userId: 'user-x' }));

        expect(userIds(await repository.getByGroupId('group-1'))).toEqual([
          'user-a',
          'user-b',
          'user-c',
        ]);
      });

      it('グループのメタ情報とグループリストなど、同じパーティションの他の種別を返さない', async () => {
        await repository.create(buildMembershipInput());
        await hooks.putRawItem({
          PK: 'GROUP#group-1',
          SK: '#META#',
          Type: 'Group',
          GroupID: 'group-1',
        });
        await hooks.putRawItem({
          PK: 'GROUP#group-1',
          SK: 'GLIST#list-1',
          Type: 'GroupList',
          ListID: 'list-1',
        });

        expect(userIds(await repository.getByGroupId('group-1'))).toEqual(['user-1']);
      });

      it('メンバーシップが 1 件もなければ空の配列を返す', async () => {
        expect(await repository.getByGroupId('group-1')).toEqual([]);
      });
    });

    describe('getByUserId', () => {
      it('ユーザーが所属する全グループのメンバーシップだけを返す（承諾前の招待も含む）', async () => {
        await repository.create(buildMembershipInput({ groupId: 'group-1', userId: 'user-1' }));
        await repository.create(buildPendingInput({ groupId: 'group-2', userId: 'user-1' }));
        await repository.create(buildMembershipInput({ groupId: 'group-3', userId: 'user-2' }));

        const memberships = await repository.getByUserId('user-1');

        expect(sortedGroupIds(memberships)).toEqual(['group-1', 'group-2']);
        expect(memberships.every((membership) => membership.userId === 'user-1')).toBe(true);
      });

      it('メンバーシップを削除すると一覧から外れる', async () => {
        await repository.create(buildMembershipInput({ groupId: 'group-1' }));
        await repository.create(buildMembershipInput({ groupId: 'group-2' }));

        await repository.delete('group-1', 'user-1');

        expect(sortedGroupIds(await repository.getByUserId('user-1'))).toEqual(['group-2']);
      });

      it('メンバーシップが 1 件もなければ空の配列を返す', async () => {
        expect(await repository.getByUserId('user-1')).toEqual([]);
      });
    });

    describe('getPendingInvitationsByUserId', () => {
      it('応答待ちの招待だけを返す（承諾済み・拒否済み・他のユーザーは含めない）', async () => {
        await repository.create(buildPendingInput({ groupId: 'group-1', userId: 'user-1' }));
        await repository.create(
          buildMembershipInput({ groupId: 'group-2', userId: 'user-1', status: 'ACCEPTED' })
        );
        await repository.create(
          buildMembershipInput({ groupId: 'group-3', userId: 'user-1', status: 'REJECTED' })
        );
        await repository.create(buildPendingInput({ groupId: 'group-4', userId: 'user-2' }));

        const pending = await repository.getPendingInvitationsByUserId('user-1');

        expect(sortedGroupIds(pending)).toEqual(['group-1']);
        expect(pending[0]).toMatchObject({ status: 'PENDING', userId: 'user-1' });
      });

      it('複数の招待があれば全件を返す', async () => {
        for (const groupId of ['group-1', 'group-2', 'group-3']) {
          await repository.create(buildPendingInput({ groupId }));
        }

        expect(sortedGroupIds(await repository.getPendingInvitationsByUserId('user-1'))).toEqual([
          'group-1',
          'group-2',
          'group-3',
        ]);
      });

      it('招待を承諾すると応答待ちの一覧から外れる', async () => {
        await repository.create(buildPendingInput());

        await repository.update('group-1', 'user-1', { status: 'ACCEPTED' });

        expect(await repository.getPendingInvitationsByUserId('user-1')).toEqual([]);
      });

      it('応答待ちの招待が 1 件もなければ空の配列を返す', async () => {
        await repository.create(buildMembershipInput());

        expect(await repository.getPendingInvitationsByUserId('user-1')).toEqual([]);
      });
    });

    describe('deleteByGroupId', () => {
      it('グループのメンバーシップをすべて削除し、他のグループのメンバーシップは残す', async () => {
        await repository.create(buildMembershipInput({ groupId: 'group-1', userId: 'user-1' }));
        await repository.create(buildMembershipInput({ groupId: 'group-1', userId: 'user-2' }));
        await repository.create(buildMembershipInput({ groupId: 'group-2', userId: 'user-1' }));

        await repository.deleteByGroupId('group-1');

        expect(await repository.getByGroupId('group-1')).toEqual([]);
        expect(userIds(await repository.getByGroupId('group-2'))).toEqual(['user-1']);
        expect(sortedGroupIds(await repository.getByUserId('user-1'))).toEqual(['group-2']);
      });

      it('グループのメタ情報とグループリストなど、同じパーティションの他の種別は削除しない', async () => {
        await repository.create(buildMembershipInput());
        const meta = { PK: 'GROUP#group-1', SK: '#META#', Type: 'Group', GroupID: 'group-1' };
        const list = {
          PK: 'GROUP#group-1',
          SK: 'GLIST#list-1',
          Type: 'GroupList',
          ListID: 'list-1',
        };
        await hooks.putRawItem(meta);
        await hooks.putRawItem(list);

        await repository.deleteByGroupId('group-1');

        expect(await repository.getByGroupId('group-1')).toEqual([]);
        expect(await hooks.getRawItem('GROUP#group-1', '#META#')).toEqual(meta);
        expect(await hooks.getRawItem('GROUP#group-1', 'GLIST#list-1')).toEqual(list);
      });

      it('メンバーシップが 1 件もなくても成功する', async () => {
        await expect(repository.deleteByGroupId('group-1')).resolves.toBeUndefined();
      });

      // BatchWriteItem は 1 回 25 件。ちょうど使い切る件数・1 件超える件数・複数回に分かれる件数で確かめる
      it.each([25, 26, 51])('%i 件のメンバーシップも全件削除する', async (count) => {
        for (let index = 0; index < count; index++) {
          await repository.create(buildMembershipInput({ userId: paddedUserId(index) }));
        }
        await repository.create(buildMembershipInput({ groupId: 'group-2', userId: 'other' }));

        await repository.deleteByGroupId('group-1');

        expect(await repository.getByGroupId('group-1')).toEqual([]);
        expect(userIds(await repository.getByGroupId('group-2'))).toEqual(['other']);
      });
    });

    describe('旧形式のアイテム', () => {
      it('旧形式のメンバーシップを getById で読める', async () => {
        await hooks.putRawItem(buildLegacyMembershipItem());

        expect(await repository.getById('group-1', 'legacy-user')).toEqual({
          groupId: 'group-1',
          userId: 'legacy-user',
          role: 'MEMBER',
          status: 'ACCEPTED',
          createdAt: LEGACY_CREATED_AT,
          updatedAt: LEGACY_UPDATED_AT,
        });
      });

      it('旧形式の招待の項目と TTL（エポック秒）を読み、expiresAt をミリ秒で返す', async () => {
        await hooks.putRawItem(
          buildLegacyPendingItem({ respondedAt: toLegacyTimestamp(RESPONDED_AT) })
        );

        expect(await repository.getById('group-1', 'legacy-user')).toEqual({
          groupId: 'group-1',
          userId: 'legacy-user',
          role: 'MEMBER',
          status: 'PENDING',
          invitedBy: 'owner-1',
          invitedAt: INVITED_AT,
          respondedAt: RESPONDED_AT,
          expiresAt: EXPIRES_AT,
          createdAt: LEGACY_CREATED_AT,
          updatedAt: LEGACY_UPDATED_AT,
        });
      });

      it('旧形式のメンバーシップが getByGroupId に出る（新形式と混在してもユーザー ID の昇順）', async () => {
        await hooks.putRawItem(buildLegacyMembershipItem({ userId: 'user-b' }));
        await repository.create(buildMembershipInput({ userId: 'user-c' }));
        await repository.create(buildMembershipInput({ userId: 'user-a' }));

        expect(userIds(await repository.getByGroupId('group-1'))).toEqual([
          'user-a',
          'user-b',
          'user-c',
        ]);
      });

      it('旧形式のメンバーシップが getByUserId に出る', async () => {
        await hooks.putRawItem(buildLegacyMembershipItem({ groupId: 'group-1', userId: 'user-1' }));
        await repository.create(buildMembershipInput({ groupId: 'group-2', userId: 'user-1' }));

        expect(sortedGroupIds(await repository.getByUserId('user-1'))).toEqual([
          'group-1',
          'group-2',
        ]);
      });

      it('旧形式の status が PENDING の招待が getPendingInvitationsByUserId に出る', async () => {
        await hooks.putRawItem(buildLegacyPendingItem({ groupId: 'group-1', userId: 'user-1' }));

        const pending = await repository.getPendingInvitationsByUserId('user-1');

        expect(sortedGroupIds(pending)).toEqual(['group-1']);
        expect(pending[0]).toMatchObject({ status: 'PENDING', expiresAt: EXPIRES_AT });
      });

      it('旧形式と新形式の招待が混在していても、どちらも getPendingInvitationsByUserId に出る', async () => {
        await hooks.putRawItem(buildLegacyPendingItem({ groupId: 'group-1', userId: 'user-1' }));
        await repository.create(buildPendingInput({ groupId: 'group-2', userId: 'user-1' }));

        const pending = await repository.getPendingInvitationsByUserId('user-1');

        expect(sortedGroupIds(pending)).toEqual(['group-1', 'group-2']);
      });

      it('旧形式の PENDING 以外のメンバーシップは getPendingInvitationsByUserId に出ない', async () => {
        await hooks.putRawItem(
          buildLegacyMembershipItem({ groupId: 'group-1', userId: 'user-1', status: 'ACCEPTED' })
        );
        await hooks.putRawItem(
          buildLegacyMembershipItem({ groupId: 'group-2', userId: 'user-1', status: 'REJECTED' })
        );
        await hooks.putRawItem(buildLegacyPendingItem({ groupId: 'group-3', userId: 'user-2' }));

        expect(await repository.getPendingInvitationsByUserId('user-1')).toEqual([]);
      });

      it('旧形式の招待を update で承諾すると、書いた属性が新名になり旧名が消え、応答待ちの一覧から外れる', async () => {
        await hooks.putRawItem(buildLegacyPendingItem({ groupId: 'group-1', userId: 'user-1' }));
        await waitForTimestampAdvance();

        const updated = await repository.update('group-1', 'user-1', {
          status: 'ACCEPTED',
          respondedAt: RESPONDED_AT,
          expiresAt: null,
        });

        expect(updated).toMatchObject({
          status: 'ACCEPTED',
          respondedAt: RESPONDED_AT,
          invitedBy: 'owner-1',
          createdAt: LEGACY_CREATED_AT,
        });
        expect(updated.expiresAt).toBeUndefined();
        expect(updated.updatedAt).toBeGreaterThan(LEGACY_UPDATED_AT);

        const raw = await hooks.getRawItem('GROUP#group-1', 'MEMBER#user-1');
        expect(raw).toMatchObject({
          Status: 'ACCEPTED',
          RespondedAt: RESPONDED_AT,
          UpdatedAt: updated.updatedAt,
        });
        for (const removed of ['status', 'respondedAt', 'updatedAt', 'TTL']) {
          expect(raw).not.toHaveProperty(removed);
        }
        expect(await repository.getById('group-1', 'user-1')).toEqual(updated);
        expect(await repository.getPendingInvitationsByUserId('user-1')).toEqual([]);
      });

      it('旧形式のメンバーシップの role を update すると、Role だけが新名になり、再読み込みしても同じ Entity になる', async () => {
        await hooks.putRawItem(buildLegacyMembershipItem());

        const updated = await repository.update('group-1', 'legacy-user', { role: 'OWNER' });

        expect(updated).toMatchObject({ role: 'OWNER', status: 'ACCEPTED' });
        const raw = await hooks.getRawItem('GROUP#group-1', 'MEMBER#legacy-user');
        expect(raw).toMatchObject({ Role: 'OWNER', GSI1PK: 'USER#legacy-user' });
        expect(raw).not.toHaveProperty('role');
        expect(await repository.getById('group-1', 'legacy-user')).toEqual(updated);
      });

      it('旧形式のメンバーシップを delete できる', async () => {
        await hooks.putRawItem(buildLegacyMembershipItem());

        await repository.delete('group-1', 'legacy-user');

        expect(await repository.getById('group-1', 'legacy-user')).toBeNull();
      });

      it('deleteByGroupId は旧形式のメンバーシップも削除する', async () => {
        await hooks.putRawItem(buildLegacyMembershipItem());
        await repository.create(buildMembershipInput());

        await repository.deleteByGroupId('group-1');

        expect(await repository.getByGroupId('group-1')).toEqual([]);
        expect(await repository.getByUserId('legacy-user')).toEqual([]);
      });
    });
  });
}
