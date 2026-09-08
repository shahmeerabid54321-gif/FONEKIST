'use client';
import Link from 'next/link';
import { useActionState,useEffect,useRef,useState,useSyncExternalStore } from 'react';
import { useRouter } from 'next/navigation';
import type { PlanView } from '@/lib/installments';
import { formatPkr,INQUIRY_TERMS,type StorefrontSettings } from '@/lib/pk';
import { submitInquiryAction,finishInquiryAction,previewInquiryCoupon,type InquiryResult } from '@/app/actions/inquiry';
import { InstallmentDisclosure } from './installment-disclosure';
import { RemoveFromQueryButton } from './query-actions';
const subscribeHydration = () => () => {};
export function InquiryCheckout({rows,cities,submissionKey}:{rows:{variantId:string;title:string;variantTitle:string;plan:PlanView}[];cities:StorefrontSettings['cities'];submissionKey:string}){
 const hydrated=useSyncExternalStore(subscribeHydration,()=>true,()=>false);
 const [state,action,pending]=useActionState<InquiryResult|null,FormData>(submitInquiryAction,null);
 const [coupon,setCoupon]=useState('');const [discount,setDiscount]=useState(0);const [couponMessage,setCouponMessage]=useState('');const [couponBusy,setCouponBusy]=useState(false);
 const [city,setCity]=useState(cities.length===1?cities[0]!.name:'');
 const [key]=useState(submissionKey);const form=useRef<HTMLFormElement>(null);const router=useRouter();
 useEffect(()=>{const node=form.current;return()=>{node?.reset();};},[]);
 const items=rows.map(({plan})=>({variant_id:plan.variant_id,plan_id:plan.id,expected_advance_pkr:plan.advance_pkr,expected_monthly_pkr:plan.monthly_pkr,expected_tenure_months:plan.tenure_months,expected_total_pkr:plan.total_payable_pkr}));
 const errors=state?.fieldErrors??{};
 const inputClass='mt-2 min-h-[48px] w-full rounded-[var(--radius-control)] border border-[var(--line-strong)] bg-[var(--surface)] px-3 py-2 text-[var(--text)]';
 const error=(name:string)=>errors[name]?.length?<p id={name+'-error'} className="mt-1 text-sm text-[var(--color-danger)]">{errors[name]!.join(' ')}</p>:null;
 const field=(name:string,label:string,options:{type?:string;required?:boolean;placeholder?:string;maxLength?:number;autoComplete?:string}={})=><label className="block text-sm font-medium">{label}{options.required?' *':''}<input name={name} type={options.type??'text'} required={options.required} placeholder={options.placeholder} maxLength={options.maxLength??120} autoComplete={options.autoComplete??'off'} aria-invalid={Boolean(errors[name])} aria-describedby={errors[name]?name+'-error':undefined} className={inputClass}/>{error(name)}</label>;
 if(state?.ok)return <section className="mt-8 rounded-[var(--radius-card)] border border-[var(--line)] p-6" aria-live="polite"><h2 className="text-2xl font-semibold">Your inquiry has been received</h2><p className="mt-3">Reference: <strong>{state.reference}</strong></p><p className="mt-3">Our team will contact you to confirm the details. No payment has been taken and no stock has been reserved.</p><p className="mt-3">Advance after coupon: {formatPkr(state.net_advance_pkr??0)}</p><button className="mt-6 min-h-[44px] rounded border px-5" onClick={async()=>{await finishInquiryAction();router.push('/phones');router.refresh();}}>Continue browsing</button></section>;
 return <form ref={form} action={action} className="mt-8 grid gap-8 lg:grid-cols-[1.2fr_1fr]">
  <input type="hidden" name="items" value={JSON.stringify(items)}/><input type="hidden" name="idempotency_key" value={key}/><input type="hidden" name="terms_version" value="inquiry-2026-09-08"/>
  <fieldset disabled={pending||!hydrated} className="space-y-5"><legend className="mb-5 text-xl font-semibold">Your details</legend>
   {field('full_name','Full name',{required:true,autoComplete:'name'})}
   <div className="grid gap-5 sm:grid-cols-2">{field('phone','Phone',{required:true,type:'tel',placeholder:'03XXXXXXXXX',maxLength:25,autoComplete:'tel'})}{field('alternative_phone','Alternative number (optional)',{type:'tel',maxLength:25})}</div>
   <div className="grid gap-5 sm:grid-cols-2">{field('email','Email address (optional)',{type:'email',maxLength:254,autoComplete:'email'})}{field('cnic','CNIC number',{required:true,placeholder:'XXXXX-XXXXXXX-X',maxLength:20})}</div>
   <div className="grid gap-5 sm:grid-cols-2"><label className="text-sm font-medium">City *<select name="city" required value={city} onChange={e=>setCity(e.target.value)} className={inputClass}><option value="">Select a city</option>{cities.map(c=><option key={c.name}>{c.name}</option>)}</select>{error('city')}</label><label className="text-sm font-medium">Area *<select key={city} name="area" required disabled={!city} defaultValue="" className={inputClass}><option value="">{city?'Select an area':'Select city first'}</option>{cities.find(c=>c.name===city)?.areas.map(area=><option key={area}>{area}</option>)}</select>{error('area')}</label></div>
   <label className="block text-sm font-medium">Complete address *<textarea name="address" required maxLength={1000} rows={4} autoComplete="street-address" placeholder="House, street, locality and landmark (at least 10 words)" className={inputClass} aria-invalid={Boolean(errors.address)}/>{error('address')}</label>
   <label className="block text-sm font-medium">Notes (optional)<textarea name="notes" rows={3} maxLength={1000} className={inputClass}/>{error('notes')}</label>
  </fieldset>
  <section className="self-start rounded-[var(--radius-card)] border border-[var(--line)] p-5 sm:p-6"><h2 className="text-xl font-semibold">Your inquiry</h2><ul className="mt-5 space-y-6">{rows.map(row=><li key={row.variantId}><h3 className="font-semibold">{row.title}</h3><p className="text-sm text-[var(--text-soft)]">{row.variantTitle}</p><div className="mt-3"><InstallmentDisclosure plan={row.plan}/></div><div className="mt-3"><RemoveFromQueryButton variantId={row.variantId}/></div></li>)}</ul>
   <p className="mt-6 border-t border-[var(--line)] pt-5 font-semibold">Total advance: {formatPkr(rows.reduce((sum,row)=>sum+row.plan.advance_pkr,0))}</p>
   <div className="mt-5"><label className="block text-sm font-medium">Coupon code (optional)<input className={inputClass} name="coupon_code" maxLength={40} value={coupon} onChange={e=>{setCoupon(e.target.value);setDiscount(0);setCouponMessage('');}}/></label>{error('coupon_code')}<button type="button" disabled={pending||couponBusy||!coupon.trim()} className="mt-3 min-h-[44px] rounded border px-4" onClick={async()=>{setCouponBusy(true);const result=await previewInquiryCoupon(coupon,rows.reduce((sum,row)=>sum+row.plan.advance_pkr,0));setDiscount(result.discount_pkr??0);setCouponMessage(result.message??'Coupon applied. Availability is checked again when you send.');setCouponBusy(false);}}>{couponBusy?'Checking...':'Apply coupon'}</button><p className="mt-2 text-sm" role="status">{couponMessage}</p>{discount>0&&<p className="mt-3 font-semibold">Coupon: {formatPkr(discount)} off the advance<br/>Advance after coupon: {formatPkr(rows.reduce((sum,row)=>sum+row.plan.advance_pkr,0)-discount)}</p>}</div>
   <label className="mt-5 flex items-start gap-3 text-sm"><input name="consent" type="checkbox" required className="mt-1 h-5 w-5 shrink-0"/><span>{INQUIRY_TERMS} <Link href="/policies/installments" className="underline">Terms</Link> and <Link href="/policies/privacy" className="underline">privacy policy</Link>.</span></label>
   {state&&!state.ok&&<p role="alert" className="mt-4 text-sm text-[var(--color-danger)]">{state.message}</p>}
   <button disabled={pending||!key||!hydrated} className="mt-5 min-h-[48px] w-full rounded-[var(--radius-control)] bg-[var(--text)] px-5 py-3 font-semibold text-[var(--surface)] disabled:opacity-50">{pending?'Sending inquiry...':'Send inquiry'}</button>
  </section>
 </form>;
}
