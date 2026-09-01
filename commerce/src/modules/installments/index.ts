import { Module } from "@medusajs/framework/utils";
import InstallmentsService from "./service";

export const INSTALLMENTS_MODULE = "installments";

export default Module(INSTALLMENTS_MODULE, {
  service: InstallmentsService,
});

export { default as InstallmentsService } from "./service";
export * from "./models";
