import {
  getRoleGrantStatus,
  parseJstDateString,
  toJstDateString,
  toJstDayEndMs,
  type RoleGrant,
  type RoleGrantStatus,
} from '@nagiyu/common';
import type { GrantChanges } from '@/lib/role-grants';

/**
 * 管理画面での課金の権利の編集 (保存前の変更の保持と、API への変換)。
 *
 * 画面は変更をその場で送らず、保存前の変更として持つ。ここはその状態遷移と換算を純粋関数で担う。
 */

export const GRANT_EDITING_ERROR_MESSAGES = {
  ROLE_REQUIRED: 'ロールを選択してください',
  DATE_REQUIRED: '有効期限の日付を入力してください',
  DATE_INVALID: '有効期限の日付が正しくありません',
  DATE_NOT_FUTURE: '有効期限は今日以降の日付を指定してください',
  NOTE_TOO_LONG: 'メモは 200 文字以内で入力してください',
} as const;

/** メモ (sourceRef) の最大文字数。API の検証と合わせる */
export const GRANT_NOTE_MAX_LENGTH = 200;

/** 保存前に追加する権利 */
export type PendingAdd = {
  /** 画面内で行を識別するキー (保存しない) */
  key: string;
  roleId: string;
  /** 有効期限 (Unix ミリ秒) */
  expiresAt: number;
  sourceRef?: string;
};

/** 保存前の変更 */
export type PendingGrantChanges = {
  adds: PendingAdd[];
  /** grantId → 新しい期限 (Unix ミリ秒) */
  extends: Record<string, number>;
  /** 取り消す grantId */
  revokes: string[];
};

export const EMPTY_PENDING_GRANT_CHANGES: PendingGrantChanges = {
  adds: [],
  extends: {},
  revokes: [],
};

/**
 * `YYYY-MM-DD` を、その日の終わり (日本時間 23:59:59.999) の Unix ミリ秒へ換算する。
 *
 * @returns 換算結果。実在しない日付や形式違いは null
 */
export function jstDateToExpiresAt(date: string): number | null {
  const dayStartMs = parseJstDateString(date);
  return dayStartMs === null ? null : toJstDayEndMs(dayStartMs);
}

/** 現在時刻 (Unix ミリ秒)。画面の操作時点の判定に使う。テストで差し替えられるよう関数にしている */
export function getCurrentTimeMs(): number {
  return Date.now();
}

/** Unix ミリ秒を、日本時間の日付 (`YYYY-MM-DD`) にする */
export function expiresAtToJstDate(expiresAt: number): string {
  return toJstDateString(expiresAt);
}

/** 現在時刻の、日本時間での日付 (`YYYY-MM-DD`)。期限に選べる最初の日 */
export function getTodayJstDate(now: number): string {
  return expiresAtToJstDate(now);
}

/**
 * 期限の日付入力を検証して Unix ミリ秒にする。
 *
 * @returns 成功なら `expiresAt`、失敗ならエラーメッセージ
 */
export function parseExpiryInput(
  date: string,
  now: number
): { ok: true; expiresAt: number } | { ok: false; error: string } {
  if (date === '') {
    return { ok: false, error: GRANT_EDITING_ERROR_MESSAGES.DATE_REQUIRED };
  }
  const expiresAt = jstDateToExpiresAt(date);
  if (expiresAt === null) {
    return { ok: false, error: GRANT_EDITING_ERROR_MESSAGES.DATE_INVALID };
  }
  if (expiresAt <= now) {
    return { ok: false, error: GRANT_EDITING_ERROR_MESSAGES.DATE_NOT_FUTURE };
  }
  return { ok: true, expiresAt };
}

/** 保存前の変更が空か */
export function hasPendingGrantChanges(pending: PendingGrantChanges): boolean {
  return (
    pending.adds.length > 0 || Object.keys(pending.extends).length > 0 || pending.revokes.length > 0
  );
}

/**
 * 保存前の変更を API の `grantChanges` にする。変更がなければ undefined (送信しない)。
 */
export function buildGrantChanges(pending: PendingGrantChanges): GrantChanges | undefined {
  if (!hasPendingGrantChanges(pending)) {
    return undefined;
  }
  const changes: GrantChanges = {};
  if (pending.adds.length > 0) {
    changes.add = pending.adds.map(({ roleId, expiresAt, sourceRef }) => ({
      roleId,
      expiresAt,
      ...(sourceRef !== undefined ? { sourceRef } : {}),
    }));
  }
  const extendEntries = Object.entries(pending.extends);
  if (extendEntries.length > 0) {
    changes.extend = extendEntries.map(([grantId, expiresAt]) => ({ grantId, expiresAt }));
  }
  if (pending.revokes.length > 0) {
    changes.revoke = [...pending.revokes];
  }
  return changes;
}

/**
 * 権利の追加を保存前の変更に足す。
 *
 * メモは前後の空白を除き、空なら持たない。
 *
 * @returns 更新後の変更。入力が不正なら error
 */
