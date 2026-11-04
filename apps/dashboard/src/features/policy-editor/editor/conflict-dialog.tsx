"use client";
import { Copy, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const _CARD = "rounded-xl border bg-card text-card-foreground shadow-xs";

export function ConflictDialog({
  open,
  onCopy,
  onReload,
  onClose,
}: {
  readonly open: boolean;
  readonly onCopy: () => void;
  readonly onReload: () => void;
  readonly onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="max-w-md rounded-xl" data-component="conflict-dialog">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base font-semibold">
            <TriangleAlert aria-hidden="true" className="size-5 text-warning" />
            The policy changed
          </DialogTitle>
          <DialogDescription>
            Someone saved a newer version while you were editing. Saving now would overwrite it, so
            nothing was saved. Copy your draft if you want to keep it, then reload.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCopy}>
            <Copy aria-hidden="true" />
            Copy my draft first
          </Button>
          <Button variant="destructive" onClick={onReload}>
            Reload (lose my changes)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Asks before leaving the page, or following a link inside it, with unsaved changes. */
