"use client";

import { useActionState, useState } from "react";
import { sendOtpAction, verifyOtpAction } from "../actions";
import { FormMessage } from "@/components/FormMessage";
import { inputClass, labelClass, primaryButtonClass, secondaryButtonClass } from "@/components/ui";

export function VerifyOtpForm({ mobile, next }: { mobile: string; next: string }) {
  const [sent, sendAction, sending] = useActionState(sendOtpAction, undefined);
  const [verified, verifyAction, verifying] = useActionState(verifyOtpAction, undefined);
  const [changing, setChanging] = useState<string | undefined>();

  // Step 2, once the OTP call has been placed.
  if (sent?.mobile && changing !== sent.mobile) {
    return (
      <form action={verifyAction} className="space-y-5">
        <input type="hidden" name="mobile" value={sent.mobile} />
        <input type="hidden" name="next" value={next} />
        <div>
          <label htmlFor="otp" className={labelClass}>OTP from the call to {sent.mobile}</label>
          <input
            id="otp"
            name="otp"
            required
            autoFocus
            inputMode="numeric"
            autoComplete="one-time-code"
            className={inputClass}
          />
        </div>
        <FormMessage state={verified} />
        <div className="flex gap-3">
          <button type="submit" disabled={verifying} className={`${primaryButtonClass} flex-1`}>
            {verifying ? "Verifying…" : "Verify OTP"}
          </button>
          <button type="button" onClick={() => setChanging(sent.mobile)} className={secondaryButtonClass}>
            Start over
          </button>
        </div>
      </form>
    );
  }

  return (
    <form action={sendAction} className="space-y-5">
      <div>
        <label htmlFor="mobile" className={labelClass}>CallAnchor portal mobile</label>
        <input
          id="mobile"
          name="mobile"
          type="tel"
          required
          defaultValue={sent?.mobile ?? mobile}
          autoComplete="tel"
          placeholder="+919876543210"
          className={inputClass}
        />
      </div>
      <FormMessage state={sent?.error ? { error: sent.error } : undefined} />
      <button type="submit" disabled={sending} className={`${primaryButtonClass} w-full`}>
        {sending ? "Placing call…" : "Send OTP"}
      </button>
      <p className="text-xs text-slate-500">CallAnchor will call this number with your OTP.</p>
    </form>
  );
}
