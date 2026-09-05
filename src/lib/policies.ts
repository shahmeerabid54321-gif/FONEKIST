import { publicEnv } from "./env";

/**
 * Store policies.
 *
 * Held as structured content rather than prose so the same figures appear on the policy
 * page, the PDP and the application, and so a change to the return window is one edit.
 *
 * The installments policy is the one that matters most here, because FONEKIST is the
 * lender: what it says about identity documents and about what happens when an application
 * is declined is a commitment, not marketing copy. It is written to match exactly what the
 * code does (`purge-installment-documents`, `release-expired-installments`), because a
 * policy page that promises something the system does not do is worse than none.
 */

export interface Policy {
  slug: string;
  title: string;
  summary: string;
  sections: { heading: string; body: string[] }[];
}

export const RETURN_WINDOW_DAYS = publicEnv.NEXT_PUBLIC_RETURN_WINDOW_DAYS;

export const POLICIES: Record<string, Policy> = {
  installments: {
    slug: "installments",
    title: "Buying on installments",
    summary:
      "One cash price, one installment price, and the difference between them shown in rupees before you apply.",
    sections: [
      {
        heading: "This is a purchase, not a loan",
        body: [
          "You buy the handset at an installment price, which is higher than the cash price. We show you the cash price, the advance, the monthly amount, the number of months, the total you will pay and the exact difference from the cash price in rupees, on the same screen, before you apply.",
          "Those figures do not change afterwards. What you agreed to is recorded against your application, and editing a plan in our catalogue cannot change it.",
        ],
      },
      {
        heading: "What we need from you",
        body: [
          "Your CNIC, both sides. Your guarantor's CNIC, both sides. Your contact details, your delivery address, and what you earn each month.",
          "Your guarantor must be someone other than you and must know they are being named.",
          "You must be 18 or older.",
        ],
      },
      {
        heading: "What happens after you apply",
        body: [
          "We set the handset aside for you while we review the application. Nothing is charged at this point, and no payment is taken through this website at any stage.",
          "A person reads your application. We will tell you the outcome either way, by email.",
          "If we approve it, we call you to arrange the advance and sign the agreement. We will never ask for card or bank details over the phone.",
          "If we decline it, or if we do not manage to review it within the review window, the handset is released and nothing is charged. You are welcome to apply again.",
        ],
      },
      {
        heading: "Your documents",
        body: [
          "Your CNIC and your guarantor's CNIC are used to decide the application and, if it is approved, to service the agreement. They are used for nothing else.",
          "Only the staff who review applications can see them. Every time one is opened it is recorded, including who opened it and when.",
          "We delete the documents and the CNIC numbers 90 days after we decline or cancel an application, and 90 days after an approved agreement has been settled. We keep the record of the decision itself, which is what lets us answer a question about it later.",
        ],
      },
      {
        heading: "Cancelling",
        body: [
          "You can cancel an application at any time before we approve it. Contact us with your application reference.",
        ],
      },
    ],
  },

  returns: {
    slug: "returns",
    title: "Returns and refunds",
    summary: `Report a fault, a wrong item or a damaged delivery within ${RETURN_WINDOW_DAYS} days and we arrange collection.`,
    sections: [
      {
        heading: `The ${RETURN_WINDOW_DAYS}-day window`,
        body: [
          `You can request a return within ${RETURN_WINDOW_DAYS} days of delivery if the handset is faulty, was damaged in transit, or is not the product described on the listing.`,
          "Tell us as soon as you notice a problem. Photographs of the handset and its packaging help us resolve the claim faster.",
        ],
      },
      {
        heading: "What is not covered",
        body: [
          "Physical or liquid damage caused after delivery, normal wear, and consumable parts are not covered by a return.",
          "Software or account issues that are not a fault of the hardware are handled by the manufacturer's support rather than a return.",
        ],
      },
      {
        heading: "How a return works",
        body: [
          "Start the request from your order page or by contacting support with your order reference.",
          "We confirm eligibility, arrange collection, and inspect the handset on arrival.",
          "An approved refund is returned by bank transfer to an account in the name of the person on the agreement. Where an advance has been paid, it is refunded in full and the remaining installments are cancelled.",
          "A handset bought on installments is handled case by case, because there is an agreement to unwind as well as goods to return. Contact us and we will explain exactly what happens before anything is collected.",
        ],
      },
    ],
  },

  warranty: {
    slug: "warranty",
    title: "Warranty",
    summary:
      "Every handset states its warranty type, provider and duration before you buy, and that promise is recorded against your order.",
    sections: [
      {
        heading: "What the warranty on a listing means",
        body: [
          "Manufacturer warranty is serviced by the brand's authorised service centre.",
          "Distributor warranty is serviced by the local authorised distributor who imported the unit.",
          "Shop warranty is serviced by us directly.",
          "Where a handset carries no warranty, the listing says so explicitly rather than leaving it blank.",
        ],
      },
      {
        heading: "The terms are fixed at purchase",
        body: [
          "When you place an order, the warranty type, provider, duration and terms shown at that moment are recorded against your order line.",
          "If we later change the warranty on a listing, your order keeps the terms you were shown.",
        ],
      },
    ],
  },

  pta: {
    slug: "pta",
    title: "PTA status",
    summary:
      "Every listing says whether the handset is PTA approved. We do not leave it blank and we do not imply it.",
    sections: [
      {
        heading: "What PTA approved means",
        body: [
          "A PTA approved handset is registered with the Pakistan Telecommunication Authority and works on local networks indefinitely. The registration duty has already been paid and is included in the price you see.",
        ],
      },
      {
        heading: "What not approved means",
        body: [
          "A handset that is not PTA approved works on local networks for a limited period and is then blocked until it is registered. Registering it is your responsibility and the duty is payable separately, on top of the price shown here.",
          "We sell these only where the listing says so plainly, in the specification and beside the price. If you are not sure, ask us before you order.",
        ],
      },
    ],
  },

  delivery: {
    slug: "delivery",
    title: "Delivery",
    summary: "Delivery cost and an estimated time range are confirmed when your application is approved.",
    sections: [
      {
        heading: "Cost and timing",
        body: [
          "Standard delivery starts at Rs 200 within Karachi and Rs 250 to Rs 550 elsewhere depending on the destination. The cost is confirmed with you before dispatch.",
          "Express delivery is available in Karachi, Lahore, Islamabad and Rawalpindi.",
          "Estimates are working-day ranges from dispatch, not guaranteed dates. We do not promise an exact delivery date we cannot control.",
        ],
      },
      {
        heading: "When we deliver",
        body: [
          "Nothing is dispatched from the website. A handset is delivered once your application is approved, the advance is paid and the agreement is signed.",
          "We call you to arrange all three before anything ships.",
          "Delivery is not available in Gilgit-Baltistan or Azad Jammu & Kashmir, where the return leg makes it impractical.",
        ],
      },
      {
        heading: "Receiving your order",
        body: [
          "Check the packaging before accepting the delivery. If the box is visibly damaged, note it with the courier.",
          "You receive a tracking number by email when your handset ships.",
        ],
      },
    ],
  },
};

export const POLICY_SLUGS = Object.keys(POLICIES);
