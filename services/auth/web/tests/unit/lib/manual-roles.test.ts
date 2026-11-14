import { PAID_ROLES, VALID_ROLES } from '@nagiyu/common';
import {
  MANUAL_ROLES,
  MANUAL_ROLE_ERROR_MESSAGES,
  getManualRolesErrorMessage,
  validateManualRoles,
} from '../../../src/lib/manual-roles';

describe('MANUAL_ROLES', () => {
  it('有効なロールから有料の段のロールを除いたものである', () => {
    expect(MANUAL_ROLES).toEqual(VALID_ROLES.filter((role) => !PAID_ROLES.includes(role)));
    for (const paid of PAID_ROLES) {
      expect(MANUAL_ROLES).not.toContain(paid);
    }
    expect(MANUAL_ROLES).toContain('admin');
    expect(MANUAL_ROLES).toContain('quick-clip-unlimited');
  });
});

describe('validateManualRoles', () => {
  it('問題がなければ空の結果を返す', () => {
    expect(validateManualRoles(['admin', 'user-manager'])).toEqual({
      duplicates: [],
      paidRoles: [],
    });
  });

  it('重複したロールを 1 回ずつ返す', () => {
    expect(
      validateManualRoles(['admin', 'admin', 'admin', 'user-manager', 'user-manager'])
    ).toEqual({ duplicates: ['admin', 'user-manager'], paidRoles: [] });
  });

  it('有料の段のロールを返す', () => {
    expect(validateManualRoles(['admin', 'quick-clip-pro', 'livetalk-standard'])).toEqual({
      duplicates: [],
      paidRoles: ['quick-clip-pro', 'livetalk-standard'],
    });
  });

  it('未知のロールは対象にしない', () => {
    expect(validateManualRoles(['no-such-role'])).toEqual({ duplicates: [], paidRoles: [] });
  });
});

describe('getManualRolesErrorMessage', () => {
  it('問題がなければ null を返す', () => {
    expect(getManualRolesErrorMessage({ duplicates: [], paidRoles: [] })).toBeNull();
  });

  it('重複したロールを示す', () => {
    expect(getManualRolesErrorMessage({ duplicates: ['admin'], paidRoles: [] })).toBe(
      `${MANUAL_ROLE_ERROR_MESSAGES.DUPLICATE_ROLES}: admin`
    );
  });

  it('有料の段のロールを示す', () => {
    expect(
      getManualRolesErrorMessage({
        duplicates: [],
        paidRoles: ['quick-clip-pro', 'quick-clip-standard'],
      })
    ).toBe(
      `${MANUAL_ROLE_ERROR_MESSAGES.PAID_ROLES_NOT_ALLOWED}: quick-clip-pro, quick-clip-standard`
    );
  });

  it('両方あるときは重複を先に示す', () => {
    expect(
      getManualRolesErrorMessage({ duplicates: ['admin'], paidRoles: ['quick-clip-pro'] })
    ).toContain(MANUAL_ROLE_ERROR_MESSAGES.DUPLICATE_ROLES);
  });
});
