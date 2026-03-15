import {
  base64StructuredData,
  hashGeneratorStructuredData,
  homeStructuredData,
  jsonFormatterStructuredData,
  timestampConverterStructuredData,
  toJsonLd,
  transitConverterStructuredData,
  urlEncoderStructuredData,
  vapidGeneratorStructuredData,
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
    const software = graph.find(
      (entry): entry is { '@type': string; featureList?: string[] } =>
        typeof entry === 'object' && entry !== null && entry['@type'] === 'SoftwareApplication'
    );
    expect(software?.featureList).toContain('Base64文字列のエンコード・デコード');
  });

  it('ツールページ用スキーマが WebApplication になっている', () => {
    expect(transitConverterStructuredData['@type']).toBe('WebApplication');
    expect(transitConverterStructuredData.url).toBe('https://nagiyu.com/transit-converter');

    expect(jsonFormatterStructuredData['@type']).toBe('WebApplication');
    expect(jsonFormatterStructuredData.url).toBe('https://nagiyu.com/json-formatter');

    expect(vapidGeneratorStructuredData['@type']).toBe('WebApplication');
    expect(vapidGeneratorStructuredData.url).toBe('https://nagiyu.com/vapid-generator');

    expect(base64StructuredData['@type']).toBe('WebApplication');
    expect(base64StructuredData.url).toBe('https://nagiyu.com/base64');

    expect(urlEncoderStructuredData['@type']).toBe('WebApplication');
    expect(urlEncoderStructuredData.url).toBe('https://nagiyu.com/url-encoder');

    expect(hashGeneratorStructuredData['@type']).toBe('WebApplication');
    expect(hashGeneratorStructuredData.url).toBe('https://nagiyu.com/hash-generator');

    expect(timestampConverterStructuredData['@type']).toBe('WebApplication');
    expect(timestampConverterStructuredData.url).toBe('https://nagiyu.com/timestamp-converter');
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
