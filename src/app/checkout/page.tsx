import type { Metadata } from 'next';
import Link from 'next/link';
import { Suspense } from 'react';
import { randomUUID } from 'node:crypto';
import { degradeGracefully } from '@/lib/log';
import { readQuery } from '@/lib/query';
import { getProductByHandle } from '@/lib/catalog';
import { listPlans } from '@/lib/installments';
import { getStorefrontSettings } from '@/lib/storefront-settings';
import { InquiryCheckout } from '@/components/inquiry-checkout';
export const metadata:Metadata={title:'Send your inquiry',robots:{index:false,follow:false}};
export default function CheckoutPage(){return <div className="mx-auto max-w-6xl px-5 py-12 sm:px-8"><h1 className="text-3xl font-semibold">Send your inquiry</h1><p className="mt-3 text-[var(--text-soft)]">Share your details with Fonekist. Nothing is charged or reserved when you inquire.</p><Suspense fallback={<p className="mt-8" role="status">Loading your query...</p>}><CheckoutBody/></Suspense></div>;}
async function CheckoutBody(){
 const entries=await readQuery();
 if(!entries.length)return <p className="mt-8">Your query is empty. <Link href="/phones" className="underline">Browse phones</Link></p>;
 const settings=await degradeGracefully("checkout.settings",null,getStorefrontSettings);
 if(!settings)return <p className="mt-8" role="alert">We cannot load checkout right now. Please try again shortly.</p>;
  if(!settings.inquiry_enabled)return <p className="mt-8">Inquiries are temporarily unavailable. Please contact the shop.</p>;
  const rows=await Promise.all(entries.map(async e=>{
   const [product,plans]=await Promise.all([getProductByHandle(e.h),listPlans(e.v)]);
   const variant=product?.variants.find(v=>v.id===e.v);const plan=plans.find(p=>p.id===e.p);
   return product&&variant&&plan?{variantId:e.v,title:product.title,variantTitle:variant.title,plan}:null;
  }));
  if(rows.some(r=>r===null))return <p className="mt-8">A selected phone or plan is unavailable. <Link href="/query" className="underline">Review your query</Link></p>;
  return <InquiryCheckout rows={rows.filter(r=>r!==null)} cities={settings.cities} submissionKey={randomUUID()}/>;
}
