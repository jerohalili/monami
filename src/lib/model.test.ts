import { describe, expect, it } from "vitest";
import { initialsOf, isOrigin, sharedTraits } from "./model";

describe("model", () => {
  it("detects valid origins", () => {
    expect(isOrigin("github")).toBe(true);
    expect(isOrigin("nope")).toBe(false);
  });

  it("builds initials", () => {
    expect(initialsOf("Ada Lovelace")).toBe("AL");
    expect(initialsOf("  ada  ")).toBe("A");
  });

  it("intersects case-insensitively", () => {
    expect(sharedTraits(["React", "Go"], ["react", "Rust"])).toEqual(["React"]);
  });
});
