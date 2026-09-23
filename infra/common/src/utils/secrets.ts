import { Environment } from '../types/environment';

/**
 * Secrets Manager のシークレット名レジストリ。
 *
 * シークレット名は「作った側」だけでなく「読む側」からも参照される。たとえば
 * `AUTH_NEXTAUTH` は Auth サービスが作成し、LiveTalk / Admin / Stock Tracker /
 * Niconico / Share Together が読む。各スタックがテンプレートリテラルを個別に
 * 持つと、作成側が名前を変えても読む側はコンパイルエラーにならず、
 * **タスク起動時に初めて壊れる**（型でも lint でも検出できない）。
 *
 * そのため SSM_PARAMETERS と同じく、名前は本レジストリに集約して単一の
 * 出所を持たせる。サービスを跨いで参照されるものを優先的にここへ置く。
 *
 * 注意: 本レジストリは既存のシークレット名をそのまま表現している。
 * ここの文字列を変更すると `AWS::SecretsManager::Secret` の `Name` が変わり、
 * CloudFormation はリソースを**置換**する（`UpdateReplacePolicy: Delete`）。
 * 新しいシークレットは CDK 定義どおり PLACEHOLDER で作成され、実値は
 * 引き継がれないため、値を手動で再投入するまでアプリが壊れる。しかも
 * コンテナは PLACEHOLDER でも正常に起動するため CI はグリーンのままで、
 * 実際の API 呼び出しで初めて失敗する。**安易に変更しないこと。**
 */
export const SECRET_NAMES = {
  /** Google OAuth クライアント情報（Auth サービスが作成・使用） */
  AUTH_GOOGLE_OAUTH: (env: Environment) => `nagiyu-auth-google-oauth-${env}`,

  /**
   * NextAuth.js の JWT 署名鍵（Auth サービスが作成）。
   * 認証を利用する各サービスが横断的に読むため、特に単一の出所が重要。
   */
  AUTH_NEXTAUTH: (env: Environment) => `nagiyu-auth-nextauth-secret-${env}`,

  /** LiveTalk の Web Push 用 VAPID 鍵ペア（`{"publicKey":"...","privateKey":"..."}` の JSON） */
  LIVETALK_VAPID: (env: Environment) => `nagiyu-livetalk-vapid-${env}`,

  /**
   * LiveTalk の OpenAI API キー。
   *
   * 他のシークレットが `nagiyu-{service}-{purpose}-{env}` のダッシュ形式なのに対し、
   * これだけスラッシュ区切りのパス形式になっている。命名を揃えたくなるが、
   * 上記のとおり名前の変更はリソース置換を伴い、値の再投入までアプリが
   * サイレントに壊れる。得られるのは見た目の一貫性だけなので、
   * **意図的に現状の名前を維持している**（Issue #3761 で検討のうえ見送り）。
   */
  LIVETALK_OPENAI_API_KEY: (env: Environment) => `/nagiyu/livetalk/${env}/openai/api-key`,
} as const;
