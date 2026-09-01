import { Module } from "@medusajs/framework/utils";
import ElectronicsAttributesService from "./service";

export const ELECTRONICS_ATTRIBUTES_MODULE = "electronics_attributes";

export default Module(ELECTRONICS_ATTRIBUTES_MODULE, {
  service: ElectronicsAttributesService,
});

export { default as ElectronicsAttributesService } from "./service";
export * from "./normalize";
