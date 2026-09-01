import { Module } from "@medusajs/framework/utils";
import IdempotencyService from "./service";

export const IDEMPOTENCY_MODULE = "idempotency";

export default Module(IDEMPOTENCY_MODULE, {
  service: IdempotencyService,
});

export { default as IdempotencyService, hashRequest } from "./service";
