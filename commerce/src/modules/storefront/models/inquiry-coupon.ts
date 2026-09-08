import { model } from "@medusajs/framework/utils";
export const InquiryCoupon = model.define('inquiry_coupon', {
  id: model.id({prefix:'icoupon'}).primaryKey(), channel_id: model.text(), code: model.text(),
  discount_pkr: model.number(), minimum_advance_pkr: model.number(), max_redemptions: model.number(),
  redemptions: model.number().default(0), active: model.boolean().default(true), expires_at: model.dateTime().nullable(),
}).indexes([{on:['channel_id','code'],unique:true}]);
