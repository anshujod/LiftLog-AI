import type { ReactNode } from "react";

interface ErrorNoteProps {
  message: string;
  action?: ReactNode;
}

/** One error presentation: flat hairline block with role=alert (existing
 * getByRole("alert") queries keep passing). */
export function ErrorNote({ message, action }: ErrorNoteProps) {
  return (
    <div
      role="alert"
      className="flex flex-col items-start gap-2 rounded-[2px] border-l-2 border-danger bg-surface p-3 text-sm"
    >
      <p>{message}</p>
      {action}
    </div>
  );
}
