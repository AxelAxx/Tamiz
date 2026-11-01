"use client";

/**
 * Shown over the current screen when the dashboard's session ends while it is open (spec
 * 008 US1, design `shell.html` "session-expired dialog"): signing in again here keeps
 * whatever the screen holds, such as an unsaved policy draft.
 */
import { Clock } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PassphraseForm } from "./passphrase-form";

export function SessionExpiredDialog({
  open,
  onSignedIn,
}: {
  readonly open: boolean;
  readonly onSignedIn: () => void;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        showCloseButton={false}
        className="max-w-sm rounded-xl"
        onEscapeKeyDown={(event) => event.preventDefault()}
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <Clock aria-hidden="true" className="size-5 text-info" />
            Your session ended
          </DialogTitle>
          <DialogDescription>
            Sign in again to continue. Unsaved work on this screen is kept.
          </DialogDescription>
        </DialogHeader>
        <PassphraseForm onSignedIn={onSignedIn} />
      </DialogContent>
    </Dialog>
  );
}
