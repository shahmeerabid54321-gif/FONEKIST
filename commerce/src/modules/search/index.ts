import { Module } from "@medusajs/framework/utils";
import SearchIndexService from "./service";

export const SEARCH_MODULE = "search_index";

export default Module(SEARCH_MODULE, {
  service: SearchIndexService,
});

export { default as SearchIndexService } from "./service";
export * from "./normalize";
export * from "./query";
