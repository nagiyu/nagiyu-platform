import { SAFETY_RESOURCES } from '../../../src/safety/resources.js';

describe('SAFETY_RESOURCES', () => {
  it('4 件のリソースが定義されている', () => {
    expect(SAFETY_RESOURCES).toHaveLength(4);
  });

  it.each(['いのちの電話', 'よりそいホットライン', 'TELL Lifeline', '緊急時（救急・警察）'])(
    '"%s" が含まれる',
    (name) => {
      const found = SAFETY_RESOURCES.find((r) => r.name === name);
      expect(found).toBeDefined();
    }
  );

  it('各リソースに name / description / phone が存在する', () => {
    for (const resource of SAFETY_RESOURCES) {
      expect(typeof resource.name).toBe('string');
      expect(resource.name.length).toBeGreaterThan(0);
      expect(typeof resource.description).toBe('string');
      expect(resource.description.length).toBeGreaterThan(0);
      expect(typeof resource.phone).toBe('string');
      expect(resource.phone.length).toBeGreaterThan(0);
    }
  });

  it('緊急時リソースの phone は "119"', () => {
    const emergency = SAFETY_RESOURCES.find((r) => r.name === '緊急時（救急・警察）');
    expect(emergency?.phone).toBe('119');
    expect(emergency?.url).toBeNull();
  });
});
