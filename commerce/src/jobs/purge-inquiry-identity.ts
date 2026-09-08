import type { MedusaContainer } from '@medusajs/framework/types';
import { ContainerRegistrationKeys } from '@medusajs/framework/utils';
export default async function purgeInquiryIdentity(container:MedusaContainer) {
 const db=container.resolve(ContainerRegistrationKeys.PG_CONNECTION);
 await db('storefront_inquiry').where('purge_after','<=',new Date()).whereNotNull('customer_encrypted').update({customer_encrypted:null,updated_at:new Date()});
}
export const config={name:'purge-inquiry-identity',schedule:'0 * * * *'};
