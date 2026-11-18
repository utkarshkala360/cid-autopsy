// Token exchange for /sf-auth, where the client brings their own Consumer Key and Secret.
// Salesforce's token endpoint doesn't allow browser (CORS) calls, so the page posts here.
import { exchangeCode, fail, readBody } from "../exchange";

export async function POST(request: Request) {
  const b = await readBody(request);
  if (!b) return fail("invalid_request", "Body must be JSON.");
  const { host, clientId, clientSecret, code, codeVerifier, redirectUri } = b;
  if (!host || !clientId || !clientSecret || !code || !codeVerifier || !redirectUri) {
    return fail("invalid_request", "Missing a required field.");
  }
  return exchangeCode({ host, clientId, clientSecret, code, codeVerifier, redirectUri });
}
