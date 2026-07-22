import { buildConsolidatePrompt } from '../../../src/usecases/consolidate.prompt.js';

describe('buildConsolidatePrompt', () => {
  it('system + user の 2 メッセージを返す', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [],
    });

    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('system');
    expect(messages[1].role).toBe('user');
  });

  it('ユーザーとキャラ両方の発話を含む会話で、user メッセージに話者ラベルが正しく付く', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [
        { role: 'user', text: '最近せいろ蒸しにハマってるんだ' },
        {
          role: 'assistant',
          text: '野菜は蒸すと甘みが増すよ！仕上げは塩とオリーブオイルがおすすめ',
        },
      ],
      webRaws: [],
    });

    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('ユーザー: 最近せいろ蒸しにハマってるんだ');
    expect(userMessage?.content).toContain(
      '早瀬アゲハ: 野菜は蒸すと甘みが増すよ！仕上げは塩とオリーブオイルがおすすめ'
    );
  });

  it('system メッセージにキャラ発話を selfFacts に入れない旨のガード指示が含まれる', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [],
    });

    const systemMessage = messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain(
      '「早瀬アゲハ:」（キャラ自身）の発話は、意見・見解・推し・提案・一般知識を'
    );
    expect(systemMessage?.content).toContain('selfFacts に絶対に入れないでください。');
  });

  it('system メッセージに一般知識・第三者の意見を selfFacts に入れない旨のガード指示が含まれる', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [],
    });

    const systemMessage = messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain(
      '一般知識・世間知識（料理のコツや目安などの一般論を含む）、第三者の意見も selfFacts に入れないで'
    );
  });

  it('system メッセージに webRaws が空のとき webFacts を空にする旨の指示が含まれる', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [],
    });

    const systemMessage = messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('Web 取得生データが「なし」の場合、webFacts は');
    expect(systemMessage?.content).toContain('必ず空配列にしてください。');
  });

  it('既存 Topic 候補が user メッセージの candidateSection に反映される', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [
        {
          topicId: 'topic-1',
          subject: '蒸し料理',
          category: '料理',
          canonicalSummary: 'ユーザーはせいろ蒸しが好き',
        },
      ],
      newMessages: [],
      webRaws: [],
    });

    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('topic-1');
    expect(userMessage?.content).toContain('蒸し料理');
    expect(userMessage?.content).toContain('ユーザーはせいろ蒸しが好き');
  });

  it('候補 Topic が空なら candidateSection に「なし」と表示する', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [],
    });

    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('候補 Topic 一覧（埋め込み近傍で絞り込み済み）：\nなし');
  });

  it('webRaws が user メッセージの webRawSection に反映される', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [
        {
          query: 'せいろ蒸し コツ',
          rawText: 'せいろ蒸しは強火で蒸気を立ててから使う',
          sourceUrls: ['https://example.com/steam'],
          origin: 'auto',
        },
      ],
    });

    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('せいろ蒸し コツ');
    expect(userMessage?.content).toContain('せいろ蒸しは強火で蒸気を立ててから使う');
    expect(userMessage?.content).toContain('https://example.com/steam');
  });

  it('requestIndex 付きの webRaws は [依頼 #N] 依頼文・依頼日付きでレンダリングされる（甲-1: index 参照方式）', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [
        {
          query: '最新アニメ情報',
          rawText: '今期は〇〇が人気です',
          sourceUrls: [],
          origin: 'request',
          requestText: '最新アニメ情報を調べて',
          requestedAtLabel: '7月10日',
          requestIndex: 0,
        },
      ],
    });

    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('[依頼 #0]');
    expect(userMessage?.content).toContain('依頼文: "最新アニメ情報を調べて"');
    expect(userMessage?.content).toContain('依頼日: 7月10日');
  });

  it('origin === "request" でも requestIndex が undefined（今回バッチ非採用）なら [依頼 #N] が付かない', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [
        {
          query: '最新アニメ情報',
          rawText: '今期は〇〇が人気です',
          sourceUrls: [],
          origin: 'request',
          requestText: '最新アニメ情報を調べて',
          requestedAtLabel: '7月10日',
        },
      ],
    });

    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).not.toContain('[依頼');
  });

  it('origin === "auto"/"stale" の webRaws には [依頼 #N] が付かない', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [
        {
          query: 'クエリA',
          rawText: '内容A',
          sourceUrls: [],
          origin: 'auto',
        },
        {
          query: 'クエリB',
          rawText: '内容B',
          sourceUrls: [],
          origin: 'stale',
        },
      ],
    });

    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).not.toContain('[依頼');
  });

  it('system メッセージに sourceRequestIndices を番号で返す指示・捏造禁止の指示が含まれる（甲-1: index 参照方式）', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [],
    });

    const systemMessage = messages.find((m) => m.role === 'system');
    expect(systemMessage?.content).toContain('sourceRequestIndices に入れてください');
    expect(systemMessage?.content).toContain(
      '番号以外（依頼文そのものの文字列など）は返さないでください。'
    );
    expect(systemMessage?.content).toContain('憶測で番号を作らないでください。');
  });

  it('newMessages・webRaws が空なら「なし」と表示する', () => {
    const messages = buildConsolidatePrompt({
      characterName: '早瀬アゲハ',
      candidateTopics: [],
      newMessages: [],
      webRaws: [],
    });

    const userMessage = messages.find((m) => m.role === 'user');
    expect(userMessage?.content).toContain('新しい会話：\nなし');
    expect(userMessage?.content).toContain('新しい Web 取得生データ：\nなし');
  });
});
