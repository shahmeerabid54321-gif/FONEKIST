import type { MedusaStoreRequest,MedusaResponse } from '@medusajs/framework/http';
import {ContainerRegistrationKeys} from '@medusajs/framework/utils';
import {AppError} from '@pk/contracts';
import {storeChannel} from '../../../lib/storefront-settings';
import {fail,ok,requestIdOf,clientIpOf} from '../../../lib/http';
import {rateLimit} from '../../../lib/rate-limit';
export async function GET(req:MedusaStoreRequest,res:MedusaResponse){
 const id=requestIdOf(req);res.setHeader('Cache-Control','no-store');
 try{
  if(!rateLimit('coupon:'+clientIpOf(req),30,60).allowed)throw new AppError('RATE_LIMITED');
  const channel=storeChannel(req),code=String(req.query.code??'').trim().toUpperCase(),advance=Number(req.query.advance_pkr);
  if(!/^[A-Z0-9_-]{3,40}$/.test(code)||!Number.isSafeInteger(advance)||advance<0||advance>10000000)throw new AppError('VALIDATION_ERROR');
  const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  const coupon=await db('inquiry_coupon').where({channel_id:channel,code,active:true}).whereNull('deleted_at').first();
  if(!coupon||(coupon.expires_at&&new Date(coupon.expires_at)<=new Date())||coupon.redemptions>=coupon.max_redemptions||advance<coupon.minimum_advance_pkr)throw new AppError('VALIDATION_ERROR',{message:'This coupon is unavailable or its minimum advance has not been met.'});
  res.json(ok({code,discount_pkr:Math.min(Number(coupon.discount_pkr),advance)},id));
 }catch(error){const {status,body}=fail(error,id,true);res.status(status).json(body);}
}
