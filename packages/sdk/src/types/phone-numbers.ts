// ============================================================================
// Phone Numbers
// ============================================================================

/** A phone number owned by the organization, as returned by list and get. */
export interface PhoneNumber {
  /** Unique phone number UUID. */
  id: string;
  /** The number in E.164 format. */
  number: string;
  /** Label shown in the dashboard, if one was set. */
  friendlyName: string | null;
  /** ISO country code the number belongs to. */
  countryCode: string;
  /** Monthly price as a string, or null when the number is billed to the customer's own Twilio subaccount. */
  price: string | null;
  /** Twilio IncomingPhoneNumber SID. */
  sid: string;
  /** Twilio API routing region the number was purchased through (e.g. "us1", "ie1"). */
  region: string;
  /** ISO 8601 creation timestamp. */
  createdAt: string;
}

/** Filters and pagination for `client.phoneNumbers.list()`. */
export type ListPhoneNumbersParams = {
  /** Page to return. Defaults to 1. */
  page?: number;
  /** Numbers per page. Defaults to 20, maximum 100. */
  limit?: number;
  /** Matches on the number itself or its friendly name. */
  search?: string;
};

/** A phone number available to purchase, as returned by the availability search. */
export interface AvailablePhoneNumber {
  /** The number in E.164 format. */
  phoneNumber: string;
  /** Twilio's label for the number. */
  friendlyName: string;
  /** Monthly price as a string, or null when Twilio did not quote one. */
  price: string | null;
  /** Currency the price is quoted in. */
  currency: string | null;
}

/** Filters for `client.phoneNumbers.searchAvailable()`. */
export type SearchAvailablePhoneNumbersParams = {
  /** ISO country code (e.g. "US", "GB", "BE"). */
  country: string;
  /** Area code filter, digits only. Twilio applies it to US and Canada numbering plans. */
  areaCode?: string;
  /** Number type. Defaults to "local". */
  type?: "mobile" | "local";
  /** Maximum candidates to return. Defaults to 5, maximum 50. */
  limit?: number;
  sms?: boolean;
  mms?: boolean;
  voice?: boolean;
};

// ============================================================================
// Buy
// ============================================================================

/** Request body for `client.phoneNumbers.buy()` and `client.channels.buyPhoneNumber()`. */
export interface BuyPhoneNumberBody {
  /** Number to purchase, in E.164 form. */
  phoneNumber: string;
  /** ISO country code the number belongs to. */
  country: string;
  /** Price quoted by `searchAvailable()`, echoed back to confirm it. */
  price: string;
  /** Twilio subaccount connection to buy on. Omit to buy on the shared pool. */
  connectionId?: string;
}

// ============================================================================
// Release
// ============================================================================

/** Lifecycle status of a phone number. */
export type PhoneNumberStatus = "ACTIVE" | "PENDING_RELEASE" | "RELEASING" | "RELEASED" | "DELETED";

/**
 * Response from `client.phoneNumbers.release()`.
 *
 * Releasing detaches the number from every deployment and deregisters its
 * WhatsApp senders before marking the row released — the row is kept rather
 * than deleted, because it records which Twilio account the number came from.
 */
export interface ReleasePhoneNumberResponse {
  /** Phone number UUID. */
  id: string;
  /** The number itself, in E.164 form. */
  number: string;
  /** Status after the release. */
  status: PhoneNumberStatus;
  /** ISO 8601 release timestamp, or `null` when the release has not settled. */
  releasedAt: string | null;
  /** Id of the user who released it, or `null`. */
  releasedBy: string | null;
  /** Deployments detached from the number. */
  detachedDeployments: number;
  /** WhatsApp senders deregistered. */
  removedWhatsappSenders: number;
  /**
   * `false` when Twilio refused the release. The number is gone in Nexus and an
   * admin issue was filed, but Twilio may still be billing for it.
   */
  twilioReleased: boolean;
}
