'use server';
import { headers } from 'next/headers';
import { medusaFetch } from '@/lib/medusa';
import { readQuery,writeQuery } from '@/lib/query';
import { AppError,inquiryRequestSchema } from '@/lib/pk';
export interface InquiryResult {ok:boolean;message?:string;fieldErrors?:Record<string,string[]>;reference?:string;advance_pkr?:number;discount_pkr?:number;net_advance_pkr?:number;}
export async function submitInquiryAction(_previous:InquiryResult|null,form:FormData):Promise<InquiryResult>{
 const get=(key:string)=>String(form.get(key)??'').trim();
 try{
  const items=JSON.parse(get('items'));
  const parsed=inquiryRequestSchema.safeParse({...Object.fromEntries(['full_name','phone','alternative_phone','email','cnic','city','area','address','notes','coupon_code','terms_version'].map(k=>[k,get(k)])),items,consent:get('consent')==='on'});
  if(!parsed.success)return {ok:false,message:'Check the highlighted details.',fieldErrors:parsed.error.flatten().fieldErrors};
  const key=get('idempotency_key');if(!/^[a-f0-9-]{32,36}$/i.test(key))return {ok:false,message:'Refresh the form before submitting.'};
  const entries=await readQuery();
  if(entries.length!==parsed.data.items.length||parsed.data.items.some(i=>!entries.some(e=>e.v===i.variant_id&&e.p===i.plan_id)))return {ok:false,message:'Your query changed. Reload it before submitting.'};
  const incoming=await headers();
  const result=await medusaFetch<{data:{reference:string;advance_pkr:number;discount_pkr:number;net_advance_pkr:number}}>('/store/inquiries',{
   method:'POST',cache:'no-store',timeoutMs:30_000,
   headers:{'idempotency-key':key,'x-forwarded-for':incoming.get('x-forwarded-for')??'local'},
   body:JSON.stringify(parsed.data),
  });
  // Keep the shortlist for retry recovery if the browser loses the confirmation response.
  return {ok:true,...result.data};
 }catch(error){if(error instanceof SyntaxError)return {ok:false,message:'Reload your query before submitting.'};const e=AppError.from(error);return {ok:false,message:e.message,fieldErrors:e.fieldErrors};}
}
export async function finishInquiryAction(){await writeQuery([]);}
export async function previewInquiryCoupon(code:string,advance:number):Promise<{discount_pkr?:number;message?:string}>{
 try{const result=await medusaFetch<{data:{discount_pkr:number}}>(`/store/inquiry-coupon?code=${encodeURIComponent(code)}&advance_pkr=${encodeURIComponent(advance)}`,{cache:'no-store'});return {discount_pkr:result.data.discount_pkr};}
 catch(error){return {message:AppError.from(error).message};}
}
