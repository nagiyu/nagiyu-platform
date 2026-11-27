/**
 * InMemoryAuthUserRoleSourceReader の単体テスト
 */

import { InMemoryAuthUserRoleSourceReader } from '../../../src/auth-users/in-memory-reader.js';

describe('InMemoryAuthUserRoleSourceReader', () => {
  it('入れた項目のロールと権利を返す', async () => {
    const reader = new InMemoryAuthUserRoleSourceReader();
    reader.putItem({
      userId: 'user-1',
      Email: 'a@example.com',
      Roles: ['admin'],
      RoleGrants: [
        {
          grantId: 'g1',
          roleId: 'livetalk-plus',
          source: 'manual',
          createdAt: 1,
          updatedAt: 2,
        },
      ],
    });

    const result = await reader.getRoleSources('user-1');

    expect(result?.roles).toEqual(['admin']);
    expect(result?.roleGrants).toHaveLength(1);
    expect(result).not.toHaveProperty('email');
  });

  it('旧名 roles を読み、権利がなければ空配列', async () => {
    const reader = new InMemoryAuthUserRoleSourceReader();
    reader.putItem({ userId: 'user-1', roles: ['legacy'] });

    await expect(reader.getRoleSources('user-1')).resolves.toEqual({
      roles: ['legacy'],
      roleGrants: [],
    });
  });

  it('ユーザーがいなければ null', async () => {
    await expect(new InMemoryAuthUserRoleSourceReader().getRoleSources('x')).resolves.toBeNull();
  });
});
