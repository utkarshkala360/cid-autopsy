import { notFound, redirect } from "next/navigation";
import { readLicense } from "@/lib/callanchor/store";
import { HEALTH_PATH, requireCallAnchorSession } from "@/lib/callanchor/session";
import { licenseHref } from "../../format";

// A phone opened by id alone moves under its client: /health/clients/<client>/licenses/<license>.
export default async function OldLicensePage({ params }: PageProps<"/dashboard/call_anchor/health/licenses/[licenseId]">) {
  const { licenseId } = await params;
  if (!/^[\w-]{1,100}$/.test(licenseId)) notFound();
  await requireCallAnchorSession(licenseHref(HEALTH_PATH, licenseId));
  const license = await readLicense(licenseId);
  if (!license) notFound();
  redirect(licenseHref(HEALTH_PATH, licenseId, license.clientId));
}
