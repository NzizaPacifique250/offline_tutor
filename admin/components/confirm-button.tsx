"use client";

type Props = { message: string; className?: string; children: React.ReactNode };

// Submit button that asks the admin to confirm before the form is sent.
export function ConfirmButton({ message, className, children }: Props) {
  return (
    <button
      type="submit"
      className={className}
      onClick={(event) => {
        if (!window.confirm(message)) event.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
