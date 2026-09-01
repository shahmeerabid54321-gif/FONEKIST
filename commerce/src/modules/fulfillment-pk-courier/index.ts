import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import PkCourierFulfillmentProvider from "./service";

export const PK_COURIER_PROVIDER_ID = "pk-courier";

export default ModuleProvider(Modules.FULFILLMENT, {
  services: [PkCourierFulfillmentProvider],
});

export { default as PkCourierFulfillmentProvider } from "./service";
