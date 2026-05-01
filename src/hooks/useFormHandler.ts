/**
 * hooks/useFormHandler.ts
 *
 * Universal form handler.
 * Eliminates the repeated:
 *   const [formData, setFormData] = useState(...)
 *   const handleSubmit = async (e) => { ... validate ... submit ... toast }
 *
 * Usage:
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * const form = useFormHandler({
 *   initialValues: { name: '', email: '', status: 'new' },
 *   schema: LeadSchema,  // Zod schema
 *   onSubmit: async (values) => {
 *     await createLead(values, userId);
 *   },
 *   onSuccess: () => {
 *     setDialogOpen(false);
 *     toast({ title: 'Lead created' });
 *   },
 * });
 *
 * <Input
 *   value={form.values.name}
 *   onChange={e => form.setField('name', e.target.value)}
 * />
 * {form.errors.name && <p>{form.errors.name}</p>}
 * <Button onClick={form.handleSubmit} disabled={form.isSubmitting} />
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */

import { useState, useCallback } from 'react';
import type { ZodSchema }        from 'zod';
import { handleError }           from '@/lib/errorHandler';

// ── Types ──────────────────────────────────────────────────────────────────────

type FieldErrors<T> = Partial<Record<keyof T, string>>;

interface UseFormHandlerOptions<T extends Record<string, unknown>> {
  initialValues: T;
  schema?:       ZodSchema<T>;
  onSubmit:      (values: T) => Promise<void>;
  onSuccess?:    () => void;
  onError?:      (err: Error) => void;
}

interface UseFormHandlerResult<T extends Record<string, unknown>> {
  values:       T;
  errors:       FieldErrors<T>;
  isDirty:      boolean;
  isSubmitting: boolean;
  setField:     <K extends keyof T>(key: K, value: T[K]) => void;
  setValues:    (values: Partial<T>) => void;
  reset:        (values?: T) => void;
  handleSubmit: (e?: React.FormEvent) => Promise<void>;
  validate:     () => boolean;
  clearError:   (key: keyof T) => void;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useFormHandler<T extends Record<string, unknown>>({
  initialValues,
  schema,
  onSubmit,
  onSuccess,
  onError,
}: UseFormHandlerOptions<T>): UseFormHandlerResult<T> {
  const [values,       setValuesState] = useState<T>(initialValues);
  const [errors,       setErrors]      = useState<FieldErrors<T>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isDirty,      setIsDirty]     = useState(false);

  // ── Field setter ───────────────────────────────────────────────────────────

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    setValuesState(prev => ({ ...prev, [key]: value }));
    setIsDirty(true);
    // Clear error on change
    setErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const setValues = useCallback((partial: Partial<T>) => {
    setValuesState(prev => ({ ...prev, ...partial }));
    setIsDirty(true);
  }, []);

  // ── Reset ──────────────────────────────────────────────────────────────────

  const reset = useCallback((override?: T) => {
    setValuesState(override ?? initialValues);
    setErrors({});
    setIsDirty(false);
  }, [initialValues]);

  // ── Validate via Zod ───────────────────────────────────────────────────────

  const validate = useCallback((): boolean => {
    if (!schema) return true;

    const result = schema.safeParse(values);
    if (result.success) {
      setErrors({});
      return true;
    }

    const fieldErrors: FieldErrors<T> = {};
    for (const issue of result.error.issues) {
      const key = issue.path[0] as keyof T;
      if (key && !fieldErrors[key]) {
        fieldErrors[key] = issue.message;
      }
    }
    setErrors(fieldErrors);
    return false;
  }, [schema, values]);

  // ── Clear individual error ─────────────────────────────────────────────────

  const clearError = useCallback((key: keyof T) => {
    setErrors(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  // ── Submit ─────────────────────────────────────────────────────────────────

  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    e?.preventDefault();

    if (!validate()) return;

    setIsSubmitting(true);

    try {
      await onSubmit(values);
      setIsDirty(false);
      onSuccess?.();
    } catch (err) {
      const appErr = handleError(err, { context: 'form:submit', silent: true });
      onError?.(appErr);

      // Map server errors back to field errors if they match
      if (appErr.code === 'VALIDATION_ERROR') {
        setErrors({ _form: appErr.message } as FieldErrors<T>);
      }
    } finally {
      setIsSubmitting(false);
    }
  }, [values, validate, onSubmit, onSuccess, onError]);

  return {
    values,
    errors,
    isDirty,
    isSubmitting,
    setField,
    setValues,
    reset,
    handleSubmit,
    validate,
    clearError,
  };
}