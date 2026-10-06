import { describe, expect, it } from "vitest";
import { applyDiversityCap, freshnessBoost, recencyFactor, scoreSharedTraits } from "./scoring";

describe("scoring", () => {
  it("weights recent repos higher", () => {
    const fresh = recencyFactor(new Date().toISOString());
    const old = recencyFactor(new Date(Date.now() - 400 * 24 * 3600 * 1000).toISOString());
    expect(fresh).toBe(1);
    expect(old).toBeLessThan(fresh);
  });

  it("boosts recently updated profiles", () => {
    expect(freshnessBoost(new Date().toISOString())).toBe(1.1);
    expect(freshnessBoost(new Date(Date.now() - 60 * 24 * 3600 * 1000).toISOString())).toBe(1.0);
  });

  it("scores shared traits with boost", () => {
    expect(scoreSharedTraits(2, 0)).toBe(2);
    expect(scoreSharedTraits(0, 2)).toBe(3);
  });

  it("caps companies and locations", () => {
    const sameCompany = Array.from({ length: 8 }, (_, i) => ({
      company: "Acme",
      location: `City ${i}`,
    }));
    expect(applyDiversityCap(sameCompany, 6, 5)).toHaveLength(6);

    const sameLocation = Array.from({ length: 8 }, () => ({
      company: null,
      location: "Berlin",
    }));
    expect(applyDiversityCap(sameLocation, 6, 5)).toHaveLength(5);
  });
});
