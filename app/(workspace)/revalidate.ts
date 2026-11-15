import "server-only";
import { revalidatePath } from "next/cache";

/**
 * Called by every mutating server action. The dashboard, matters, documents,
 * outputs and tool pages all show the same records, so the whole workspace is
 * revalidated. The action's response then carries the fresh page: callers must
 * not add router.refresh(), whose second render can race the action's and leave
 * the page showing stale data.
 */
export function revalidateWorkspace(): void {
  revalidatePath("/", "layout");
}
