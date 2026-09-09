import { revalidateStorefront } from '../storefront-revalidation';

describe('storefront cache revalidation', () => {
  it('stays silent when local development has no bridge configured', async () => {
    const warn = jest.fn();
    const request = jest.fn();
    await expect(revalidateStorefront(['search'], { warn }, {}, request as never)).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
  });

  it('deduplicates tags and authenticates an HTTPS invalidation request', async () => {
    const warn = jest.fn();
    const request = jest.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await expect(
      revalidateStorefront(
        ['search', 'search', 'product:phone'],
        { warn },
        { STOREFRONT_REVALIDATE_URL: 'https://shop.example/api/revalidate', STOREFRONT_REVALIDATE_SECRET: 'secret' },
        request as never,
      ),
    ).resolves.toBe(true);
    expect(request).toHaveBeenCalledTimes(1);
    const [url, options] = request.mock.calls[0]!;
    expect(String(url)).toBe('https://shop.example/api/revalidate');
    expect(options.headers['x-revalidate-secret']).toBe('secret');
    expect(JSON.parse(options.body)).toEqual({ tags: ['search', 'product:phone'] });
    expect(warn).not.toHaveBeenCalled();
  });

  it('never sends the shared secret over plain HTTP to a remote host', async () => {
    const warn = jest.fn();
    const request = jest.fn();
    await expect(
      revalidateStorefront(
        ['search'],
        { warn },
        { STOREFRONT_REVALIDATE_URL: 'http://shop.example/api/revalidate', STOREFRONT_REVALIDATE_SECRET: 'secret' },
        request as never,
      ),
    ).resolves.toBe(false);
    expect(request).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});
