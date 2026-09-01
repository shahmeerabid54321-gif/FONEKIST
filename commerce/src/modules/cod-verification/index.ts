import { Module } from "@medusajs/framework/utils";
import CodVerificationService from "./service";

export const COD_VERIFICATION_MODULE = "cod_verification";

export default Module(COD_VERIFICATION_MODULE, {
  service: CodVerificationService,
});

export { default as CodVerificationService } from "./service";
export * from "./codes";
export * from "./policy";
