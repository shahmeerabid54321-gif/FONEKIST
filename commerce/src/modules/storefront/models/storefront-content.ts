import { model } from "@medusajs/framework/utils";
export const StorefrontContent = model.define('storefront_content', {
  id: model.id({prefix:'sfcontent'}).primaryKey(), channel_id: model.text().unique(),
  configuration: model.json(), revision: model.number().default(1), updated_by: model.text(),
});
