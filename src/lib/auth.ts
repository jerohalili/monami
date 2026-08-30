import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { db } from "./db";

export const { handlers, signIn, signOut, auth } = NextAuth({
  providers: [
    GitHub({
      authorization: {
        params: {
          scope: "read:user user:email",
        },
      },
    }),
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;

        if (!email || !password || typeof email !== "string" || typeof password !== "string") {
          return null;
        }

        const user = await db.user.findUnique({ where: { email } });
        if (!user || !user.passwordHash) return null;

        const valid = await bcrypt.compare(password, user.passwordHash);
        if (!valid) return null;

        return { id: user.id, email: user.email, name: user.name, image: user.image };
      },
    }),
  ],
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === "github" && user.email) {
        const githubId = account.providerAccountId;

        // Check if user already exists with this GitHub ID
        let existingUser = await db.user.findUnique({ where: { githubId } });

        if (!existingUser) {
          // Check if user exists with this email
          existingUser = await db.user.findUnique({ where: { email: user.email } });

          if (existingUser) {
            // Link GitHub account to existing user
            existingUser = await db.user.update({
              where: { id: existingUser.id },
              data: {
                githubId,
                image: user.image ?? existingUser.image,
              },
            });
          } else {
            // Create new user from GitHub
            existingUser = await db.user.create({
              data: {
                email: user.email,
                name: user.name,
                image: user.image,
                githubId,
              },
            });
          }
        }

        // Store GitHub access token for API calls
        if (account.access_token) {
          await db.user.update({
            where: { id: existingUser.id },
            data: {
              githubToken: account.access_token,
              githubTokenExpiry: account.expires_at
                ? new Date(account.expires_at * 1000)
                : null,
            },
          });
        }

        // Update user ID for JWT
        user.id = existingUser.id;
      }
      return true;
    },
    async jwt({ token, user, account }) {
      if (user) {
        token.id = user.id;
      }
      // Include githubId from account on GitHub sign-in
      if (account?.provider === "github" && user?.id) {
        const dbUser = await db.user.findUnique({
          where: { id: user.id },
          select: { githubId: true },
        });
        if (dbUser?.githubId) {
          token.githubId = dbUser.githubId;
        }
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && token.id) {
        session.user.id = token.id as string;
      }
      if (session.user && token.githubId) {
        (session.user as { githubId?: string }).githubId = token.githubId as string;
      }
      return session;
    },
  },
});
