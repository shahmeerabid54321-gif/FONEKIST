import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { AppError,couponSchema } from '@pk/contracts';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { fail,ok,requestIdOf } from '../../../lib/http';
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse) {
 const id=requestIdOf(req);
 try {
  if(!req.auth_context?.actor_id)throw new AppError('AUTHENTICATION_REQUIRED');
  const channel=String(req.query.channel_id??'');if(!channel)throw new AppError('VALIDATION_ERROR');
  const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  res.json(ok({coupons:await db('inquiry_coupon').where({channel_id:channel}).whereNull('deleted_at').orderBy('created_at','desc').limit(100)},id));
 }catch(error){const {status,body}=fail(error,id,true);res.status(status).json(body);}
}
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse) {
 const id=requestIdOf(req);
 try {
  if(!req.auth_context?.actor_id)throw new AppError('AUTHENTICATION_REQUIRED');
  const parsed=couponSchema.extend({channel_id:z.string().min(1).max(100)}).safeParse(req.body);
  if(!parsed.success)throw new AppError('VALIDATION_ERROR',{fieldErrors:parsed.error.flatten().fieldErrors});
  const input=parsed.data;const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  await db.transaction(async tx=>{
    await tx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',['coupon:'+input.channel_id+':'+input.code]);
    const existing=await tx('inquiry_coupon').where({channel_id:input.channel_id,code:input.code}).whereNull('deleted_at').forUpdate().first();
    if(existing&&input.max_redemptions<existing.redemptions)throw new AppError('VALIDATION_ERROR',{message:'The limit cannot be less than existing redemptions.'});
    if(existing)await tx('inquiry_coupon').where({id:existing.id}).update({...input,updated_at:new Date()});
    else await tx('inquiry_coupon').insert({id:'icoupon_'+randomUUID(),...input,redemptions:0});
  });res.json(ok({code:input.code},id));
 }catch(error){const {status,body}=fail(error,id,true);res.status(status).json(body);}
}
