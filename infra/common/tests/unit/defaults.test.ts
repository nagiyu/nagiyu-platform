import {
  DEFAULT_LAMBDA_CONFIG,
  DEFAULT_ECR_CONFIG,
  DEFAULT_CLOUDFRONT_CONFIG,
  mergeConfig,
} from '../../src/constants/defaults';

describe('defaults', () => {
  describe('DEFAULT_LAMBDA_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_LAMBDA_CONFIG.memorySize).toBe(512);
      expect(DEFAULT_LAMBDA_CONFIG.timeout).toBe(30);
      expect(DEFAULT_LAMBDA_CONFIG.architecture).toBe('X86_64');
      expect(DEFAULT_LAMBDA_CONFIG.runtime).toBe('nodejs20.x');
    });
  });

  describe('DEFAULT_ECR_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_ECR_CONFIG.imageScanOnPush).toBe(true);
      expect(DEFAULT_ECR_CONFIG.maxImageCount).toBe(10);
      expect(DEFAULT_ECR_CONFIG.imageTagMutability).toBe('MUTABLE');
    });
  });

  describe('DEFAULT_CLOUDFRONT_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_CLOUDFRONT_CONFIG.enableSecurityHeaders).toBe(true);
      expect(DEFAULT_CLOUDFRONT_CONFIG.minimumTlsVersion).toBe('1.2');
      expect(DEFAULT_CLOUDFRONT_CONFIG.enableHttp2).toBe(true);
      expect(DEFAULT_CLOUDFRONT_CONFIG.enableHttp3).toBe(true);
      expect(DEFAULT_CLOUDFRONT_CONFIG.priceClass).toBe('PriceClass_100');
    });
  });

  describe('mergeConfig', () => {
    it('should return defaults when config is undefined', () => {
      const defaults = { a: 1, b: 2, c: 3 };
      const result = mergeConfig(undefined, defaults);
      expect(result).toEqual(defaults);
    });

    it('should merge user config with defaults', () => {
      const defaults = { a: 1, b: 2, c: 3 };
      const userConfig = { b: 20, c: 30 };
      const result = mergeConfig(userConfig, defaults);
      expect(result).toEqual({ a: 1, b: 20, c: 30 });
    });

    it('should override defaults with user config', () => {
      const defaults = DEFAULT_LAMBDA_CONFIG;
      const userConfig = { memorySize: 1024, timeout: 60 };
      const result = mergeConfig(userConfig, defaults);
      expect(result.memorySize).toBe(1024);
      expect(result.timeout).toBe(60);
      expect(result.architecture).toBe('X86_64'); // Keep default
      expect(result.runtime).toBe('nodejs20.x'); // Keep default
    });

    it('should handle empty user config', () => {
      const defaults = { a: 1, b: 2 };
      const result = mergeConfig({}, defaults);
      expect(result).toEqual(defaults);
    });
  });
});
