import { describe, expect, it } from "vitest";
import { extractSkillsFromRepos, normalizeSkill, normalizeSkills } from "./skills";

describe("skills", () => {
  it("normalizes common aliases", () => {
    expect(normalizeSkill("reactjs")).toBe("React");
    expect(normalizeSkill("TS")).toBe("TypeScript");
    expect(normalizeSkill("Unknown Thing")).toBe("Unknown Thing");
  });

  it("dedupes by canonical form", () => {
    expect(normalizeSkills(["React", "reactjs", "TypeScript", "ts"])).toEqual(["React", "TypeScript"]);
  });

  it("weights language higher than topics", () => {
    const skills = extractSkillsFromRepos([
      {
        id: 1,
        name: "a",
        full_name: "u/a",
        description: null,
        html_url: "",
        stargazers_count: 0,
        forks_count: 0,
        language: "TypeScript",
        topics: ["reactjs"],
        updated_at: new Date().toISOString(),
      },
    ]);
    expect(skills[0]).toBe("TypeScript");
    expect(skills).toContain("React");
  });
});
