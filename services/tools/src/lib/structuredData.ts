const BASE_URL = 'https://nagiyu.com';

export const homeStructuredData = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      name: 'Tools',
      url: BASE_URL,
      description: '日常作業を効率化する無料のオンラインツール集',
      inLanguage: 'ja',
      publisher: {
        '@type': 'Organization',
        name: 'nagiyu',
        url: BASE_URL,
      },
      potentialAction: {
        '@type': 'SearchAction',
        target: `${BASE_URL}/?q={search_term_string}`,
        'query-input': 'required name=search_term_string',
      },
    },
    {
      '@type': 'SoftwareApplication',
      name: 'Tools',
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      url: BASE_URL,
      offers: {
        '@type': 'Offer',
        price: '0',
        priceCurrency: 'JPY',
      },
      featureList: [
        '乗り換え案内テキストの整形',
        'JSONの整形・圧縮・検証',
        'VAPIDキー（公開鍵・秘密鍵）の生成',
        'Base64文字列のエンコード・デコード',
      ],
    },
  ],
};

export const transitConverterStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: '乗り換え変換ツール',
  description: '乗り換え案内のテキストを読みやすく整形し、コピーしやすい形式に変換する無料ツール',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  url: `${BASE_URL}/transit-converter`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'JPY',
  },
};

export const jsonFormatterStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'JSON 整形ツール',
  description: 'JSONの整形（Pretty Print）・圧縮（Minify）・検証をブラウザ上で実行できる無料ツール',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  url: `${BASE_URL}/json-formatter`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'JPY',
  },
};

export const vapidGeneratorStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'VAPID キー生成ツール',
  description:
    'Web Push 通知で利用する VAPID の公開鍵・秘密鍵ペアを生成し、コピーして利用できる無料ツール',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  url: `${BASE_URL}/vapid-generator`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'JPY',
  },
};

export const base64StructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'Base64 エンコーダー / デコーダー',
  description: '文字列の Base64 エンコード / デコードをブラウザ上で実行できる無料ツール',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  url: `${BASE_URL}/base64`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'JPY',
  },
};

export const urlEncoderStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'URL エンコーダー / デコーダー',
  description: 'URL に含まれる文字列をエンコード / デコードして相互変換できる無料ツール',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  url: `${BASE_URL}/url-encoder`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'JPY',
  },
};

export const hashGeneratorStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'ハッシュ生成ツール',
  description: '文字列から SHA-256 / SHA-512 のハッシュ値（Hex）を生成できる無料ツール',
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Web',
  url: `${BASE_URL}/hash-generator`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'JPY',
  },
};

export const timestampConverterStructuredData = {
  '@context': 'https://schema.org',
  '@type': 'WebApplication',
  name: 'タイムスタンプ変換ツール',
  description:
    'Unixタイムスタンプ（秒 / ミリ秒）と日時文字列を相互変換し、時刻確認を効率化できる無料ツール',
  applicationCategory: 'UtilitiesApplication',
  operatingSystem: 'Web',
  url: `${BASE_URL}/timestamp-converter`,
  offers: {
    '@type': 'Offer',
    price: '0',
    priceCurrency: 'JPY',
  },
};

export const toJsonLd = (value: object): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
};
