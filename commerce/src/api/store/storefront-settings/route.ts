import type { MedusaStoreRequest, MedusaResponse } from '@medusajs/framework/http';
import { storeChannel, storefrontSettings } from '../../../lib/storefront-settings';
import { fail, ok, requestIdOf } from '../../../lib/http';
export async function GET(req:MedusaStoreRequest,res:MedusaResponse) {
  const id=requestIdOf(req);
  try {res.json(ok(await storefrontSettings(req,storeChannel(req)),id));}
  catch(error){const {status,body}=fail(error,id,true);res.status(status).json(body);}
}
