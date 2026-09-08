import type { MedusaStoreRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { randomUUID, randomBytes } from 'node:crypto';
import { AppError, inquiryRequestSchema, INQUIRY_TERMS, installmentDisclosure, isPlanOfferable } from '@pk/contracts';
import { storeChannel, storefrontSettings } from '../../../lib/storefront-settings';
import { encryptCustomer, inquiryFingerprint } from '../../../lib/inquiry-privacy';
import { fail, ok, requestIdOf, clientIpOf } from '../../../lib/http';
import { rateLimit } from '../../../lib/rate-limit';
import { INSTALLMENTS_MODULE } from '../../../modules/installments';
import type InstallmentsService from '../../../modules/installments/service';

export async function POST(req:MedusaStoreRequest,res:MedusaResponse) {
  const requestId=requestIdOf(req);res.setHeader('Cache-Control','no-store');
  try {
    const channel=storeChannel(req);
    const key=String(req.headers['idempotency-key']??'');
    if(!/^[a-f0-9-]{32,36}$/i.test(key))throw new AppError('VALIDATION_ERROR',{message:'Refresh the inquiry form before submitting.'});
    const limit=rateLimit('inquiry:'+clientIpOf(req),10,600);
    if(!limit.allowed){res.setHeader('Retry-After',String(limit.retryAfterSeconds));throw new AppError('RATE_LIMITED');}
    const parsed=inquiryRequestSchema.safeParse(req.body);
    if(!parsed.success)throw new AppError('VALIDATION_ERROR',{fieldErrors:parsed.error.flatten().fieldErrors});
    const input=parsed.data;
    const fingerprint=inquiryFingerprint(input);
    const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);
    const confirmation=(row)=>({reference:row.reference,state:row.state,advance_pkr:row.advance_pkr,discount_pkr:row.discount_pkr,net_advance_pkr:row.advance_pkr-row.discount_pkr});
    const existing=await db('storefront_inquiry').where({channel_id:channel,submission_key:key}).first();
    if(existing){if(existing.request_fingerprint!==fingerprint)throw new AppError('CONFLICT');res.json(ok(confirmation(existing),requestId));return;}
    const {configuration}=await storefrontSettings(req,channel);
    if(!configuration.inquiry_enabled)throw new AppError('FORBIDDEN',{message:'Inquiries are temporarily unavailable. Please contact the shop.'});
    const city=configuration.cities.find(c=>c.name===input.city);
    if(!city?.areas.includes(input.area))throw new AppError('VALIDATION_ERROR',{fieldErrors:{area:['Choose a supported city and area.']}});
    const installments:InstallmentsService=req.scope.resolve(INSTALLMENTS_MODULE);
    const query=req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const items=await Promise.all(input.items.map(async item=>{
      const plan=await installments.retrieveInstallmentPlan(item.plan_id).catch(()=>null);
      if(!plan||plan.variant_id!==item.variant_id||!isPlanOfferable(plan as never))throw new AppError('CONFLICT',{message:'A selected plan is no longer available. Review your inquiry.'});
      const {data:products}=await query.graph({entity:'product',fields:['id','title','status','sales_channels.id','variants.id','variants.title','variants.prices.amount','variants.prices.currency_code'],filters:{id:plan.product_id}});
      const product=products[0];
      if(!product||product.status!=='published'||!product.sales_channels?.some(c=>c?.id===channel))throw new AppError('NOT_FOUND');
      const variant=product.variants?.find(v=>v?.id===item.variant_id);
      const prices=(variant as unknown as {prices?:{currency_code:string;amount:number}[]})?.prices;
      const cash=prices?.find(p=>p.currency_code==='pkr')?.amount;
      if(cash==null||Number(cash)!==plan.cash_price_pkr)throw new AppError('PRICE_CHANGED');
      const disclosure=installmentDisclosure(plan as never);
      if(disclosure.total_payable_pkr!==plan.total_payable_pkr||item.expected_advance_pkr!==plan.advance_pkr||item.expected_monthly_pkr!==plan.monthly_pkr||item.expected_tenure_months!==plan.tenure_months||item.expected_total_pkr!==plan.total_payable_pkr)throw new AppError('PRICE_CHANGED');
      return {variant_id:item.variant_id,plan_id:plan.id,product_id:plan.product_id,title:product.title,variant_title:variant?.title,label:plan.label,...disclosure};
    }));
    const advance=items.reduce((sum,item)=>sum+item.advance_pkr,0);
    const {items:_items,coupon_code:_coupon,consent:_consent,terms_version:_terms,...customer}=input;
    const encrypted=encryptCustomer(customer);
    const result=await db.transaction(async tx=>{
      await tx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',['inquiry:'+channel+':'+key]);
      const replay=await tx('storefront_inquiry').where({channel_id:channel,submission_key:key}).first();
      if(replay){if(replay.request_fingerprint!==fingerprint)throw new AppError('CONFLICT');return confirmation(replay);}
      let discount=0;
      if(input.coupon_code){
        const coupon=await tx('inquiry_coupon').where({channel_id:channel,code:input.coupon_code}).whereNull('deleted_at').forUpdate().first();
        if(!coupon||!coupon.active||(coupon.expires_at&&new Date(coupon.expires_at)<=new Date())||coupon.redemptions>=coupon.max_redemptions||advance<coupon.minimum_advance_pkr)throw new AppError('VALIDATION_ERROR',{fieldErrors:{coupon_code:['This coupon is unavailable or its minimum advance has not been met.']}});
        discount=Math.min(Number(coupon.discount_pkr),advance);
        await tx('inquiry_coupon').where({id:coupon.id}).increment('redemptions',1);
      }
      const row={id:'inq_'+randomUUID(),reference:'FKQ-'+randomBytes(8).toString('hex').toUpperCase(),channel_id:channel,submission_key:key,request_fingerprint:fingerprint,state:'new',customer_encrypted:encrypted,items:JSON.stringify(items),advance_pkr:advance,discount_pkr:discount,coupon_code:input.coupon_code||null,terms_version:input.terms_version,consent_text:INQUIRY_TERMS,purge_after:new Date(Date.now()+90*86400000)};
      await tx('storefront_inquiry').insert(row);
      return confirmation(row);
    });
    res.status(201).json(ok(result,requestId));
  }catch(error){const {status,body}=fail(error,requestId,true);res.status(status).json(body);}
}
