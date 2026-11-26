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

module.exports = {
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
