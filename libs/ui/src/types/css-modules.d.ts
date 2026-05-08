/**
 * CSS Modules の型宣言。
 *
 * `*.module.css` を import すると、クラス名 → ハッシュ化された文字列の
 * マップが返る。各キーは任意の文字列のため、緩く `Record<string, string>` で扱う。
 */
declare module '*.module.css' {
  const classes: Record<string, string>;
  export default classes;
}
