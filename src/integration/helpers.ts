import type { Comparison, ComparisonResult } from "@/lib/domain/types";
import { isComparisonResult } from "@/lib/domain/types";

/** Map raw Prisma comparison rows to the domain comparison shape. */
export function toDomainComparisonsRaw(
  rows: { trackAId: string; trackBId: string; result: string }[],
): Comparison[] {
  return rows
    .filter((r) => isComparisonResult(r.result))
    .map((r) => ({ a: r.trackAId, b: r.trackBId, result: r.result as ComparisonResult }));
}
