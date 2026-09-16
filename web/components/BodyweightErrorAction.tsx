"use client";

import { useState } from "react";
import Link from "next/link";
import { BodyweightSheet } from "@/components/BodyweightSheet";
import { notifyBodyweightSaved } from "@/lib/api/bodyweight-events";
import { Button } from "@/components/ui/Button";

/**
 * Inline escape hatch for `bodyweight_required` error cards: opens the entry
 * sheet in place, notifies the app on save, then runs the card's retry.
 */
export function BodyweightErrorAction({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <span className="flex flex-wrap items-center gap-2">
        <Button variant="primary" size="sm" onClick={() => setOpen(true)}>
          Set body weight
        </Button>
        <Link href="/profile" className="text-sm text-accent hover:underline">
          Go to Profile
        </Link>
      </span>
      {open && (
        <BodyweightSheet
          onClose={() => setOpen(false)}
          onSaved={() => {
            setOpen(false);
            notifyBodyweightSaved();
            onSaved();
          }}
        />
      )}
    </>
  );
}
