import type { HttpClient } from "../http-client";

/** Base class for all SDK resource classes. Provides access to the HTTP client. */
export abstract class BaseResource {
  protected readonly http: HttpClient;

  constructor(http: HttpClient) {
    this.http = http;
  }
}
