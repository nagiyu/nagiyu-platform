/** 空白のみの文字列を空として扱うため trim 後の長さで判定する。 */
export function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/** グループ名の最大文字数 (trim 後)。 */
const GROUP_NAME_MAX_LENGTH = 100;

/**
 * グループ名を検証し、保存すべき trim 後の名前を返す。
 *
 * 作成と変更で判定がずれると、同じ入力が片方だけ通るため 1 か所で判定する。
 *
 * @returns 1〜100 文字 (trim 後) なら trim 後の名前、不正なら null
 */
export function normalizeGroupName(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const name = value.trim();
  return name.length > 0 && name.length <= GROUP_NAME_MAX_LENGTH ? name : null;
}
