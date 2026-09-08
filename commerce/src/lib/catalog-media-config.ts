/** Public catalogue photos only. Inquiry identity uses separate encrypted storage. */
export function catalogMediaModules(env: NodeJS.ProcessEnv) {
  const keys = ['CATALOG_S3_BUCKET', 'CATALOG_S3_REGION', 'CATALOG_S3_FILE_URL',
    'CATALOG_S3_ACCESS_KEY_ID', 'CATALOG_S3_SECRET_ACCESS_KEY'] as const;
  if (!keys.some(key => Boolean(env[key]))) return [];
  const missing = keys.filter(key => !env[key]);
  if (missing.length) throw new Error(`Incomplete catalogue storage: ${missing.join(', ')}`);
  for (const key of ['CATALOG_S3_FILE_URL', 'CATALOG_S3_ENDPOINT'] as const) {
    if (!env[key]) continue;
    const url = new URL(env[key]!);
    if (url.protocol !== 'https:' || url.username || url.password) {
      throw new Error(`${key} must use HTTPS without embedded credentials.`);
    }
  }
  return [{
    resolve: '@medusajs/medusa/file',
    options: { providers: [{
      resolve: '@medusajs/medusa/file-s3', id: 'catalog-s3',
      options: {
        bucket: env.CATALOG_S3_BUCKET, region: env.CATALOG_S3_REGION,
        file_url: env.CATALOG_S3_FILE_URL, endpoint: env.CATALOG_S3_ENDPOINT,
        access_key_id: env.CATALOG_S3_ACCESS_KEY_ID,
        secret_access_key: env.CATALOG_S3_SECRET_ACCESS_KEY,
        prefix: 'catalog/', acl: false,
      },
    }] },
  }];
}
