import { createHash, randomBytes } from "crypto";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { NextRequest } from "next/server";
import { getDb } from "@/db";
import { apiTokens, users } from "@/db/schema";

const COOKIE = "applytrack_session";

function secretKey() {
  const secret = process.env.AUTH_SECRET;
  if (!secret || secret.length < 16) {
    throw new Error("AUTH_SECRET must be set (16+ chars).");
  }
  return new TextEncoder().encode(secret);
}

export function newId(prefix: string) {
  return `${prefix}_${randomBytes(12).toString("hex")}`;
}

export async function hashPassword(password: string) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password: string, hash: string) {
  return bcrypt.compare(password, hash);
}

export async function createSessionToken(userId: string, email: string) {
  return new SignJWT({ email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function setSessionCookie(token: string) {
  const jar = await cookies();
  jar.set(COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function clearSessionCookie() {
  const jar = await cookies();
  jar.delete(COOKIE);
}

export async function getSessionUser() {
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    if (!payload.sub) return null;
    return { id: payload.sub, email: String(payload.email || "") };
  } catch {
    return null;
  }
}

export function hashApiToken(raw: string) {
  return createHash("sha256").update(raw).digest("hex");
}

export function mintApiToken() {
  const raw = `atk_${randomBytes(24).toString("base64url")}`;
  return {
    raw,
    hash: hashApiToken(raw),
    prefix: raw.slice(0, 10),
  };
}

/** Resolve user from session cookie or Bearer API token. */
export async function requireUser(req?: NextRequest) {
  const session = await getSessionUser();
  if (session) return session;

  const header = req?.headers.get("authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const db = getDb();
  const tokenHash = hashApiToken(match[1].trim());
  const rows = await db
    .select({
      id: users.id,
      email: users.email,
    })
    .from(apiTokens)
    .innerJoin(users, eq(apiTokens.userId, users.id))
    .where(eq(apiTokens.tokenHash, tokenHash))
    .limit(1);

  return rows[0] ?? null;
}
