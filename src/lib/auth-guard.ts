import { auth } from "./auth";

// Auth gate for all /api routes.
export class UnauthorizedError extends Error {
  constructor() {
    super("Sign in to view your constellation — session expired or missing");
    this.name = "UnauthorizedError";
  }
}

export async function requireUserId(): Promise<string> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId || typeof userId !== "string") {
    throw new UnauthorizedError();
  }
  return userId;
}

// Domain alias, same gate.
export type CircleUserId = string;
export const requireCircleUserId = requireUserId;
