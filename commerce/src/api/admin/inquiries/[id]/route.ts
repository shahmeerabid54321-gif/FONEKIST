import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { AppError,maskCnic } from '@pk/contracts';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { decryptCustomer } from '../../../../lib/inquiry-privacy';
import { fail,ok,requestIdOf } from '../../../../lib/http';
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse) {
 const id=requestIdOf(req);res.setHeader('Cache-Control','no-store');
 try {
  const actor=req.auth_context?.actor_id;if(!actor)throw new AppError('AUTHENTICATION_REQUIRED');
  const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  const row=await db('storefront_inquiry').where({id:req.params.id}).whereNull('deleted_at').first();if(!row)throw new AppError('NOT_FOUND');
  const customer=row.customer_encrypted&&new Date(row.purge_after)>new Date()?decryptCustomer(row.customer_encrypted):null;
  // Identity is always masked in the inquiry screen. Even contact-detail access is audited.
  if(customer){await db('inquiry_access').insert({id:'inqaccess_'+randomUUID(),inquiry_id:row.id,actor_id:actor,action:'contact.read'});customer.cnic=maskCnic(customer.cnic);}
  res.json(ok({inquiry:{id:row.id,reference:row.reference,state:row.state,items:row.items,advance_pkr:row.advance_pkr,discount_pkr:row.discount_pkr,coupon_code:row.coupon_code,created_at:row.created_at,customer}},id));
 }catch(error){const {status,body}=fail(error,id,true);res.status(status).json(body);}
}
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse) {
 const id=requestIdOf(req);
 try {
  const actor=req.auth_context?.actor_id;if(!actor)throw new AppError('AUTHENTICATION_REQUIRED');
  const parsed=z.object({state:z.enum(['new','contacted','closed','cancelled']),previous_state:z.enum(['new','contacted','closed','cancelled'])}).safeParse(req.body);
  if(!parsed.success)throw new AppError('VALIDATION_ERROR');
  const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);
  await db.transaction(async tx=>{
    const changed=await tx('storefront_inquiry').where({id:req.params.id,state:parsed.data.previous_state}).whereNull('deleted_at').update({state:parsed.data.state,updated_at:new Date()});
    if(!changed)throw new AppError('CONFLICT',{message:'This inquiry changed. Reload before updating.'});
    await tx('inquiry_access').insert({id:'inqaccess_'+randomUUID(),inquiry_id:req.params.id,actor_id:actor,action:'state.'+parsed.data.state});
  });res.json(ok({state:parsed.data.state},id));
 }catch(error){const {status,body}=fail(error,id,true);res.status(status).json(body);}
}
