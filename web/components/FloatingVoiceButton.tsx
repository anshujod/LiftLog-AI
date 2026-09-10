"use client";

interface FloatingVoiceButtonProps {
  listening: boolean;
  disabled?: boolean;
  onPress: () => void;
}

function MicIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="9" y="2" width="6" height="12" rx="3" fill="currentColor" />
      <path
        d="M5 10a7 7 0 0 0 14 0h-2a5 5 0 0 1-10 0H5Zm7 9v3"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function StopIcon() {
  return <span className="block h-5 w-5 rounded-sm bg-current" aria-hidden="true" />;
}

/**
 * Push-to-talk entry point for voice set logging. Sits above the bottom tab
 * bar on the active-workout screen. Hidden entirely where the Web Speech API
 * is unavailable — the parent decides that from `useVoiceInput().supported`.
 */
export function FloatingVoiceButton({ listening, disabled, onPress }: FloatingVoiceButtonProps) {
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={listening ? "Stop listening" : "Log sets by voice"}
      aria-pressed={listening}
      className={`fixed bottom-24 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg disabled:opacity-50 ${
        listening ? "animate-pulse bg-danger" : "bg-accent"
      }`}
    >
      {listening ? <StopIcon /> : <MicIcon />}
    </button>
  );
}
