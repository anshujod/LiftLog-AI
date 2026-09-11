import type { ReactNode } from "react";

interface ErrorNoteProps {
  message: string;
  action?: ReactNode;
}

/** One error presentation: bordered card with role=alert (existing
 * getByRole("alert") queries keep passing). */
export function ErrorNote({ message, action }: ErrorNoteProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-lg border border-danger/40 bg-danger/10 p-3 text-sm"
    >
      <p>{message}</p>
      {action}
    </div>
  );
}
