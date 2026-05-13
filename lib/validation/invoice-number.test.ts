import { describe, it, expect } from "vitest";
import { isValidInvoiceNumber, normalizeInvoiceNumber } from "./invoice-number";

describe("normalizeInvoiceNumber", () => {
  it("canonicalizes to LL-NNNNNNNN", () => {
    expect(normalizeInvoiceNumber("AB12345678")).toBe("AB-12345678");
    expect(normalizeInvoiceNumber("AB-12345678")).toBe("AB-12345678");
    expect(normalizeInvoiceNumber("ab12345678")).toBe("AB-12345678");
    expect(normalizeInvoiceNumber("  AB 12345678  ")).toBe("AB-12345678");
  });

  it("returns null on wrong-length or wrong-shape input", () => {
    expect(normalizeInvoiceNumber("ABC1234567")).toBeNull();
    expect(normalizeInvoiceNumber("AB1234567")).toBeNull();
    expect(normalizeInvoiceNumber("AB123456789")).toBeNull();
    expect(normalizeInvoiceNumber("AB12345E78")).toBeNull();
    expect(normalizeInvoiceNumber("1234567890")).toBeNull();
  });

  it("returns null on empty / null / undefined", () => {
    expect(normalizeInvoiceNumber("")).toBeNull();
    expect(normalizeInvoiceNumber(null)).toBeNull();
    expect(normalizeInvoiceNumber(undefined)).toBeNull();
  });
});

describe("isValidInvoiceNumber", () => {
  it("accepts canonical and unnormalized valid forms", () => {
    expect(isValidInvoiceNumber("AB-12345678")).toBe(true);
    expect(isValidInvoiceNumber("AB12345678")).toBe(true);
    expect(isValidInvoiceNumber("ab12345678")).toBe(true);
  });

  it("rejects bad formats and nullish values", () => {
    expect(isValidInvoiceNumber("123-12345678")).toBe(false);
    expect(isValidInvoiceNumber(null)).toBe(false);
    expect(isValidInvoiceNumber(undefined)).toBe(false);
  });
});
