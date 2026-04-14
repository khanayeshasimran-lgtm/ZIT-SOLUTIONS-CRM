/**
 * components/PageLoader.tsx
 *
 * Single loading component used by every page.
 * Replaces the copy-pasted animate-pulse block in all 13 pages.
 */

export function PageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="animate-pulse flex flex-col items-center gap-4">
        <div className="h-14 w-14 rounded-xl bg-primary/20 flex items-center justify-center">
          <span className="text-xl font-bold text-primary">Z</span>
        </div>
        <p className="text-muted-foreground text-sm">Loading…</p>
      </div>
    </div>
  );
}