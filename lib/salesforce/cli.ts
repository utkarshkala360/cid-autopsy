import "server-only";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

// All Salesforce access goes through the Salesforce CLI (`sf`), vendored in sf-cli/ and
// bundled into the server functions (see next.config.ts). Each use gets a throwaway HOME, so
// the CLI's auth files never outlive the request and orgs never leak between requests.
const SF_RUN = path.join(process.cwd(), "sf-cli/node_modules/@salesforce/cli/bin/run.js");
const TIMEOUT_MS = 90_000;
const TARGET_ALIAS = "target";

export class SfCliError extends Error {
  name = "SfCliError";
}

// Only what the CLI needs; app secrets (DATABASE_URL, encryption key, ...) are not passed through.
function cliEnv(home: string): NodeJS.ProcessEnv {
  const passthrough = ["PATH", "LANG", "TMPDIR", "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY"];
  return {
    ...Object.fromEntries(passthrough.flatMap((k) => (process.env[k] ? [[k, process.env[k]]] : []))),
    NODE_ENV: "production",
    HOME: home,
    SF_USE_GENERIC_UNIX_KEYCHAIN: "true",
    SF_DISABLE_TELEMETRY: "true",
    SF_AUTOUPDATE_DISABLE: "true",
    SF_SKIP_NEW_VERSION_CHECK: "true",
    SF_HIDE_RELEASE_NOTES: "true",
    SF_DISABLE_LOG_FILE: "true",
  };
}

function runSf<T>(home: string, args: string[], stdin?: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SF_RUN, ...args, "--json"], {
      cwd: home,
      env: cliEnv(home),
      timeout: TIMEOUT_MS,
    });
    let stdout = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.resume();
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (signal) return reject(new SfCliError(`Salesforce CLI timed out (sf ${args.slice(0, 2).join(" ")}).`));
      let output: { status?: number; result?: T; message?: string };
      try {
        output = JSON.parse(stdout);
      } catch {
        return reject(new SfCliError(`Salesforce CLI exited with code ${code} and no JSON output.`));
      }
      if (output.status !== 0) return reject(new SfCliError(output.message ?? "Salesforce CLI command failed."));
      resolve(output.result as T);
    });
    child.stdin.end(stdin ?? "");
  });
}

export type SfRunner = <T>(args: string[]) => Promise<T>;

export type SfLoginResult = { orgId: string; username: string; instanceUrl: string };

// Authenticates the CLI with an SFDX auth URL (`sf org login sfdx-url`), then lets `fn` run
// commands against that org. The auth URL is passed on stdin, never as an argument.
export async function withSalesforceOrg<R>(
  authUrl: string,
  fn: (run: SfRunner, login: SfLoginResult) => Promise<R>,
): Promise<R> {
  const home = await mkdtemp(path.join(tmpdir(), "sf-"));
  try {
    const login = await runSf<SfLoginResult>(
      home,
      ["org", "login", "sfdx-url", "--sfdx-url-stdin", "-", "--alias", TARGET_ALIAS],
      authUrl,
    );
    return await fn((args) => runSf(home, [...args, "--target-org", TARGET_ALIAS]), login);
  } catch (error) {
    // Never let the credential surface in an error message.
    if (error instanceof Error) error.message = error.message.replaceAll(authUrl, "[redacted]");
    throw error;
  } finally {
    await rm(home, { recursive: true, force: true });
  }
}
