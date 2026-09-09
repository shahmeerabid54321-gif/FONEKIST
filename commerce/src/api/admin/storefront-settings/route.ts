import type { AuthenticatedMedusaRequest, MedusaResponse } from '@medusajs/framework/http';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
import { AppError, storefrontSettingsSchema } from '@pk/contracts';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { storefrontSettings } from '../../../lib/storefront-settings';
import { revalidateStorefront } from '../../../lib/storefront-revalidation';
import { fail, ok, requestIdOf } from '../../../lib/http';
const schema=z.object({channel_id:z.string().min(1).max(100),revision:z.number().int().nonnegative(),configuration:storefrontSettingsSchema});
export async function GET(req:AuthenticatedMedusaRequest,res:MedusaResponse) {
  const id=requestIdOf(req);
  try {
    if(!req.auth_context?.actor_id)throw new AppError('AUTHENTICATION_REQUIRED');
    const channel=String(req.query.channel_id??'');if(!channel)throw new AppError('VALIDATION_ERROR');
    res.json(ok(await storefrontSettings(req,channel),id));
  }catch(error){const {status,body}=fail(error,id,true);res.status(status).json(body);}
}
export async function POST(req:AuthenticatedMedusaRequest,res:MedusaResponse) {
  const id=requestIdOf(req);
  try {
    const actor=req.auth_context?.actor_id;if(!actor)throw new AppError('AUTHENTICATION_REQUIRED');
    const parsed=schema.safeParse(req.body);if(!parsed.success)throw new AppError('VALIDATION_ERROR',{fieldErrors:parsed.error.flatten().fieldErrors});
    const input=parsed.data;
    const query=req.scope.resolve(ContainerRegistrationKeys.QUERY);
    const {data:channels}=await query.graph({entity:'sales_channel',fields:['id'],filters:{id:input.channel_id}});
    if(!channels.length)throw new AppError('NOT_FOUND');
    const db=req.scope.resolve(ContainerRegistrationKeys.PG_CONNECTION);
    await db.transaction(async (tx)=> {
      // A row-specific advisory lock also covers the first save where no row exists yet.
      await tx.raw('SELECT pg_advisory_xact_lock(hashtext(?))',['storefront-settings:'+input.channel_id]);
      const row=await tx('storefront_content').where({channel_id:input.channel_id}).whereNull('deleted_at').first();
      if((row?.revision??0)!==input.revision)throw new AppError('CONFLICT',{message:'Settings changed. Reload before saving.'});
      const data={configuration:JSON.stringify(input.configuration),revision:input.revision+1,updated_by:actor,updated_at:new Date()};
      if(row)await tx('storefront_content').where({id:row.id}).update(data);
      else await tx('storefront_content').insert({id:'sfcontent_'+randomUUID(),channel_id:input.channel_id,...data});
    });
    await revalidateStorefront(['storefront-settings'], req.scope.resolve(ContainerRegistrationKeys.LOGGER));
    res.json(ok({revision:input.revision+1},id));
  }catch(error){const {status,body}=fail(error,id,true);res.status(status).json(body);}
}
