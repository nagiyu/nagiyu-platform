import {
  HSTS_HEADER,
  CONTENT_TYPE_OPTIONS_HEADER,
  FRAME_OPTIONS_HEADER,
  XSS_PROTECTION_HEADER,
  REFERRER_POLICY_HEADER,
  PERMISSIONS_POLICY_HEADER,
  SECURITY_HEADERS,
} from '../../src/constants/security-headers';

describe('security-headers', () => {
  describe('HSTS_HEADER', () => {
    it('should have correct HSTS settings', () => {
      expect(HSTS_HEADER.accessControlMaxAge).toBe(63072000); // 2 years
      expect(HSTS_HEADER.includeSubdomains).toBe(true);
      expect(HSTS_HEADER.preload).toBe(true);
      expect(HSTS_HEADER.override).toBe(true);
    });
  });

  describe('CONTENT_TYPE_OPTIONS_HEADER', () => {
    it('should have override set to true', () => {
      expect(CONTENT_TYPE_OPTIONS_HEADER.override).toBe(true);
    });
  });

  describe('FRAME_OPTIONS_HEADER', () => {
    it('should deny frame embedding', () => {
      expect(FRAME_OPTIONS_HEADER.frameOption).toBe('DENY');
      expect(FRAME_OPTIONS_HEADER.override).toBe(true);
    });
  });

  describe('XSS_PROTECTION_HEADER', () => {
    it('should enable XSS protection with blocking mode', () => {
      expect(XSS_PROTECTION_HEADER.protection).toBe(true);
      expect(XSS_PROTECTION_HEADER.modeBlock).toBe(true);
      expect(XSS_PROTECTION_HEADER.override).toBe(true);
    });
  });

  describe('REFERRER_POLICY_HEADER', () => {
    it('should use strict-origin-when-cross-origin policy', () => {
      expect(REFERRER_POLICY_HEADER.referrerPolicy).toBe('strict-origin-when-cross-origin');
      expect(REFERRER_POLICY_HEADER.override).toBe(true);
    });
  });

  describe('PERMISSIONS_POLICY_HEADER', () => {
    it('should disable camera, microphone, geolocation, and payment', () => {
      expect(PERMISSIONS_POLICY_HEADER.camera).toBe('none');
      expect(PERMISSIONS_POLICY_HEADER.microphone).toBe('none');
      expect(PERMISSIONS_POLICY_HEADER.geolocation).toBe('none');
      expect(PERMISSIONS_POLICY_HEADER.payment).toBe('none');
    });
  });

  describe('SECURITY_HEADERS', () => {
    it('should include all security headers', () => {
      expect(SECURITY_HEADERS.strictTransportSecurity).toBeDefined();
      expect(SECURITY_HEADERS.contentTypeOptions).toBeDefined();
      expect(SECURITY_HEADERS.frameOptions).toBeDefined();
      expect(SECURITY_HEADERS.xssProtection).toBeDefined();
      expect(SECURITY_HEADERS.referrerPolicy).toBeDefined();
    });

    it('should reference the individual header objects', () => {
      expect(SECURITY_HEADERS.strictTransportSecurity).toBe(HSTS_HEADER);
      expect(SECURITY_HEADERS.contentTypeOptions).toBe(CONTENT_TYPE_OPTIONS_HEADER);
      expect(SECURITY_HEADERS.frameOptions).toBe(FRAME_OPTIONS_HEADER);
      expect(SECURITY_HEADERS.xssProtection).toBe(XSS_PROTECTION_HEADER);
      expect(SECURITY_HEADERS.referrerPolicy).toBe(REFERRER_POLICY_HEADER);
    });
  });
});
