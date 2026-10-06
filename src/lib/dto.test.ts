import { describe, expect, it } from "vitest";
import { optionalString, toLinksInput, toStringArrayInput } from "./dto";

describe("dto inputs", () => {
  it("trims empty strings to null", () => {
    expect(optionalString("  ")).toBeNull();
    expect(optionalString(" Ada ")).toBe("Ada");
    expect(optionalString(42)).toBeNull();
  });

  it("accepts arrays and comma strings", () => {
    expect(toStringArrayInput(["a", " ", "b"])).toEqual(["a", "b"]);
    expect(toStringArrayInput("a, b,, c")).toEqual(["a", "b", "c"]);
    expect(toStringArrayInput(null)).toEqual([]);
  });

  it("keeps only string links", () => {
    expect(toLinksInput({ a: "b", c: 1 })).toEqual({ a: "b" });
    expect(toLinksInput([])).toEqual({});
  });
});
