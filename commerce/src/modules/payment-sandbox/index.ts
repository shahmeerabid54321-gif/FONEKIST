import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import SandboxPaymentProviderService from "./service";

export default ModuleProvider(Modules.PAYMENT, {
  services: [SandboxPaymentProviderService],
});

export { default as SandboxPaymentProviderService } from "./service";
export * from "./signature";
export { sandboxPsp } from "./sandbox-psp";
