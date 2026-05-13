export interface AmountTriplet {
  subtotal: number | null;
  tax_amount: number | null;
  total_amount: number;
}

export interface AmountConsistencyResult {
  consistent: boolean;
  diff: number | null;
}

const TOLERANCE_TWD = 1;

export function checkAmountConsistency({
  subtotal,
  tax_amount,
  total_amount,
}: AmountTriplet): AmountConsistencyResult {
  if (subtotal === null || tax_amount === null) {
    return { consistent: true, diff: null };
  }
  const diff = Math.abs(subtotal + tax_amount - total_amount);
  return { consistent: diff <= TOLERANCE_TWD, diff };
}
