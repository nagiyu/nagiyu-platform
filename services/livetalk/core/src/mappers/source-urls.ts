import { readOptionalField, validateArrayField } from '@nagiyu/aws';

function isString(value: unknown): value is string {
  return typeof value === 'string';
}

/**
 * 出典 URL のリストを読む。
 *
 * 属性がなければ空のリストにする。あって、リストでない・文字列以外の要素を含むときは
 * 破損なので例外にする。
 *
 * @throws InvalidEntityDataError 値があって不正なとき
 */
export function readSourceUrls(item: Record<string, unknown>): string[] {
  return (
    readOptionalField(item, 'SourceUrls', (value, name) =>
      validateArrayField(value, name, { isElement: isString })
    ) ?? []
  );
}
