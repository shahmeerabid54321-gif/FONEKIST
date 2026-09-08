import { cacheLife,cacheTag } from 'next/cache';
import { capture,unwrap } from './cached-read';
import { medusaFetch } from './medusa';
import { storefrontSettingsSchema, type StorefrontSettings } from './pk';
async function cachedSettings(){
 'use cache';cacheLife('minutes');cacheTag('storefront-settings');
 return capture(async()=>{
  const result=await medusaFetch<{data:{configuration:StorefrontSettings;revision:number}}>('/store/storefront-settings');
  return storefrontSettingsSchema.parse(result.data.configuration);
 });
}
export async function getStorefrontSettings(){return unwrap(await cachedSettings());}
