import { SECRET_NAMES } from '../../src/utils/secrets';

/**
 * 本テストは「シークレット名が意図せず変わっていないこと」を守るためのもの。
 *
 * SECRET_NAMES の文字列を変更すると `AWS::SecretsManager::Secret` の `Name` が
 * 変わり、CloudFormation がリソースを置換する。新しいシークレットは PLACEHOLDER で
 * 作成されて実値を引き継がないため、値を手動で再投入するまでアプリが壊れる。
 * しかもコンテナは PLACEHOLDER でも起動するため CI はグリーンのままになる。
 * その事故を検知できる唯一の場所がこのテストなので、期待値はリテラルで固定する。
 */
describe('SECRET_NAMES', () => {
  it('Auth サービスのシークレット名を生成する', () => {
    expect(SECRET_NAMES.AUTH_GOOGLE_OAUTH('dev')).toBe('nagiyu-auth-google-oauth-dev');
    expect(SECRET_NAMES.AUTH_GOOGLE_OAUTH('prod')).toBe('nagiyu-auth-google-oauth-prod');
    expect(SECRET_NAMES.AUTH_NEXTAUTH('dev')).toBe('nagiyu-auth-nextauth-secret-dev');
    expect(SECRET_NAMES.AUTH_NEXTAUTH('prod')).toBe('nagiyu-auth-nextauth-secret-prod');
  });

  it('LiveTalk の VAPID シークレット名を生成する', () => {
    expect(SECRET_NAMES.LIVETALK_VAPID('dev')).toBe('nagiyu-livetalk-vapid-dev');
    expect(SECRET_NAMES.LIVETALK_VAPID('prod')).toBe('nagiyu-livetalk-vapid-prod');
  });

  it('LiveTalk の OpenAI API キーはパス形式の既存名を維持する（Issue #3761 で改名を見送り）', () => {
    expect(SECRET_NAMES.LIVETALK_OPENAI_API_KEY('dev')).toBe('/nagiyu/livetalk/dev/openai/api-key');
    expect(SECRET_NAMES.LIVETALK_OPENAI_API_KEY('prod')).toBe(
      '/nagiyu/livetalk/prod/openai/api-key'
    );
  });
});