export function addPendingGrant(
  pending: PendingGrantChanges,
  input: { key: string; roleId: string; date: string; sourceRef: string },
  now: number
): { ok: true; pending: PendingGrantChanges } | { ok: false; error: string } {
  if (input.roleId === '') {
    return { ok: false, error: GRANT_EDITING_ERROR_MESSAGES.ROLE_REQUIRED };
  }
  const expiry = parseExpiryInput(input.date, now);
  if (!expiry.ok) {
    return expiry;
  }
  const sourceRef = input.sourceRef.trim();
  if (sourceRef.length > GRANT_NOTE_MAX_LENGTH) {
    return { ok: false, error: GRANT_EDITING_ERROR_MESSAGES.NOTE_TOO_LONG };
  }
  const add: PendingAdd = {
    key: input.key,
    roleId: input.roleId,
    expiresAt: expiry.expiresAt,
    ...(sourceRef !== '' ? { sourceRef } : {}),
  };
  return { ok: true, pending: { ...pending, adds: [...pending.adds, add] } };
}

/**
 * 既存の権利の期限変更を保存前の変更に足す。
 *
 * 現在の期限と同じ日になる変更は、送る意味がないため持たない。
 */
export function setPendingExtend(
  pending: PendingGrantChanges,
  grant: RoleGrant,
  date: string,
  now: number
): { ok: true; pending: PendingGrantChanges } | { ok: false; error: string } {
  const expiry = parseExpiryInput(date, now);
  if (!expiry.ok) {
    return expiry;
  }
  const extendsMap = { ...pending.extends };
  if (
    grant.expiresAt !== undefined &&
    expiresAtToJstDate(grant.expiresAt) === expiresAtToJstDate(expiry.expiresAt) &&
    getRoleGrantStatus(grant, now) === 'active'
  ) {
    delete extendsMap[grant.grantId];
  } else {
    extendsMap[grant.grantId] = expiry.expiresAt;
  }
  return { ok: true, pending: { ...pending, extends: extendsMap } };
}

/** 既存の権利の取り消しを保存前の変更に足す。同じ権利の期限変更は不要になるため外す */
export function addPendingRevoke(
  pending: PendingGrantChanges,
  grantId: string
): PendingGrantChanges {
  const extendsMap = { ...pending.extends };
  delete extendsMap[grantId];
  return {
    ...pending,
    extends: extendsMap,
    revokes: pending.revokes.includes(grantId) ? pending.revokes : [...pending.revokes, grantId],
  };
}

/** 既存の権利に対する保存前の変更 (期限変更・取り消し) を元に戻す */
export function undoPendingForGrant(
  pending: PendingGrantChanges,
  grantId: string
): PendingGrantChanges {
  const extendsMap = { ...pending.extends };
  delete extendsMap[grantId];
  return {
    ...pending,
    extends: extendsMap,
    revokes: pending.revokes.filter((id) => id !== grantId),
  };
}

/** 保存前に追加した権利を取りやめる */
export function removePendingAdd(pending: PendingGrantChanges, key: string): PendingGrantChanges {
  return { ...pending, adds: pending.adds.filter((add) => add.key !== key) };
}

/** 一覧の 1 行 (保存前の変更を反映した表示用) */
export type GrantRow = {
  /** 既存の権利は grantId、追加予定は `add:` + key */
  rowKey: string;
  /** 既存の権利の ID。追加予定では undefined */
  grantId?: string;
  /** 追加予定の行の key */
  addKey?: string;
  roleId: string;
  source: RoleGrant['source'];
  /** 表示する期限 (保存前の変更を反映) */
  expiresAt?: number;
  /** 期限変更の前の期限。変更がなければ undefined */
  previousExpiresAt?: number;
  status: RoleGrantStatus;
  sourceRef?: string;
  pending: 'add' | 'extend' | 'revoke' | null;
  /** 「期限の変更」「取り消し」を出せるか (手動かつ取り消し済みでなく、取り消し予定でもない) */
  operable: boolean;
};

/**
 * 保存済みの権利と保存前の変更から、一覧の行を作る。
 *
 * 状態の判定は共通の `getRoleGrantStatus` に任せる。取り消し予定は保存前なので、状態は保存済みのまま
 * 据え置き、`pending` で区別する。
 */
export function buildGrantRows(
  grants: readonly RoleGrant[],
  pending: PendingGrantChanges,
  now: number
): GrantRow[] {
  const existing = grants.map((grant): GrantRow => {
    const extendedTo = pending.extends[grant.grantId];
    const revoking = pending.revokes.includes(grant.grantId);
    const shown = extendedTo !== undefined ? { ...grant, expiresAt: extendedTo } : grant;
    return {
      rowKey: grant.grantId,
      grantId: grant.grantId,
      roleId: grant.roleId,
      source: grant.source,
      expiresAt: shown.expiresAt,
      ...(extendedTo !== undefined ? { previousExpiresAt: grant.expiresAt } : {}),
      status: getRoleGrantStatus(shown, now),
      sourceRef: grant.sourceRef,
      pending: revoking ? 'revoke' : extendedTo !== undefined ? 'extend' : null,
      operable: grant.source === 'manual' && grant.revokedAt === undefined && !revoking,
    };
  });
  const added = pending.adds.map((add): GrantRow => ({
    rowKey: `add:${add.key}`,
    addKey: add.key,
    roleId: add.roleId,
    source: 'manual',
    expiresAt: add.expiresAt,
    status: 'active',
    sourceRef: add.sourceRef,
    pending: 'add',
    operable: false,
  }));
  return [...existing, ...added];
}
