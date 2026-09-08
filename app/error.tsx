"use client";
import { ErrorState } from "./ui/primitives";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <ErrorState retry={reset}>
      This screen could not be displayed. Retry to restore visibility.
    </ErrorState>
  );
}
