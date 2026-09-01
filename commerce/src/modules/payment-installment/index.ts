import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import InstallmentPaymentProviderService from "./service";

export default ModuleProvider(Modules.PAYMENT, {
  services: [InstallmentPaymentProviderService],
});

export { default as InstallmentPaymentProviderService } from "./service";
export type { InstallmentPaymentOptions } from "./service";
