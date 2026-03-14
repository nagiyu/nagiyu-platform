import {
  homeStructuredData,
  jsonFormatterStructuredData,
  toJsonLd,
  transitConverterStructuredData,
} from '@/lib/structuredData';

describe('structuredData', () => {
  it('トップページ用スキーマに WebSite と SoftwareApplication が含まれる', () => {
    const graph = homeStructuredData['@graph'];

    expect(Array.isArray(graph)).toBe(true);
    expect(graph).toEqual(
      expect.arrayContaining([expect.objectContaining({ '@type': 'WebSite' })])
    );
    expect(graph).toEqual(
      expect.arrayContaining([expect.objectContaining({ '@type': 'SoftwareApplication' })])
    );
  });

  it('ツールページ用スキーマが WebApplication になっている', () => {
    expect(transitConverterStructuredData['@type']).toBe('WebApplication');
    expect(transitConverterStructuredData.url).toBe('https://nagiyu.com/transit-converter');

    expect(jsonFormatterStructuredData['@type']).toBe('WebApplication');
    expect(jsonFormatterStructuredData.url).toBe('https://nagiyu.com/json-formatter');
  });

  it('JSON-LD 文字列としてシリアライズできる', () => {
    const json = toJsonLd(homeStructuredData);
    const parsed = JSON.parse(json) as { '@context': string };

    expect(parsed['@context']).toBe('https://schema.org');
  });

  it('循環参照が含まれる場合は空オブジェクトを返す', () => {
    const circular = {} as { self?: object };
    circular.self = circular;

    expect(toJsonLd(circular)).toBe('{}');
  });
});
