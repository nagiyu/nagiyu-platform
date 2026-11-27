import { test, expect, suppressMigrationDialog, waitForHydration } from './helpers';

test.use({ serviceWorkers: 'block' });

// 変換ボタンは入力が空文字のときだけ押せない。空白だけの入力は変換の対象にする。
test.describe('空白だけの入力', () => {
  test.beforeEach(async ({ page }) => {
    await suppressMigrationDialog(page);
  });

  test('Base64: 空のときは押せず、空白だけなら押せて結果が出る', async ({ page }) => {
    await page.goto('/base64');
    await waitForHydration(page);

    const input = page.getByPlaceholder('エンコードする文字列を入力してください...');
    const output = page.getByPlaceholder('変換結果がここに表示されます...');
    const encodeButton = page.getByRole('button', { name: '入力をBase64にエンコードする' });

    await expect(encodeButton).toBeDisabled();

    await input.fill(' ');
    await expect(encodeButton).toBeEnabled();
    await encodeButton.click();
    await expect(output).toHaveValue('IA==');

    await input.fill('');
    await expect(encodeButton).toBeDisabled();

    await page.getByRole('button', { name: 'デコードモードに切り替える' }).click();
    const decodeInput = page.getByPlaceholder('デコードするBase64文字列を入力してください...');
    const decodeButton = page.getByRole('button', { name: '入力をBase64からデコードする' });

    await expect(decodeButton).toBeDisabled();
    await decodeInput.fill('  ');
    await expect(decodeButton).toBeEnabled();
    await decodeButton.click();
    await expect(output).toHaveValue('');
    await expect(page.getByText('Base64をデコードしました')).toBeVisible();
  });

  test('URLエンコード: 空のときは押せず、空白だけなら押せて結果が出る', async ({ page }) => {
    await page.goto('/url-encoder');
    await waitForHydration(page);

    const input = page.getByLabel('テキスト');
    const output = page.getByLabel('結果', { exact: true });
    const encodeButton = page.getByRole('button', { name: '入力をURLエンコードする' });

    await expect(encodeButton).toBeDisabled();

    await input.fill(' ');
    await expect(encodeButton).toBeEnabled();
    await encodeButton.click();
    await expect(output).toHaveValue('%20');

    await input.fill('');
    await expect(encodeButton).toBeDisabled();

    await page.getByRole('button', { name: 'デコードモードに切り替える' }).click();
    const decodeButton = page.getByRole('button', { name: '入力をURLエンコードからデコードする' });

    await expect(decodeButton).toBeDisabled();
    await page.getByLabel('URLエンコード文字列').fill('  ');
    await expect(decodeButton).toBeEnabled();
    await decodeButton.click();
    await expect(output).toHaveValue('');
  });

  test('ハッシュ生成: 空のときは押せず、空白だけなら押せて結果が出る', async ({ page }) => {
    await page.goto('/hash-generator');
    await waitForHydration(page);

    const input = page.getByLabel('テキスト');
    const button = page.getByRole('button', { name: '入力文字列のハッシュを生成する' });

    await expect(button).toBeDisabled();

    await input.fill(' ');
    await expect(button).toBeEnabled();
    await button.click();
    await expect(page.getByLabel('ハッシュ値')).toHaveValue(
      '36a9e7f1c95b82ffb99743e0c5c4ce95d83c9a430aac59f84ef3cbfab6145068'
    );

    await input.fill('');
    await expect(button).toBeDisabled();
  });
});
