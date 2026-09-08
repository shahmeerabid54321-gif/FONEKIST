import { existsSync, readFileSync } from 'node:fs';

process.loadEnvFile('test-results/local-capacity/backend.env');
if (!process.env.DATABASE_URL?.endsWith('/fonekist_loadtest_20260908')) {
  throw new Error('Only the disposable local database is allowed.');
}
const origin = 'http://localhost:9100';
const login = JSON.parse(readFileSync('test-results/local-capacity/admin-login.json', 'utf8'));
const auth = await fetch(`${origin}/auth/user/emailpass`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(login),
});
if (!auth.ok) throw new Error('Local admin login failed.');
const { token } = await auth.json();
const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` };
const listing = await fetch(`${origin}/admin/products?limit=1000&fields=id,handle,thumbnail`, { headers });
if (!listing.ok) throw new Error('Local product listing failed.');
let updated = 0;
for (const product of (await listing.json()).products) {
  const image = `/media/products/${product.handle}/01.jpg`;
  if (product.thumbnail || !existsSync(`public${image}`)) continue;
  const response = await fetch(`${origin}/admin/products/${product.id}`, {
    method: 'POST', headers, body: JSON.stringify({ thumbnail: image, images: [{ url: image }] }),
  });
  if (!response.ok) throw new Error(`Fixture image update failed (${response.status}).`);
  updated++;
}
console.log(`Attached existing repository photos to ${updated} empty local test products.`);
