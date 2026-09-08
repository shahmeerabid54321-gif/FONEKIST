/*
 * GENERATED FILE. Do not edit.
 *
 * Vendored from @pk/contracts `src/schemas/inquiries.ts` by `pnpm sync:contracts`.
 * Edit it upstream in the WEBSITE DESIGN monorepo, then re-run the sync.
 */

import { z } from "zod";
import { cnicSchema, pkMobileSchema } from "./pakistan";

const text = (max: number) => z.string().trim().min(1).max(max);
const internalLink = z.string().trim().max(300).regex(/^\/(?!\/)[^\\]*$/, "Use a local website path, for example /phones.");
const imageUrl = z.string().trim().max(2000).refine((value) => /^\/(?!\/)[^\\]+$/.test(value) || /^https:\/\/[^\s]+$/.test(value), "Use a local image path or an HTTPS image URL.");
export const bannerSchema = z.object({ id: text(100), eyebrow: text(80), headline: text(120), support: text(300), image: imageUrl, imageAlt: text(200), href: internalLink, cta: text(60), active: z.boolean() });
export const serviceCitySchema = z.object({ name: text(80), areas: z.array(text(100)).min(1).max(200) });
export const storefrontSettingsSchema = z.object({
  banners: z.array(bannerSchema).max(10),
  cities: z.array(serviceCitySchema).min(1).max(50),
  inquiry_enabled: z.boolean(),
}).superRefine((value, ctx) => {
  if (new Set(value.banners.map(b=>b.id)).size !== value.banners.length) ctx.addIssue({code:'custom',path:['banners'],message:'Banner IDs must be unique.'});
  if (new Set(value.cities.map(c=>c.name.toLowerCase())).size !== value.cities.length) ctx.addIssue({code:'custom',path:['cities'],message:'City names must be unique.'});
  value.cities.forEach((city,i)=> {if(new Set(city.areas.map(a=>a.toLowerCase())).size!==city.areas.length)ctx.addIssue({code:'custom',path:['cities',i,'areas'],message:'Area names must be unique.'});});
});
export type StorefrontSettings = z.infer<typeof storefrontSettingsSchema>;
export const DEFAULT_STOREFRONT_SETTINGS: StorefrontSettings = {
  banners: [], cities: [{name:'Karachi', areas:['Other Karachi area']}], inquiry_enabled: false,
};
export const couponSchema = z.object({
  code: z.string().trim().toUpperCase().min(3).max(40).regex(/^[A-Z0-9_-]+$/),
  discount_pkr: z.number().int().positive().max(1000000),
  minimum_advance_pkr: z.number().int().nonnegative().max(10000000),
  max_redemptions: z.number().int().positive().max(1000000),
  active: z.boolean(), expires_at: z.string().datetime().nullable(),
});
export const inquiryItemSchema = z.object({ variant_id: text(100), plan_id: text(100),
  expected_advance_pkr: z.number().int().nonnegative(), expected_monthly_pkr: z.number().int().positive(),
  expected_tenure_months: z.number().int().positive(), expected_total_pkr: z.number().int().positive(),
});
export const inquiryRequestSchema = z.object({
  items: z.array(inquiryItemSchema).min(1).max(3),
  full_name: text(120).refine(v=>v.length>=3,'Enter your full name.'),
  phone: pkMobileSchema, alternative_phone: z.union([z.literal(''), pkMobileSchema]).optional(),
  email: z.union([z.literal(''), z.string().trim().email().max(254)]).optional(),
  cnic: cnicSchema,
  city: text(80), area: text(100),
  address: text(1000).refine(v=>v.split(/\s+/).length>=10,'Enter a complete address with at least 10 words.'),
  notes: z.string().trim().max(1000).default(''),
  coupon_code: z.string().trim().toUpperCase().max(40).default(''),
  consent: z.literal(true), terms_version: z.literal('inquiry-2026-09-08'),
}).superRefine((value,ctx)=>{
  if(new Set(value.items.map(i=>i.variant_id)).size!==value.items.length)ctx.addIssue({code:'custom',path:['items'],message:'Each handset can appear once.'});
  if(value.alternative_phone && value.alternative_phone===value.phone)ctx.addIssue({code:'custom',path:['alternative_phone'],message:'Use a different alternative number.'});
});
export type InquiryRequest = z.infer<typeof inquiryRequestSchema>;
export const INQUIRY_TERMS = 'I accept the terms and privacy policy and agree that Fonekist may contact me about this inquiry. Sending an inquiry does not place an order, reserve stock, approve credit or charge a payment. The shop will confirm availability, eligibility and delivery arrangements.';
