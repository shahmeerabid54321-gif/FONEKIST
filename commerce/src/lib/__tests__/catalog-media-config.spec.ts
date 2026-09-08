import { catalogMediaModules } from '../catalog-media-config';
describe('catalogue storage configuration', () => {
  const configured = {
    CATALOG_S3_BUCKET: 'test', CATALOG_S3_REGION: 'auto',
    CATALOG_S3_FILE_URL: 'https://images.example.invalid',
    CATALOG_S3_ACCESS_KEY_ID: 'synthetic', CATALOG_S3_SECRET_ACCESS_KEY: 'synthetic',
  };
  it('keeps local development available without storage credentials', () => {
    expect(catalogMediaModules({})).toEqual([]);
  });
  it('rejects partial configuration instead of silently losing uploads locally', () => {
    expect(() => catalogMediaModules({ CATALOG_S3_BUCKET: 'test' })).toThrow('Incomplete');
  });
  it('rejects insecure endpoints and credentials in public image URLs', () => {
    expect(() => catalogMediaModules({ ...configured, CATALOG_S3_ENDPOINT: 'http://storage.invalid' })).toThrow('HTTPS');
    expect(() => catalogMediaModules({ ...configured, CATALOG_S3_FILE_URL: 'https://user:secret@images.invalid' })).toThrow('credentials');
  });
  it('uses the durable provider when configured', () => {
    expect(catalogMediaModules(configured)[0].options.providers[0].resolve).toBe('@medusajs/medusa/file-s3');
  });
});
