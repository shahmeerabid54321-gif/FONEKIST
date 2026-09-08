import { model } from "@medusajs/framework/utils";
export const InquiryAccess = model.define('inquiry_access', {
  id: model.id({prefix:'inqaccess'}).primaryKey(), inquiry_id: model.text(), actor_id: model.text(), action: model.text(),
}).indexes([{on:['inquiry_id']}]);
