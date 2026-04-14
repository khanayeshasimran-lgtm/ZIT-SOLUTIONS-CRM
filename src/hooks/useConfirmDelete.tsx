/**
 * hooks/useConfirmDelete.tsx
 *
 * Provides a single AlertDialog-based delete confirmation.
 * Drop <ConfirmDeleteDialog /> anywhere in the tree, call `confirm()`
 * from any button — no per-page AlertDialog copy-paste.
 *
 * Usage:
 *   const { confirm, ConfirmDeleteDialog } = useConfirmDelete();
 *
 *   // in JSX:
 *   <Button onClick={() => confirm({ title: "Delete lead?", onConfirm: () => handleDelete(id) })} />
 *   <ConfirmDeleteDialog />
 */

import { useState, useCallback, type ReactNode } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogCancel,
  AlertDialogAction,
} from "@/components/ui/alert-dialog";

interface ConfirmOptions {
  title?: string;
  description?: string;
  onConfirm: () => void | Promise<void>;
}

export function useConfirmDelete() {
  const [open, setOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const [pending, setPending] = useState(false);

  const confirm = useCallback((opts: ConfirmOptions) => {
    setOptions(opts);
    setOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!options) return;
    setPending(true);
    try {
      await options.onConfirm();
    } finally {
      setPending(false);
      setOpen(false);
    }
  }, [options]);

  const ConfirmDeleteDialog = () => (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {options?.title ?? "Are you sure?"}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {options?.description ?? "This action cannot be undone."}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={pending}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            onClick={handleConfirm}
            disabled={pending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {pending ? "Deleting…" : "Delete"}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );

  return { confirm, ConfirmDeleteDialog };
}