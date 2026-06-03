import { PWA_MESSAGES } from '@/lib/pwa/messages';

describe('PWA_MESSAGES', () => {
  it('必要なキーがすべて定義されている', () => {
    expect(PWA_MESSAGES.INSTALL_PROMPT).toBeTruthy();
    expect(PWA_MESSAGES.NOTIFICATION_PROMPT).toBeTruthy();
    expect(PWA_MESSAGES.NOTIFICATION_GRANTED).toBeTruthy();
    expect(PWA_MESSAGES.ANDROID_INSTALL_BUTTON).toBeTruthy();
    expect(PWA_MESSAGES.NOTIFICATION_BUTTON).toBeTruthy();
    expect(PWA_MESSAGES.SKIP).toBeTruthy();
    expect(PWA_MESSAGES.NOTIFICATION_DENIED_HINT).toBeTruthy();
    expect(PWA_MESSAGES.NOTIFICATION_ERROR).toBeTruthy();
  });

  it('INSTALL_PROMPT はひよりの口調で書かれている', () => {
    expect(PWA_MESSAGES.INSTALL_PROMPT).toContain('お家');
  });

  it('NOTIFICATION_GRANTED は許可完了のリアクション', () => {
    expect(PWA_MESSAGES.NOTIFICATION_GRANTED).toContain('やった');
  });
});
