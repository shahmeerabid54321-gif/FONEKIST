import { ModuleProvider, Modules } from "@medusajs/framework/utils";
import OutboxNotificationProvider from "./service";

export default ModuleProvider(Modules.NOTIFICATION, {
  services: [OutboxNotificationProvider],
});

export { default as OutboxNotificationProvider } from "./service";
