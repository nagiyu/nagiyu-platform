import {
  buildNotificationMessage,
  buildCriticalNotificationMessage,
} from '../../../src/notification/message-builder.js';

/** テスト用キャラ表示名 */
const HIYORI_NAME = '桃瀬ひより';
const AGEHA_NAME = '早瀬アゲハ';

describe('buildNotificationMessage', () => {
  describe('veryLong', () => {
    it('veryLong → VERY_LONG_BODY からピックする（ひより）', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'veryLong', characterDisplayName: HIYORI_NAME },
        0
      );
      expect(msg.title).toBe(`${HIYORI_NAME}より`);
      expect(msg.body.length).toBeGreaterThan(0);
    });

    it('veryLong → VERY_LONG_BODY からピックする（アゲハ）', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'veryLong', characterDisplayName: AGEHA_NAME },
        0
      );
      expect(msg.title).toBe(`${AGEHA_NAME}より`);
      expect(msg.body.length).toBeGreaterThan(0);
    });

    it('seed が変わっても title/body の形式は維持される', () => {
      const msg0 = buildNotificationMessage(
        { toneBucket: 'veryLong', characterDisplayName: HIYORI_NAME },
        0
      );
      const msg1 = buildNotificationMessage(
        { toneBucket: 'veryLong', characterDisplayName: HIYORI_NAME },
        1
      );
      expect(msg0.title).toBe(`${HIYORI_NAME}より`);
      expect(msg1.title).toBe(`${HIYORI_NAME}より`);
    });

    it('knowledgeTopic がある場合も veryLong テンプレートを使う', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'veryLong', knowledgeTopic: 'TypeScript', characterDisplayName: HIYORI_NAME },
        0
      );
      // veryLong は topic なし固定テンプレートを使う
      expect(msg.body).not.toContain('TypeScript');
    });
  });

  describe('long', () => {
    it('long・topic なし → LONG_BODY からピックする（ひより）', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'long', characterDisplayName: HIYORI_NAME },
        0
      );
      expect(msg.title).toBe(`${HIYORI_NAME}より`);
      expect(msg.body).toMatch(/久しぶり/);
    });

    it('long・topic なし → LONG_BODY からピックする（アゲハ）', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'long', characterDisplayName: AGEHA_NAME },
        0
      );
      expect(msg.title).toBe(`${AGEHA_NAME}より`);
      expect(msg.body).toMatch(/久しぶり/);
    });

    it('long・topic あり → LONG_BODY_WITH_TOPIC を使う', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'long', knowledgeTopic: 'React', characterDisplayName: HIYORI_NAME },
        0
      );
      expect(msg.body).toContain('React');
    });
  });

  describe('normal', () => {
    it('normal・topic なし → NORMAL_BODY_WITHOUT_TOPIC からピックする（ひより）', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'normal', characterDisplayName: HIYORI_NAME },
        0
      );
      expect(msg.title).toBe(`${HIYORI_NAME}より`);
      expect(msg.body.length).toBeGreaterThan(0);
      // topic なし固定テンプレートは topic 文字列を含まない
      expect(msg.body).not.toMatch(/について/);
    });

    it('normal・topic なし → NORMAL_BODY_WITHOUT_TOPIC からピックする（アゲハ）', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'normal', characterDisplayName: AGEHA_NAME },
        0
      );
      expect(msg.title).toBe(`${AGEHA_NAME}より`);
      expect(msg.body.length).toBeGreaterThan(0);
    });

    it('normal・topic あり → NORMAL_BODY_WITH_TOPIC を使う', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'normal', knowledgeTopic: 'Python', characterDisplayName: HIYORI_NAME },
        0
      );
      expect(msg.body).toContain('Python');
    });

    it('seed が異なると異なるテンプレートが選ばれる可能性がある', () => {
      // 少なくとも同じ toneBucket で同じ seed は同じメッセージ
      const a = buildNotificationMessage(
        { toneBucket: 'normal', characterDisplayName: HIYORI_NAME },
        42
      );
      const b = buildNotificationMessage(
        { toneBucket: 'normal', characterDisplayName: HIYORI_NAME },
        42
      );
      expect(a.body).toBe(b.body);
    });
  });

  describe('characterDisplayName の差し込み', () => {
    it('ひより名がタイトルに反映される', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'normal', characterDisplayName: HIYORI_NAME },
        0
      );
      expect(msg.title).toBe('桃瀬ひよりより');
    });

    it('アゲハ名がタイトルに反映される', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'normal', characterDisplayName: AGEHA_NAME },
        0
      );
      expect(msg.title).toBe('早瀬アゲハより');
    });

    it('タイトルに旧ハードコード「ひより」が残らない（アゲハで検証）', () => {
      const msg = buildNotificationMessage(
        { toneBucket: 'veryLong', characterDisplayName: AGEHA_NAME },
        0
      );
      // アゲハのタイトルに「ひより」が含まれないこと
      expect(msg.title).not.toContain('ひより');
    });
  });

  describe('seed のデフォルト値', () => {
    it('seed 省略時も呼び出せる（Date.now() が使われる）', () => {
      const msg = buildNotificationMessage({
        toneBucket: 'normal',
        characterDisplayName: HIYORI_NAME,
      });
      expect(msg.title).toBeDefined();
      expect(msg.body).toBeDefined();
    });
  });
});

