import { describe, it, expect } from "vitest";
import { checkAmountConsistency } from "./amount";

describe("checkAmountConsistency", () => {
  it("flags an exact subtotal+tax=total as consistent", () => {
    expect(checkAmountConsistency({ subtotal: 100, tax_amount: 5, total_amount: 105 })).toEqual({
      consistent: true,
      diff: 0,
    });
  });

  it("tolerates ±NT$1 rounding error", () => {
    expect(checkAmountConsistency({ subtotal: 100, tax_amount: 5, total_amount: 106 })).toEqual({
      consistent: true,
      diff: 1,
    });
    expect(checkAmountConsistency({ subtotal: 100, tax_amount: 5, total_amount: 104 })).toEqual({
      consistent: true,
      diff: 1,
    });
  });

  it("flags larger discrepancies as inconsistent", () => {
    expect(checkAmountConsistency({ subtotal: 100, tax_amount: 5, total_amount: 110 })).toEqual({
      consistent: false,
      diff: 5,
    });
  });

  it("returns consistent=true with null diff when subtotal or tax is missing", () => {
    expect(checkAmountConsistency({ subtotal: null, tax_amount: 5, total_amount: 100 })).toEqual({
      consistent: true,
      diff: null,
    });
    expect(checkAmountConsistency({ subtotal: 100, tax_amount: null, total_amount: 105 })).toEqual({
      consistent: true,
      diff: null,
    });
    expect(checkAmountConsistency({ subtotal: null, tax_amount: null, total_amount: 100 })).toEqual({
      consistent: true,
      diff: null,
    });
  });
});
