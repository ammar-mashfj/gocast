"use client"

import type { Station } from "@/interfaces/Station"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ds/Dialog"
import { StationForm } from "./station-form/StationForm"

/**
 * Edit the station's profile in a dialog (Profile → Edit, the overview's
 * header and checklist). The form is StationForm, the same one the create
 * page shows; it mounts with the dialog, so a cancelled edit doesn't come
 * back next time it opens.
 */
export function StationFormDialog({ open, onClose, station }: { open: boolean; onClose: () => void; station: Station }) {
  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit station</DialogTitle>
          <DialogDescription>What listeners see on your player page.</DialogDescription>
        </DialogHeader>
        <StationForm station={station} onDone={onClose} actions={(submit) => <DialogFooter>{submit}</DialogFooter>} />
      </DialogContent>
    </Dialog>
  )
}
