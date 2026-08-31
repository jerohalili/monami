// Skill normalization: maps common aliases to canonical forms.

const SKILL_SYNONYMS: Record<string, string> = {
  // Frontend
  "react.js": "React",
  "reactjs": "React",
  "vue.js": "Vue",
  "vuejs": "Vue",
  "angular.js": "Angular",
  "angularjs": "Angular",
  "svelte.js": "Svelte",
  "sveltejs": "Svelte",
  "next.js": "Next.js",
  "nextjs": "Next.js",
  "nuxt.js": "Nuxt",
  "nuxtjs": "Nuxt",
  "tailwind": "Tailwind CSS",
  "tailwindcss": "Tailwind CSS",
  "styled components": "Styled Components",
  "css modules": "CSS Modules",

  // Backend
  "node.js": "Node.js",
  "nodejs": "Node.js",
  "express.js": "Express",
  "expressjs": "Express",
  "fastify.js": "Fastify",
  "fastifyjs": "Fastify",
  "django": "Django",
  "flask": "Flask",
  "fastapi": "FastAPI",
  "rails": "Ruby on Rails",
  "ruby on rails": "Ruby on Rails",

  // Languages
  "typescript": "TypeScript",
  "ts": "TypeScript",
  "javascript": "JavaScript",
  "js": "JavaScript",
  "python": "Python",
  "py": "Python",
  "golang": "Go",
  "c sharp": "C#",
  "c++": "C++",
  "c#": "C#",
  "rust lang": "Rust",
  "rustlang": "Rust",
  "kotlin": "Kotlin",
  "swift": "Swift",
  "scala": "Scala",
  "elixir": "Elixir",
  "erlang": "Erlang",
  "haskell": "Haskell",
  "clojure": "Clojure",

  // Databases
  "postgres": "PostgreSQL",
  "postgresql": "PostgreSQL",
  "psql": "PostgreSQL",
  "mysql": "MySQL",
  "mongodb": "MongoDB",
  "mongo": "MongoDB",
  "redis": "Redis",
  "sqlite": "SQLite",
  "sqlite3": "SQLite",
  "dynamodb": "DynamoDB",
  "cassandra": "Cassandra",
  "elasticsearch": "Elasticsearch",
  "elastic search": "Elasticsearch",
  "neo4j": "Neo4j",
  "couchdb": "CouchDB",
  "couch db": "CouchDB",
  "mariadb": "MariaDB",
  "maria db": "MariaDB",
  "cockroachdb": "CockroachDB",
  "supabase": "Supabase",
  "firebase": "Firebase",

  // Infrastructure / DevOps
  "kubernetes": "Kubernetes",
  "k8s": "Kubernetes",
  "docker": "Docker",
  "terraform": "Terraform",
  "ansible": "Ansible",
  "aws": "AWS",
  "amazon web services": "AWS",
  "gcp": "GCP",
  "google cloud": "GCP",
  "google cloud platform": "GCP",
  "azure": "Azure",
  "microsoft azure": "Azure",
  "heroku": "Heroku",
  "vercel": "Vercel",
  "netlify": "Netlify",
  "cloudflare": "Cloudflare",
  "ci/cd": "CI/CD",
  "cicd": "CI/CD",

  // Tools / Concepts
  "git": "Git",
  "github": "GitHub",
  "gitlab": "GitLab",
  "bitbucket": "Bitbucket",
  "jira": "Jira",
  "figma": "Figma",
  "graphql": "GraphQL",
  "rest api": "REST",
  "restful": "REST",
  "rest apis": "REST",
  "grpc": "gRPC",
  "websocket": "WebSockets",
  "websockets": "WebSockets",
  "web sockets": "WebSockets",
  "microservices": "Microservices",
  "micro services": "Microservices",
  "machine learning": "Machine Learning",
  "ml": "Machine Learning",
  "deep learning": "Deep Learning",
  "dl": "Deep Learning",
  "nlp": "NLP",
  "natural language processing": "NLP",
  "computer vision": "Computer Vision",
  "data science": "Data Science",
  "data engineering": "Data Engineering",
  "data analysis": "Data Analysis",
  "big data": "Big Data",
  "blockchain": "Blockchain",
  "web3": "Web3",
  "devops": "DevOps",
  "agile": "Agile",
  "scrum": "Scrum",
  "testing": "Testing",
  "unit testing": "Unit Testing",
  "integration testing": "Integration Testing",
  "e2e testing": "E2E Testing",
  "end to end testing": "E2E Testing",
  "cypress": "Cypress",
  "playwright": "Playwright",
  "jest": "Jest",
  "vitest": "Vitest",
  "mocha": "Mocha",

  // AI / ML Frameworks
  "pytorch": "PyTorch",
  "py torch": "PyTorch",
  "tensorflow": "TensorFlow",
  "tensor flow": "TensorFlow",
  "keras": "Keras",
  "scikit-learn": "Scikit-learn",
  "sklearn": "Scikit-learn",
  "hugging face": "Hugging Face",
  "huggingface": "Hugging Face",
  "openai": "OpenAI",
  "langchain": "LangChain",
  "lang chain": "LangChain",

  // Other
  "sketch": "Sketch",
  "adobe xd": "Adobe XD",
  "photoshop": "Photoshop",
  "illustrator": "Illustrator",
};

const CANONICAL = new Map<string, string>();
for (const [alias, canonical] of Object.entries(SKILL_SYNONYMS)) {
  CANONICAL.set(alias.toLowerCase(), canonical);
}

/** Normalize a single skill name to its canonical form. */
export function normalizeSkill(skill: string): string {
  return CANONICAL.get(skill.toLowerCase()) ?? skill;
}

/** Normalize an array of skills, deduplicating by canonical form. */
export function normalizeSkills(skills: string[]): string[] {
  const seen = new Set<string>();
  return skills.map(normalizeSkill).filter((s) => {
    const key = s.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

import type { GitHubRepo } from "./github";

/** Extract skills from GitHub repos (language + topics), normalized and ranked by frequency. */
export function extractSkillsFromRepos(repos: GitHubRepo[]): string[] {
  const skillCounts = new Map<string, number>();

  for (const repo of repos) {
    // Primary language
    if (repo.language) {
      const normalized = normalizeSkill(repo.language);
      skillCounts.set(normalized, (skillCounts.get(normalized) ?? 0) + 2);
    }

    // Topics
    if (repo.topics && Array.isArray(repo.topics)) {
      for (const topic of repo.topics) {
        const normalized = normalizeSkill(topic);
        skillCounts.set(normalized, (skillCounts.get(normalized) ?? 0) + 1);
      }
    }
  }

  // Sort by frequency (descending), return top 8
  return Array.from(skillCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([skill]) => skill);
}
