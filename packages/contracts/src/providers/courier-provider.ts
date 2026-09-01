import type { CourierState } from "../states/courier.js";
import type { Money } from "./payment-provider.js";

/**
 * Courier provider contract. Source of truth: 02_TRD.md section 6, FUL-001.
 * No storefront or admin surface may reference a specific courier directly.
 */

export interface ShipmentAddress {
  fullName: string;
  phone: string;
  province: string;
  city: string;
  area: string;
  street: string;
  landmark?: string;
  instructions?: string;
  /** Deliberately optional: Pakistan operations do not require a US-style ZIP (UX spec section 8). */
  postalCode?: string;
}

export interface ShipmentQuoteInput {
  destination: Pick<ShipmentAddress, "province" | "city" | "area">;
  weightGrams: number;
  declaredValue: Money;
  codAmount?: Money;
}

export interface ShipmentQuote {
  serviceId: string;
  serviceLabel: string;
  price: Money;
  etaMinDays: number;
  etaMaxDays: number;
  codSupported: boolean;
}

export interface CreateShipmentInput {
  orderId: string;
  orderReference: string;
  serviceId: string;
  destination: ShipmentAddress;
  parcels: { weightGrams: number; lengthCm?: number; widthCm?: number; heightCm?: number }[];
  codAmount?: Money;
  idempotencyKey: string;
}

export interface Shipment {
  providerShipmentId: string;
  trackingNumber: string;
  trackingUrl?: string;
  labelUrl?: string;
  state: CourierState;
}

export interface TrackingEvent {
  state: CourierState;
  /** Provider's own wording, shown only as secondary detail (UX spec section 10). */
  rawStatus: string;
  description?: string;
  occurredAt: Date;
  location?: string;
}

export interface TrackingState_ {
  providerShipmentId: string;
  trackingNumber: string;
  currentState: CourierState;
  events: TrackingEvent[];
  updatedAt: Date;
}

export interface CourierProvider {
  readonly id: string;
  readonly displayName: string;

  quote(input: ShipmentQuoteInput): Promise<ShipmentQuote[]>;
  createShipment(input: CreateShipmentInput): Promise<Shipment>;
  cancelShipment(id: string): Promise<void>;
  getTracking(id: string): Promise<TrackingState_>;
}

export type { TrackingState_ as CourierTrackingState };
