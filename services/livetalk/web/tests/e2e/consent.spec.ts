import { test, expect, type Page } from '@playwright/test';

/** 同意の状態を差し替えて、ホーム画面の同意のダイアログを開く */
async function openWithConsent(page: Page, body: Record<string, unknown>) {
  await page.route('**/api/consent', (route) => {
    if (route.request().method() !== 'GET') return route.fallback();
    return route.fulfill({ json: body });
  });
  await page.goto('/');
}

const REQUIRED_VERSIONS = { terms: '1.1.0', privacy: '1.1.0' };

test.describe('LiveTalk - 同意のダイアログ', () => {
  test('前の版に同意済みなら、改定を知らせるダイアログを出す', async ({ page }) => {
    await openWithConsent(page, {
      consented: false,
      requiredVersions: REQUIRED_VERSIONS,
      current: {
        termsAgreed: { version: '1.0.0', agreedAt: 1 },
        privacyAgreed: { version: '1.0.0', agreedAt: 1 },
        ageVerified: { value: true, verifiedAt: 1 },
      },
    });

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('consent-title')).toHaveText(
      '利用規約・プライバシーポリシーを改定しました'
    );
    await expect(dialog.getByText('リブトークへようこそ')).toHaveCount(0);
    await expect(dialog.getByText('OpenAI').first()).toBeVisible();
    // 年齢の申告は記録済みなので、規約とポリシーの 2 つだけ
    await expect(dialog.getByRole('checkbox')).toHaveCount(2);
    await expect(dialog.getByTestId('consent-submit')).toHaveText('同意して続ける');
  });

  test('初めて使う利用者には「リブトークへようこそ」を出す', async ({ page }) => {
    await openWithConsent(page, {
      consented: false,
      requiredVersions: REQUIRED_VERSIONS,
      current: null,
    });

    const dialog = page.getByRole('dialog');
    await expect(dialog.getByTestId('consent-title')).toHaveText('リブトークへようこそ');
    await expect(dialog.getByRole('checkbox')).toHaveCount(3);
    await expect(dialog.getByTestId('consent-submit')).toHaveText('利用開始');
  });
});
