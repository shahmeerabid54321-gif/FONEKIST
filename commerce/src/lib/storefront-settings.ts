import type { MedusaRequest, MedusaStoreRequest } from '@medusajs/framework/http';
import { AppError, DEFAULT_STOREFRONT_SETTINGS, storefrontSettingsSchema, type StorefrontSettings } from '@pk/contracts';
import { STOREFRONT_MODULE } from '../modules/storefront';
import type StorefrontService from '../modules/storefront/service';
export function defaultStorefrontSettings(env: NodeJS.ProcessEnv = process.env): StorefrontSettings {
  return {
    ...DEFAULT_STOREFRONT_SETTINGS,
    inquiry_enabled: env.INQUIRY_DEFAULT_ENABLED === 'true',
  };
}
export function storeChannel(req: MedusaStoreRequest): string {
  const channels=req.publishable_key_context?.sales_channel_ids ?? [];
  if(channels.length!==1) throw new AppError('FORBIDDEN');
  return channels[0];
}
export async function storefrontSettings(req: MedusaRequest, channel: string): Promise<{configuration:StorefrontSettings;revision:number}> {
  const service:StorefrontService=req.scope.resolve(STOREFRONT_MODULE);
  const rows=await service.listStorefrontContents({channel_id:channel});
  const row=rows[0];
  return row?{configuration:storefrontSettingsSchema.parse(row.configuration),revision:row.revision}:{configuration:defaultStorefrontSettings(),revision:0};
}
