import { expect, test } from '@playwright/test';
import { existsSync, readFileSync } from 'node:fs';

const loginPath = 'test-results/local-capacity/admin-login.json';
test.describe('isolated owner administration', () => {
  test.skip(!existsSync(loginPath), 'Requires the disposable local admin fixture.');
  test('protects administration and saves owner settings and coupons', async ({ page, request }) => {
    expect(process.env.PLAYWRIGHT_BASE_URL).toBe('http://localhost:3001');
    const origin = 'http://localhost:9100';
    // Model TLS termination for the compiled production server. Chromium treats
    // localhost as a secure cookie origin; production cookie settings stay intact.
    await page.setExtraHTTPHeaders({ 'X-Forwarded-Proto': 'https' });
    for (const route of ['inquiries', 'inquiry-coupons', 'storefront-settings']) {
      expect((await request.get(`${origin}/admin/${route}`)).status()).toBe(401);
    }
    const login = JSON.parse(readFileSync(loginPath, 'utf8'));
    await page.goto(`${origin}/app/login`);
    await page.locator('input[name=email]').fill(login.email);
    await page.locator('input[name=password]').fill(login.password);
    await page.getByRole('button', { name: /continue|log in|sign in/i }).click();
    await expect(page).not.toHaveURL(/\/login/);
    await page.goto(`${origin}/app/storefront`);
    await expect(page.getByRole('heading', { name: 'Fonekist storefront', exact: true })).toBeVisible();
    await expect(page.getByLabel('City', { exact: true })).toHaveValue('Karachi');
    await page.getByRole('button', { name: 'Save storefront', exact: true }).click();
    await expect(page.getByText('Storefront settings saved.', { exact: true })).toBeVisible();
    const code = `UI${Date.now()}`;
    await page.getByLabel('Code', { exact: true }).fill(code);
    await page.getByLabel('Discount (Rs)', { exact: true }).fill('100');
    await page.getByLabel('Maximum redemptions', { exact: true }).fill('5');
    await page.getByRole('button', { name: 'Save coupon', exact: true }).click();
    await expect(page.getByText(`${code}:`, { exact: false })).toBeVisible();
    await page.reload();
    await expect(page.getByText(`${code}:`, { exact: false })).toBeVisible();
    await page.goto(`${origin}/app/inquiries`);
    await expect(page.getByRole('heading', { name: 'Customer inquiries', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Open inquiry', exact: true }).first().click();
    await expect(page.getByText('Contact access is audited. CNIC is masked.', { exact: true })).toBeVisible();
    if (await page.getByRole('button', { name: 'Mark contacted', exact: true }).isDisabled()) {
      await page.getByRole('button', { name: 'Mark new', exact: true }).click();
    }
    await expect(page.getByRole('button', { name: 'Mark contacted', exact: true })).toBeEnabled();
    await page.getByRole('button', { name: 'Mark contacted', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Mark contacted', exact: true })).toBeDisabled();
  });
});
