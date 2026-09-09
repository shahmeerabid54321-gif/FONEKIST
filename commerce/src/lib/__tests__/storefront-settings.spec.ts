import { defaultStorefrontSettings } from '../storefront-settings';

describe('default storefront settings', () => {
  it('fails closed unless inquiry collection is explicitly enabled', () => {
    expect(defaultStorefrontSettings({}).inquiry_enabled).toBe(false);
    expect(defaultStorefrontSettings({ INQUIRY_DEFAULT_ENABLED: 'false' }).inquiry_enabled).toBe(false);
  });

  it('lets a fresh owner-review environment enable inquiry collection explicitly', () => {
    const settings = defaultStorefrontSettings({ INQUIRY_DEFAULT_ENABLED: 'true' });
    expect(settings.inquiry_enabled).toBe(true);
    expect(settings.cities).toEqual([{ name: 'Karachi', areas: ['Other Karachi area'] }]);
  });
});
