/**
 * @jest-environment node
 */
import {
  LIVETALK_PRIVACY_VERSION as CORE_PRIVACY_VERSION,
  LIVETALK_TERMS_VERSION as CORE_TERMS_VERSION,
} from '@nagiyu/livetalk-core';
import { LIVETALK_PRIVACY_VERSION } from '@/lib/legal/privacy-data';
import { LIVETALK_TERMS_VERSION } from '@/lib/legal/terms-data';

describe('画面に出す版と同意の判定に使う版', () => {
  it('プライバシーポリシーの版が core と一致する', () => {
    expect(LIVETALK_PRIVACY_VERSION).toBe(CORE_PRIVACY_VERSION);
  });

  it('利用規約の版が core と一致する', () => {
    expect(LIVETALK_TERMS_VERSION).toBe(CORE_TERMS_VERSION);
  });
});
