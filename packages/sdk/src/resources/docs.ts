import { BaseResource } from "./base-resource";

export interface SearchDocsParams {
  query: string;
  limit?: number;
  section?: string;
}

export interface SearchDocsResult {
  title: string;
  snippet: string;
  url: string;
  section: string;
  score: number;
}

export interface SearchDocsResponse {
  results: SearchDocsResult[];
}

export class DocsResource extends BaseResource {
  async search(params: SearchDocsParams): Promise<SearchDocsResponse> {
    return this.http.request<SearchDocsResponse>("POST", "/docs/search", { body: params });
  }
}
