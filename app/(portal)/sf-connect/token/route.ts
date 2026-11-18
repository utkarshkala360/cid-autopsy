// Token exchange for /sf-connect: uses our packaged Connected App, whose Consumer Key and Secret
// live only in env vars (SF_PACKAGE_CLIENT_ID, SF_PACKAGE_CLIENT_SECRET) and never reach the browser.
import { exchangeCode, fail, readBody } from "../../sf-auth/exchange";

export async function POST(request: Request) {
  const clientId = process.env.SF_PACKAGE_CLIENT_ID;
  const clientSecret = process.env.SF_PACKAGE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail("not_configured", "The packaged app isn't set up yet.", 503);

  const b = await readBody(request);
  if (!b) return fail("invalid_request", "Body must be JSON.");
  const { host, code, codeVerifier, redirectUri } = b;
  if (!host || !code || !codeVerifier || !redirectUri) return fail("invalid_request", "Missing a required field.");

  // The secret is ours, so only redeem codes issued to this page's callback on this site.
  let callback: URL;
  try {
    callback = new URL(redirectUri);
  } catch {
    return fail("invalid_request", "Bad redirect URI.");
  }
  if (callback.pathname !== "/sf-connect" || callback.host !== request.headers.get("host")) {
    return fail("invalid_request", "Redirect URI must be this site's /sf-connect.");
  }

  return exchangeCode({ host, clientId, clientSecret, code, codeVerifier, redirectUri });
}
