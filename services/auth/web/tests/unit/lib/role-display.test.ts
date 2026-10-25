/**
 * ロール表示用関数のユニットテスト
 */

import { ROLES } from '@nagiyu/common';
import { getRoleDescription, getRoleName } from '../../../src/lib/role-display';

describe('getRoleName', () => {
  it('ROLES に定義された名前を返す', () => {
    expect(getRoleName('user-manager')).toBe('ユーザー管理者');
    expect(getRoleName('admin')).toBe(ROLES.admin.name);
  });

  it('ROLES に無い ID はその ID を返す', () => {
    expect(getRoleName('legacy-role')).toBe('legacy-role');
  });

  it.each(['__proto__', 'constructor', 'toString', 'hasOwnProperty'])(
    'プロトタイプのプロパティ名 %s は ID のまま返す',
    (id) => {
      expect(getRoleName(id)).toBe(id);
    }
  );
});

describe('getRoleDescription', () => {
  it('ROLES に定義された説明を返す', () => {
    expect(getRoleDescription('user-manager')).toBe('ユーザー管理のみ可能');
  });

  it('ROLES に無い ID は undefined を返す', () => {
    expect(getRoleDescription('legacy-role')).toBeUndefined();
  });

  it.each(['__proto__', 'constructor', 'toString'])(
    'プロトタイプのプロパティ名 %s は undefined を返す',
    (id) => {
      expect(getRoleDescription(id)).toBeUndefined();
    }
  );
});
