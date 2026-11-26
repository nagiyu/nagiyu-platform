const path = require('path');

/**
 * 公開版の @nagiyu/* (ESM) をサービスの Jest (CJS) で読むための共通設定。
 *
 * - resolver: @nagiyu/* を `import` 条件で解決する
 * - libsDistPattern: @nagiyu/* の dist 配下の JS を変換対象にする
 *   (ワークスペース参照のときは node_modules/@nagiyu/<lib> が libs/<lib> へのシンボリックリンクになり、
 *   Jest は realpath である libs/<lib>/dist/... で見るため、node_modules を含まない形も対象にする)
 */
const libsDistPattern = '^.+/(node_modules/@nagiyu/[^/]+|libs/[^/]+)/dist/.+\\.jsx?$';

/**
 * next/jest が作る設定を、公開版の @nagiyu/* も変換する形にする。
 *
 * next/jest は node_modules を変換対象から外し、カスタム設定の transformIgnorePatterns は後ろに足すだけになる
 * (どれか 1 つに一致すれば除外される)。そのため、解決済みの設定のうち node_modules 全体を除外するパターンだけを、
 * @nagiyu/* を除いた形に差し替える。変換は next/jest 既定の SWC が行う。
 *
 * @param {() => Promise<import('jest').Config>} createConfig - `nextJest(...)(config)` の戻り値
 * @returns {() => Promise<import('jest').Config>}
 */
const withNagiyuLibs = (createConfig) => async () => {
  const resolved = await createConfig();
  return {
    ...resolved,
    transformIgnorePatterns: (resolved.transformIgnorePatterns ?? []).map((pattern) =>
      pattern.startsWith('/node_modules/(?!')
        ? pattern.replace('/node_modules/(?!', '/node_modules/(?!@nagiyu/)(?!')
        : pattern
    ),
  };
};

module.exports = {
  withNagiyuLibs,
  resolver: path.join(__dirname, 'nagiyu-resolver.cjs'),
  libsDistPattern,
  // ts-jest 用。ESM の JS を CJS に変換する (allowJs が無いと JS を処理できない)
  transform: {
    '^.+\\.tsx?$': 'ts-jest',
    [libsDistPattern]: ['ts-jest', { tsconfig: { allowJs: true, module: 'commonjs' } }],
  },
  // 既定の node_modules 除外から、@nagiyu/* だけ外す
  transformIgnorePatterns: ['/node_modules/(?!@nagiyu/)'],
};
