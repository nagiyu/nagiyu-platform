/**
 * LiveTalk 専用 プライバシーポリシーテキストデータ
 *
 * バージョン: 1.0.0
 * 施行日: 2026年5月26日
 */

export interface SubContent {
  subContent: string;
  subItems?: string[];
}

export interface PolicyContent {
  mainContent: string;
  subContents?: SubContent[];
  link?: string;
}

export interface PolicySection {
  title: string;
  contents: PolicyContent[];
}

export const LIVETALK_PRIVACY_VERSION = '1.0.0';

export const liveTalkPrivacySections: PolicySection[] = [
  {
    title: '第1条（収集する情報の種類）',
    contents: [
      {
        mainContent:
          '本サービスは、以下の情報を収集します。',
        subContents: [
          {
            subContent: 'Google アカウント情報',
            subItems: [
              'Google アカウントのメールアドレス',
              'Google アカウントに設定された表示名',
              'Google アカウントのプロフィール画像 URL',
              'Google が発行するユーザー識別子（sub）',
            ],
          },
          {
            subContent: '会話履歴',
            subItems: [
              'ユーザーが入力したテキストメッセージ',
              'AI キャラクター「桃瀬ひより」からの返答テキスト',
              'メッセージの送受信日時',
            ],
          },
          {
            subContent: '音声合成データ',
            subItems: [
              '音声合成のために処理するテキスト（VOICEVOX へのインプット）',
              '音声設定パラメータ（話速・音量・イントネーション等）',
            ],
          },
          {
            subContent: 'AI 記憶データ',
            subItems: [
              'Tier A（永続記憶）: ユーザーの重要なプロフィール情報・長期的な関係性に関するデータ',
              'Tier B（中期記憶、180日）: ユーザーの嗜好・過去の話題・関心事等',
              'Tier C（短期記憶、30日）: 直近の会話コンテキスト・一時的な状態情報',
            ],
          },
          {
            subContent: 'プロフィール情報',
            subItems: [
              'ユーザーが設定したニックネーム',
              'ユーザーが登録した誕生日',
              'ユーザーが設定したその他のプロフィール項目',
            ],
          },
        ],
      },
    ],
  },
  {
    title: '第2条（情報の利用目的）',
    contents: [
      {
        mainContent:
          '収集した情報は、以下の目的のために利用します。',
        subContents: [
          {
            subContent: 'Google アカウント情報の利用目的',
            subItems: [
              'ユーザーの認証およびアカウント管理',
              'ユーザーの識別とデータの紐付け',
            ],
          },
          {
            subContent: '会話履歴の利用目的',
            subItems: [
              'AI キャラクターの応答生成（OpenAI または Anthropic API への送信を伴います）',
              '会話の文脈を保持するためのコンテキスト管理',
              '注: 会話履歴はサービス改善・機械学習等には使用しません',
            ],
          },
          {
            subContent: '音声合成データの利用目的',
            subItems: [
              'AI キャラクターの音声生成（VOICEVOX による処理、外部送信なし）',
            ],
          },
          {
            subContent: 'AI 記憶データの利用目的',
            subItems: [
              'AI キャラクターがユーザーを記憶し、継続的でパーソナライズされた会話体験を提供するため',
            ],
          },
          {
            subContent: 'プロフィール情報の利用目的',
            subItems: [
              'AI キャラクターがユーザーに適した会話・演出を行うため',
              'ユーザー体験のパーソナライズ',
            ],
          },
        ],
      },
    ],
  },
  {
    title: '第3条（情報の保管・削除）',
    contents: [
      {
        mainContent:
          '収集した情報は、以下の期間保管し、期間経過後に自動的に削除されます。',
        subContents: [
          {
            subContent: '各データの保管期間',
            subItems: [
              '会話履歴: 90日（TTL による自動削除）',
              'Tier A 記憶データ: 永続（明示的なリセットまたはアカウント削除まで）',
              'Tier B 記憶データ: 180日（TTL による自動削除）',
              'Tier C 記憶データ: 30日（TTL による自動削除）',
              'プロフィール情報: アカウントが有効な期間中',
              'Google アカウント情報: アカウントが有効な期間中',
            ],
          },
        ],
      },
      {
        mainContent:
          'アカウントを削除した場合、上記のデータはすべて削除されます。ただし、法令上の保存義務がある場合、またはサービスの安全管理上必要なデータ（セーフティログを含む）については、別途定める保管ポリシーに従います。',
      },
    ],
  },
  {
    title: '第4条（外部サービスの利用）',
    contents: [
      {
        mainContent:
          '本サービスは、AI の応答生成のために以下の外部サービスを利用しており、ユーザーの会話テキストが送信されます。',
        subContents: [
          {
            subContent: 'OpenAI または Anthropic（どちらを使用するかはシステムの設定により異なります）',
            subItems: [
              '送信データ: ユーザーの会話テキスト、AI 記憶データの一部、システムプロンプト',
              '利用目的: AI キャラクターの応答テキスト生成',
              'OpenAI プライバシーポリシー: https://openai.com/ja/policies/privacy-policy/',
              'Anthropic プライバシーポリシー: https://www.anthropic.com/legal/privacy',
            ],
          },
        ],
      },
      {
        mainContent:
          '音声合成には VOICEVOX を使用しています。VOICEVOX は当社のサーバー（Amazon ECS）内でローカルに動作しており、音声合成データが外部の第三者に送信されることはありません。',
      },
      {
        mainContent:
          '上記以外の第三者にユーザーの個人情報を提供することはありません。ただし、法令に基づく開示要求があった場合はこの限りではありません。',
      },
    ],
  },
  {
    title: '第5条（セーフティログの取り扱い）',
    contents: [
      {
        mainContent:
          '本サービスは、ユーザーとの会話において自殺・自傷・他者への危害等の危機的な内容を検出した場合、セーフティイベントログ（SafetyEvent）を記録します。',
      },
      {
        mainContent:
          'セーフティログは、通常の会話データとは物理的に分離された別の保管領域に保存されます。',
        subContents: [
          {
            subContent: 'セーフティログの取り扱い',
            subItems: [
              '保管場所: 通常の会話データとは別の保護された領域',
              '利用目的: ユーザー安全の確保、セーフティ機能の改善、必要に応じた人間によるレビュー',
              'アクセス権限: 安全管理担当者のみ（厳格なアクセス制限を適用）',
              '保管期間: 法令上の要件および安全管理上の必要性に基づき決定',
            ],
          },
        ],
      },
      {
        mainContent:
          'セーフティログは、当社の担当者が状況を確認・レビューできる状態で保管されます。これはユーザーの安全を守るための措置であり、目的外に利用することはありません。',
      },
      {
        mainContent:
          'セーフティログに関するデータ削除請求については、法令上の義務や安全管理上の理由から対応できない場合があります。詳細はお問い合わせください。',
      },
    ],
  },
  {
    title: '第6条（ユーザーの権利）',
    contents: [
      {
        mainContent:
          'ユーザーは、個人情報の保護に関する法律（個人情報保護法）に基づき、以下の権利を有します。',
        subContents: [
          {
            subContent: '行使できる権利',
            subItems: [
              '開示請求: 当社が保有する自身の個人情報の開示を求める権利',
              '訂正請求: 不正確な個人情報の訂正を求める権利',
              '削除請求: 個人情報の削除を求める権利',
              '利用停止請求: 個人情報の利用停止を求める権利',
            ],
          },
        ],
      },
      {
        mainContent:
          '上記の権利を行使する場合は、本サービス内の設定画面またはお問い合わせ窓口（otonagiyu@gmail.com）よりご申請ください。',
        link: 'mailto:otonagiyu@gmail.com',
      },
      {
        mainContent:
          '請求を受け付けた場合、当社は合理的な期間（通常30日以内）に対応します。本人確認のため、追加情報の提供をお願いする場合があります。',
      },
    ],
  },
  {
    title: '第7条（Cookie・セッション情報の取り扱い）',
    contents: [
      {
        mainContent:
          '本サービスは、以下の目的で Cookie およびセッション情報を使用します。',
        subContents: [
          {
            subContent: 'Cookie・セッション情報の利用目的',
            subItems: [
              '認証状態の維持（ログイン状態の保持）',
              'セキュリティ確保（CSRF 対策等）',
              'セッション管理',
            ],
          },
        ],
      },
      {
        mainContent:
          '本サービスは、トラッキング目的の Cookie や広告配信 Cookie は使用しません。',
      },
      {
        mainContent:
          'ブラウザの設定により Cookie を無効化することができますが、その場合、本サービスの一部機能（認証を含む）が利用できなくなる場合があります。',
      },
    ],
  },
  {
    title: '第8条（個人情報保護法への準拠）',
    contents: [
      {
        mainContent:
          '当社は、個人情報の保護に関する法律（個人情報保護法）およびその他関連法令を遵守して個人情報を取り扱います。',
      },
      {
        mainContent:
          '個人情報の取り扱いに関する苦情・相談は、以下の窓口にご連絡ください。',
        subContents: [
          {
            subContent: 'お問い合わせ窓口',
            subItems: [
              'メールアドレス: otonagiyu@gmail.com',
              '対応時間: 平日 10:00〜18:00（年末年始・祝日を除く）',
              '回答期間: お問い合わせ後、原則7営業日以内に回答',
            ],
          },
        ],
        link: 'mailto:otonagiyu@gmail.com',
      },
      {
        mainContent:
          '当社は、個人情報の漏洩・滅失・毀損の防止その他の安全管理のために必要かつ適切な措置を講じます。',
      },
    ],
  },
  {
    title: '第9条（プライバシーポリシーの変更）',
    contents: [
      {
        mainContent:
          '当社は、法令の変更、サービス内容の変更、その他必要と判断した場合、本プライバシーポリシーを変更することができます。',
      },
      {
        mainContent:
          '重要な変更を行う場合は、変更の30日前までにメール等でユーザーに通知します。変更後も本サービスを継続して利用した場合、変更後のプライバシーポリシーに同意したものとみなします。',
      },
      {
        mainContent:
          '変更後のプライバシーポリシーは、本サービス内に掲示した時点から効力を生じます。',
      },
      {
        mainContent: '施行日: 2026年5月26日\nバージョン: 1.0.0',
      },
    ],
  },
];
