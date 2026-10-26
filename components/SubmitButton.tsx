"use client";

import { useFormStatus } from "react-dom";

type Props = { className: string; children: React.ReactNode; pendingLabel: string };

export function SubmitButton({ className, children, pendingLabel }: Props) {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className={className}>
      {pending ? pendingLabel : children}
    </button>
  );
}
