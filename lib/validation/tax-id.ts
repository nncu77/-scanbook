const WEIGHTS = [1, 2, 1, 2, 1, 2, 4, 1] as const;

export function isValidTaxId(tin: string | null | undefined): boolean {
  if (!tin || !/^\d{8}$/.test(tin)) return false;

  const digits = tin.split("").map((c) => Number(c));
  let sum = 0;
  for (let i = 0; i < 8; i++) {
    const product = digits[i] * WEIGHTS[i];
    sum += Math.floor(product / 10) + (product % 10);
  }

  // Post-2023 MOF rule: divisible by 5.
  // Historical exception: when the 7th digit (index 6, weight 4) is 7,
  // the carry was ambiguous, so accept both sum and sum+1.
  if (digits[6] === 7) {
    return sum % 5 === 0 || (sum + 1) % 5 === 0;
  }
  return sum % 5 === 0;
}
