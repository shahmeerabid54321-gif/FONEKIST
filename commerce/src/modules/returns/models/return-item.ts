import { model } from "@medusajs/framework/utils";
import { ReturnRequest } from "./return-request";

/** One order line within a return request (08_DATA_MODEL.md section 13). */
export const ReturnItem = model.define("rma_item", {
  id: model.id({ prefix: "retitem" }).primaryKey(),
  request: model.belongsTo(() => ReturnRequest, { mappedBy: "items" }),
  order_line_id: model.text(),
  title: model.text(),
  quantity: model.number(),
  /** Filled in by staff when the goods arrive, not by the customer. */
  received_condition: model.text().nullable(),
  inspection_note: model.text().nullable(),
});
