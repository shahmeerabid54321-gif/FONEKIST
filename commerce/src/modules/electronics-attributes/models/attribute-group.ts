import { model } from "@medusajs/framework/utils";
import { AttributeDefinition } from "./attribute-definition";

/**
 * Display grouping for specifications, e.g. Performance, Display, Connectivity.
 * Source of truth: 08_DATA_MODEL.md section 4.
 */
export const AttributeGroup = model.define("attribute_group", {
  id: model.id({ prefix: "attgrp" }).primaryKey(),
  name: model.text().searchable(),
  handle: model.text().unique(),
  sort_order: model.number().default(0),
  attributes: model.hasMany(() => AttributeDefinition, { mappedBy: "group" }),
});
