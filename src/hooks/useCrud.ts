/**
 * hooks/useCrud.ts
 *
 * Universal CRUD hook powered by React Query.
 * Eliminates the repeated fetch → dialog → submit → toast pattern.
 *
 * Usage:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * import { useCrud } from '@/hooks/useCrud';
 * import { fetchLeads, createLead, updateLead, deleteLead } from '@/services/leads.service';
 *
 * const {
 *   items,
 *   isLoading,
 *   error,
 *   create,
 *   update,
 *   remove,
 *   invalidate,
 * } = useCrud({
 *   queryKey: ['leads'],
 *   fetcher:  () => fetchLeads(),
 *   onCreate: (input) => createLead(input, userId),
 *   onUpdate: (id, input) => updateLead(id, input, userId, userRole),
 *   onDelete: (id) => deleteLead(id, userId, userRole),
 *   toast,
 *   messages: {
 *     created: 'Lead created',
 *     updated: 'Lead updated',
 *     deleted: 'Lead deleted',
 *   },
 * });
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryResult,
} from '@tanstack/react-query';
import { handleError } from '@/lib/errorHandler';

// ── Types ──────────────────────────────────────────────────────────────────────

interface ToastFn {
  (opts: { variant?: 'destructive'; title: string; description?: string }): void;
}

interface CrudMessages {
  created?: string;
  updated?: string;
  deleted?: string;
}

interface UseCrudOptions<TItem, TInput> {
  queryKey:  unknown[];
  fetcher:   () => Promise<TItem[]>;
  onCreate?: (input: TInput)                    => Promise<TItem | void>;
  onUpdate?: (id: string, input: Partial<TInput>) => Promise<void>;
  onDelete?: (id: string)                       => Promise<void>;
  toast?:    ToastFn;
  messages?: CrudMessages;
  /** Extra options for useQuery */
  staleTime?: number;
}

interface UseCrudResult<TItem, TInput> {
  items:       TItem[];
  isLoading:   boolean;
  isFetching:  boolean;
  error:       Error | null;
  isCreating:  boolean;
  isUpdating:  boolean;
  isDeleting:  boolean;
  create:      (input: TInput)                    => Promise<boolean>;
  update:      (id: string, input: Partial<TInput>) => Promise<boolean>;
  remove:      (id: string)                       => Promise<boolean>;
  invalidate:  () => void;
  queryResult: UseQueryResult<TItem[], Error>;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useCrud<TItem extends { id: string }, TInput>({
  queryKey,
  fetcher,
  onCreate,
  onUpdate,
  onDelete,
  toast,
  messages = {},
  staleTime,
}: UseCrudOptions<TItem, TInput>): UseCrudResult<TItem, TInput> {
  const qc = useQueryClient();

  // ── Query ──────────────────────────────────────────────────────────────────
  const queryResult = useQuery<TItem[], Error>({
    queryKey,
    queryFn: fetcher,
    ...(staleTime !== undefined ? { staleTime } : {}),
  });

  // ── Create mutation ────────────────────────────────────────────────────────
  const createMutation = useMutation<TItem | void, Error, TInput>({
    mutationFn: (input) => {
      if (!onCreate) throw new Error('onCreate not provided');
      return onCreate(input);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast?.({ title: messages.created ?? 'Created successfully' });
    },
    onError: (err) => {
      handleError(err, { context: `create:${queryKey[0]}`, toast });
    },
  });

  // ── Update mutation ────────────────────────────────────────────────────────
  const updateMutation = useMutation<void, Error, { id: string; input: Partial<TInput> }>({
    mutationFn: ({ id, input }) => {
      if (!onUpdate) throw new Error('onUpdate not provided');
      return onUpdate(id, input);
    },
    onMutate: async ({ id, input }) => {
      // Optimistic update
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<TItem[]>(queryKey);
      if (prev) {
        qc.setQueryData<TItem[]>(
          queryKey,
          prev.map((item) => (item.id === id ? { ...item, ...input } : item))
        );
      }
      return { prev };
    },
    onError: (err, _vars, ctx: any) => {
      // Roll back optimistic update
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      handleError(err, { context: `update:${queryKey[0]}`, toast });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast?.({ title: messages.updated ?? 'Updated successfully' });
    },
  });

  // ── Delete mutation ────────────────────────────────────────────────────────
  const deleteMutation = useMutation<void, Error, string>({
    mutationFn: (id) => {
      if (!onDelete) throw new Error('onDelete not provided');
      return onDelete(id);
    },
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey });
      const prev = qc.getQueryData<TItem[]>(queryKey);
      if (prev) {
        qc.setQueryData<TItem[]>(queryKey, prev.filter((item) => item.id !== id));
      }
      return { prev };
    },
    onError: (err, _id, ctx: any) => {
      if (ctx?.prev) qc.setQueryData(queryKey, ctx.prev);
      handleError(err, { context: `delete:${queryKey[0]}`, toast });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey });
      toast?.({ title: messages.deleted ?? 'Deleted successfully' });
    },
  });

  // ── Helpers (return boolean success so callers can close modals) ───────────

  const create = async (input: TInput): Promise<boolean> => {
    try {
      await createMutation.mutateAsync(input);
      return true;
    } catch {
      return false;
    }
  };

  const update = async (id: string, input: Partial<TInput>): Promise<boolean> => {
    try {
      await updateMutation.mutateAsync({ id, input });
      return true;
    } catch {
      return false;
    }
  };

  const remove = async (id: string): Promise<boolean> => {
    try {
      await deleteMutation.mutateAsync(id);
      return true;
    } catch {
      return false;
    }
  };

  return {
    items:       queryResult.data ?? [],
    isLoading:   queryResult.isLoading,
    isFetching:  queryResult.isFetching,
    error:       queryResult.error,
    isCreating:  createMutation.isPending,
    isUpdating:  updateMutation.isPending,
    isDeleting:  deleteMutation.isPending,
    create,
    update,
    remove,
    invalidate:  () => qc.invalidateQueries({ queryKey }),
    queryResult,
  };
}