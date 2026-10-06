import { describe, expect, it } from "vitest";
import { applySyncFilter, edgeContextFor, personTagsFor } from "./github-sync";

describe("github-sync", () => {
  it("filters logins", () => {
    const all = new Set(["a", "b", "c"]);
    const following = new Set(["a", "b"]);
    const followers = new Set(["b", "c"]);
    expect(applySyncFilter(all, following, followers, "all")).toEqual(all);
    expect(applySyncFilter(all, following, followers, "following")).toEqual(new Set(["a", "b"]));
    expect(applySyncFilter(all, following, followers, "mutual")).toEqual(new Set(["b"]));
  });

  it("builds edge context", () => {
    expect(edgeContextFor("a", new Set(["a"]), new Set(["a"])).strength).toBe(2);
    expect(edgeContextFor("a", new Set(["a"]), new Set()).strength).toBe(1);
  });

  it("builds person tags", () => {
    expect(personTagsFor("a", new Set(["a"]), new Set(["a"]))).toEqual(["github"]);
    expect(personTagsFor("a", new Set(["a"]), new Set())).toContain("github_following");
  });
});
