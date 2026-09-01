import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import CodPaymentProviderService from "./service";

export default ModuleProvider(Modules.PAYMENT, {
  services: [CodPaymentProviderService],
});

export { default as CodPaymentProviderService } from "./service";
export type { CodOptions } from "./service";
