import { Module } from "@medusajs/framework/utils";
import WarrantyService from "./service";

export const WARRANTY_MODULE = "warranty";

export default Module(WARRANTY_MODULE, {
  service: WarrantyService,
});

export { default as WarrantyService, WarrantySnapshotImmutableError } from "./service";