describe('buildCriticalNotificationMessage', () => {
  it('タイトルに「重要」とひより名を含む', () => {
    const msg = buildCriticalNotificationMessage('パスワード変更', HIYORI_NAME);
    expect(msg.title).toContain('重要');
    expect(msg.title).toContain(HIYORI_NAME);
  });

  it('タイトルにアゲハ名を含む', () => {
    const msg = buildCriticalNotificationMessage('パスワード変更', AGEHA_NAME);
    expect(msg.title).toContain(AGEHA_NAME);
    expect(msg.title).toContain('重要');
  });

  it('アゲハのタイトルに「ひより」が含まれない', () => {
    const msg = buildCriticalNotificationMessage('何か重要なこと', AGEHA_NAME);
    expect(msg.title).not.toContain('ひより');
  });

  it('本文にトピックを含む', () => {
    const msg = buildCriticalNotificationMessage('健康診断', HIYORI_NAME);
    expect(msg.body).toContain('健康診断');
  });

  it('末尾に句点がある Topic は正規化される', () => {
    const msg = buildCriticalNotificationMessage('飲み物の新作。', HIYORI_NAME);
    expect(msg.body).toContain('飲み物の新作');
    expect(msg.body).not.toMatch(/。について/);
  });

  it('長い説明文 Topic でも文が崩壊しない', () => {
    const longTopic =
      '日本の食べ物（特にスイーツ・コンビニ新商品）の最新トレンドを検索しました。メーカーの新作、コラボ商品、新食感菓子など、春〜初夏にかけての動きを中心に調べたよ。';
    const msg = buildCriticalNotificationMessage(longTopic, HIYORI_NAME);
    // 末尾句点が除去されて「〜調べたよ」で終わる文字列が Topic として埋め込まれる
    expect(msg.body).not.toMatch(/。について/);
  });
});

describe('normalizeKnowledgeTopic（通知テンプレート堅牢化）', () => {
  it('normal・topic 末尾句点が除去される', () => {
    const msg = buildNotificationMessage(
      { toneBucket: 'normal', knowledgeTopic: 'コーヒーの新作。', characterDisplayName: HIYORI_NAME },
      0
    );
    expect(msg.body).not.toMatch(/。について|。のこと/);
    expect(msg.body).toContain('コーヒーの新作');
  });

  it('long・topic 末尾句点が除去される', () => {
    const msg = buildNotificationMessage(
      { toneBucket: 'long', knowledgeTopic: 'カフェラテ。', characterDisplayName: HIYORI_NAME },
      0
    );
    expect(msg.body).toContain('カフェラテ');
    expect(msg.body).not.toMatch(/。のこと/);
  });
});
