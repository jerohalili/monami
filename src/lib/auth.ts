import NextAuth from "next-auth";
import GitHub from "next-auth/providers/github";
import Credentials from "next-auth/providers/credentials";
import { PrismaAdapter } from "@auth/prisma-adapter";
import bcrypt from "bcryptjs";
import { db } from "./db";

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(db),
  session: { strategy: "jwt" },
  pages: {
    signIn: "/login",
  },
  providers: [
    GitHub({
      clientId: process.env.AUTH_GITHUB_ID,
      clientSecret: process.env.AUTH_GITHUB_SECRET,
      authorization: {
        params: { scope: "read:user user:follow" },
      },
    }),
    Credentials({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;
        const user = await db.user.findUnique({
          where: { email: credentials.email as string },
        });
        if (!user || !user.password) return null;
        const valid = await bcrypt.compare(credentials.password as string, user.password);
        if (!valid) return null;
        return { id: user.id, name: user.name, email: user.email, image: user.image };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, account }) {
      if (account) {
        token.provider = account.provider;
      }
      if (token.provider === "github" && !token.role) {
        token.role = "github";
      }
      if (!token.role) {
        token.role = "user";
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub!;
        (session.user as any).role = token.role ?? "user";
        (session.user as any).provider = token.provider;
      }
      return session;
    },
    async signIn({ user, account, profile }) {
      if (account?.provider === "github" && user) {
        await db.user.update({
          where: { id: user.id },
          data: { role: "github" },
        }).catch(() => {});

        const existingPerson = await db.person.findFirst({
          where: { userId: user.id },
        });

        if (!existingPerson) {
          const ghProfile = profile as any;
          await db.person.create({
            data: {
              userId: user.id,
              name: ghProfile?.name || ghProfile?.login || user.name || "GitHub User",
              email: user.email,
              avatarUrl: ghProfile?.avatar_url || user.image,
              githubLogin: ghProfile?.login,
              company: ghProfile?.company,
              location: ghProfile?.location,
              skills: [],
              interests: [],
              tags: [],
              links: {},
              isSelf: true,
            },
          });
        }
      }
      return true;
    },
  },
});
