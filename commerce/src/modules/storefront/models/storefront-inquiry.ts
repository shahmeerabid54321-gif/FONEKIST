import { model } from "@medusajs/framework/utils";
export const StorefrontInquiry = model.define('storefront_inquiry', {
  id: model.id({prefix:'inq'}).primaryKey(), reference: model.text().unique(), channel_id: model.text(),
  submission_key: model.text(), request_fingerprint: model.text(),
  state: model.enum(['new','contacted','closed','cancelled']).default('new'),
  customer_encrypted: model.text().nullable(), items: model.json(),
  advance_pkr: model.number(), discount_pkr: model.number(), coupon_code: model.text().nullable(),
  terms_version: model.text(), consent_text: model.text(), purge_after: model.dateTime(),
}).indexes([{on:['channel_id','submission_key'],unique:true},{on:['state']},{on:['purge_after']}]);
