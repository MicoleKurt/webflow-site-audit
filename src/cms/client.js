/**
 * Minimal Webflow Data API v2 client for CMS reads and item updates.
 *  - GET  /v2/sites/{site_id}/collections
 *  - GET  /v2/collections/{collection_id}                 (returns fields[])
 *  - GET  /v2/collections/{collection_id}/items           (limit max 100, offset)
 *  - PATCH /v2/collections/{collection_id}/items/{item_id}
 * Rate limits are per API key (60 requests/minute on Starter and Basic, 120 on CMS, Business and eCommerce);
 * a 429 carries Retry-After, which this client honours. The token is never included in an error message.
 */

export class WebflowApiError extends Error {
  constructor(status, body, method, path) {
    super(`Webflow API ${method} ${path} failed with HTTP ${status}${body?.message ? `: ${body.message}` : ''}`);
    this.name = 'WebflowApiError';
    this.status = status;
    this.body = body;
  }
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export class WebflowClient {
  #token;
  #fetch;
  #sleep;

  constructor({ token, fetch = globalThis.fetch, baseUrl = 'https://api.webflow.com', maxRetries = 3, sleep = defaultSleep } = {}) {
    if (!token) throw new Error('A Webflow API token is required (create a site token with the cms:read scope, plus cms:write to update items).');
    this.#token = token;
    this.#fetch = fetch;
    this.#sleep = sleep;
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.maxRetries = maxRetries;
  }

  async #request(method, path, { query, body } = {}) {
    const qs = query ? `?${new URLSearchParams(query)}` : '';
    for (let attempt = 0; ; attempt += 1) {
      const response = await this.#fetch(`${this.baseUrl}${path}${qs}`, {
        method,
        headers: {
          Authorization: `Bearer ${this.#token}`,
          Accept: 'application/json',
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      if (response.status === 429 && attempt < this.maxRetries) {
        const wait = Number(response.headers.get('retry-after')) || 60;
        await this.#sleep(wait * 1000);
        continue;
      }
      const text = await response.text();
      const json = text ? JSON.parse(text) : {};
      if (!response.ok) throw new WebflowApiError(response.status, json, method, path);
      return json;
    }
  }

  async listCollections(siteId) {
    return (await this.#request('GET', `/v2/sites/${encodeURIComponent(siteId)}/collections`)).collections ?? [];
  }

  getCollection(collectionId) {
    return this.#request('GET', `/v2/collections/${encodeURIComponent(collectionId)}`);
  }

  /** Every item of a collection, following offset pagination. */
  async listAllItems(collectionId, { pageSize = 100 } = {}) {
    const items = [];
    for (let offset = 0; ; offset += pageSize) {
      const page = await this.#request('GET', `/v2/collections/${encodeURIComponent(collectionId)}/items`, {
        query: { limit: String(pageSize), offset: String(offset) },
      });
      items.push(...(page.items ?? []));
      const total = page.pagination?.total;
      if (!page.items?.length || (total !== undefined && items.length >= total) || page.items.length < pageSize) break;
    }
    return items;
  }

  /** Updates fieldData on one item. The change is a draft until the site or item is published. */
  updateItem(collectionId, itemId, fieldData) {
    return this.#request('PATCH', `/v2/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}`, {
      body: { fieldData },
    });
  }
}
