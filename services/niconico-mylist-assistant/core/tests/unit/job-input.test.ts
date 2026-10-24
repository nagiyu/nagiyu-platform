import {
  JOB_INPUT_ENV_NAMES,
  JOB_INPUT_ERROR_MESSAGES,
  parseJobInput,
  toJobEnvironment,
} from '../../src/job-input/job-input';
import type { MylistRegistrationJobInput } from '../../src/job-input/job-input';

const INPUT: MylistRegistrationJobInput = {
  userId: 'user-1',
  videoIds: ['sm1', 'sm2'],
  mylistName: 'マイリスト',
  encryptedUserSession: '{"ciphertext":"c","iv":"i","authTag":"a"}',
};

const DEFAULT_NAME = '既定のマイリスト名';

function toRecord(input: MylistRegistrationJobInput): Record<string, string | undefined> {
  return Object.fromEntries(toJobEnvironment(input).map(({ name, value }) => [name, value]));
}

describe('toJobEnvironment', () => {
  it('起動ごとの入力 4 つだけを name / value の配列にする', () => {
    expect(toJobEnvironment(INPUT)).toEqual([
      { name: 'USER_ID', value: 'user-1' },
      { name: 'VIDEO_IDS', value: '["sm1","sm2"]' },
      { name: 'MYLIST_NAME', value: 'マイリスト' },
      { name: 'ENCRYPTED_USER_SESSION', value: INPUT.encryptedUserSession },
    ]);
  });

  it('ジョブ定義で設定する値 (テーブル名・リージョン) は含めない', () => {
    const names = toJobEnvironment(INPUT).map((variable) => variable.name);
    expect(names).not.toContain('DYNAMODB_TABLE_NAME');
    expect(names).not.toContain('AWS_REGION');
    expect([...names].sort()).toEqual(Object.values(JOB_INPUT_ENV_NAMES).sort());
  });
});

describe('parseJobInput', () => {
  it('toJobEnvironment の出力を同じ入力へ読み戻せる', () => {
    const result = parseJobInput(toRecord(INPUT), { defaultMylistName: DEFAULT_NAME });
    expect(result).toEqual(INPUT);
  });

  it.each([undefined, ''])('MYLIST_NAME が %p のときは既定名を使う', (mylistName) => {
    const env = { ...toRecord(INPUT), MYLIST_NAME: mylistName };
    const result = parseJobInput(env, { defaultMylistName: DEFAULT_NAME });
    expect(result.mylistName).toBe(DEFAULT_NAME);
  });

  it.each(['USER_ID', 'ENCRYPTED_USER_SESSION'])('%s が未設定のときは例外を投げる', (key) => {
    const env = { ...toRecord(INPUT), [key]: undefined };
    expect(() => parseJobInput(env, { defaultMylistName: DEFAULT_NAME })).toThrow(
      JOB_INPUT_ERROR_MESSAGES.INVALID_PARAMETERS
    );
  });

  it.each([undefined, '[]'])('VIDEO_IDS が %p のときは例外を投げる', (videoIds) => {
    const env = { ...toRecord(INPUT), VIDEO_IDS: videoIds };
    expect(() => parseJobInput(env, { defaultMylistName: DEFAULT_NAME })).toThrow(
      JOB_INPUT_ERROR_MESSAGES.INVALID_PARAMETERS
    );
  });

  it.each(['not-json', '{"a":1}', '[1,2]', '"sm1"'])(
    'VIDEO_IDS が %p のときは形式不正の例外を投げる',
    (videoIds) => {
      const env = { ...toRecord(INPUT), VIDEO_IDS: videoIds };
      expect(() => parseJobInput(env, { defaultMylistName: DEFAULT_NAME })).toThrow(
        JOB_INPUT_ERROR_MESSAGES.INVALID_VIDEO_IDS
      );
    }
  );

  it('JSON として壊れた VIDEO_IDS は原因を cause に保持する', () => {
    const env = { ...toRecord(INPUT), VIDEO_IDS: 'not-json' };
    let caught: unknown;
    try {
      parseJobInput(env, { defaultMylistName: DEFAULT_NAME });
    } catch (error) {
      caught = error;
    }
    expect((caught as Error).cause).toBeInstanceOf(SyntaxError);
  });

  it('エラーメッセージが日本語である', () => {
    Object.values(JOB_INPUT_ERROR_MESSAGES).forEach((message) => {
      expect(message).toMatch(/[ぁ-んァ-ヶ一-龯]/);
    });
  });
});
