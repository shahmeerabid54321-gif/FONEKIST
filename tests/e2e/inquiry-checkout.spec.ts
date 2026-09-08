import {expect,test} from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';
import {readFileSync,existsSync} from 'node:fs';
const fixturePath='test-results/local-capacity/browser-fixture.json';
test.describe('inquiry checkout on isolated localhost',()=>{
 test.skip(!existsSync(fixturePath),'Requires the isolated inquiry integration fixture.');
 test('submits an inquiry with optional contact fields empty',async({page,context})=>{
  const fixture=JSON.parse(readFileSync(fixturePath,'utf8'));
  const base=process.env.PLAYWRIGHT_BASE_URL??'';
  expect(base).toBe('http://localhost:3001');
  await context.addCookies([{name:'fk_query',value:JSON.stringify([{h:fixture.handle,v:fixture.variant_id,p:fixture.plan_id}]),url:base,httpOnly:true,sameSite:'Lax'}]);
  await page.goto('/checkout');
  await expect(page.getByRole('heading',{name:'Send your inquiry'})).toBeVisible();
  await page.getByLabel('Full name').fill('Synthetic Browser Inquiry');
  for (const colorScheme of ['light', 'dark'] as const) {
   await page.emulateMedia({ colorScheme });
   const audit = await new AxeBuilder({ page }).withTags(['wcag2a','wcag2aa','wcag21aa','wcag22aa']).analyze();
   expect(audit.violations.map(({id,nodes})=>({id,nodes:nodes.length}))).toEqual([]);
  }
  await page.getByLabel(/^Phone/).fill('03000000000');
  await page.getByLabel('CNIC number').fill('0000000000000');
  await expect(page.getByLabel('City')).toHaveValue('Karachi');
  await page.getByLabel('Area',{exact:false}).selectOption('Other Karachi area');
  await page.getByLabel('Complete address').fill('Synthetic house on test street in Karachi near the test landmark');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'Send inquiry',exact:true}).click();
  await expect(page.getByRole('heading',{name:'Your inquiry has been received'})).toBeVisible({timeout:30000});
  await expect(page.getByText(/FKQ-[A-F0-9]+/)).toBeVisible();
  await expect(page.locator('input[name=cnic]')).toHaveCount(0);
  await page.getByRole('button',{name:'Continue browsing'}).click();
  await expect(page).toHaveURL(/\/phones$/);
  expect((await context.cookies()).find(c=>c.name==='fk_query')).toBeUndefined();
 });
});
