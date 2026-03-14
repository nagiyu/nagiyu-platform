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
      featureList: ['乗り換え案内テキストの整形', 'JSONの整形・圧縮・検証'],
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

export const toJsonLd = (value: object): string => {
  try {
    return JSON.stringify(value);
  } catch {
    return '{}';
  }
};
