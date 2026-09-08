import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { AppError } from '@pk/contracts';
import { fail,ok,requestIdOf } from '../../../lib/http';
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse) {
 const id=requestIdOf(req);res.setHeader('Cache-Control','no-store');
 try {
  if(!req.auth_context?.actor_id)throw new AppError('AUTHENTICATION_REQUIRED');
  const channel=String(req.query.channel_id??'');if(!channel)throw new AppError('VALIDATION_ERROR');
  const offset=Number(req.query.offset??0);if(!Number.isSafeInteger(offset)||offset<0)throw new AppError('VALIDATION_ERROR');
  const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  const base=()=>db('storefront_inquiry').where({channel_id:channel}).whereNull('deleted_at');
  const inquiries=await base().select('id','reference','state','items','advance_pkr','discount_pkr','coupon_code','created_at').orderBy('created_at','desc').limit(30).offset(offset);
  const count=await base().count('* as count').first();
  res.json(ok({inquiries,count:Number(count?.count??0)},id));
 }catch(error){const {status,body}=fail(error,id,true);res.status(status).json(body);}
}
