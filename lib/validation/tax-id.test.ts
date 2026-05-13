import { describe, it, expect } from "vitest";
import { isValidTaxId } from "./tax-id";

describe("isValidTaxId", () => {
  it("accepts a known valid 8-digit TIN (Taipower)", () => {
    expect(isValidTaxId("03795904")).toBe(true);
  });

  it("accepts a TIN that requires the digit-7 (index 6) exception", () => {
    expect(isValidTaxId("12345675")).toBe(true);
  });

  it("rejects an 8-digit string that fails the mod-5 checksum", () => {
    expect(isValidTaxId("12345678")).toBe(false);
  });

  it("rejects strings with too few or too many digits", () => {
    expect(isValidTaxId("1234567")).toBe(false);
    expect(isValidTaxId("123456789")).toBe(false);
  });

  it("rejects strings with non-digit characters", () => {
    expect(isValidTaxId("1234567a")).toBe(false);
    expect(isValidTaxId("12-34567")).toBe(false);
  });

  it("rejects empty, null, undefined", () => {
    expect(isValidTaxId("")).toBe(false);
    expect(isValidTaxId(null)).toBe(false);
    expect(isValidTaxId(undefined)).toBe(false);
  });
});
