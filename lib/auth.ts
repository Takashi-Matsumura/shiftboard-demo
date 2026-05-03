import { randomBytes, createHmac, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";

// 署名付き Cookie ("mw_session") を発行する。
// 値は `<token>.<hmac>` (base64url)。token は DB の Session.token と突き合わせる。
// HMAC は token 改ざんを防ぐだけで、真偽判定は常に DB 突き合わせ。

export const SESSION_COOKIE = "mw_session";
const SESSION_TTL_MS = 1000 * 60 * 60 * 24 * 30; // 30 日
const BCRYPT_ROUNDS = 10;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (!s || s.length < 16) {
    throw new Error("SESSION_SECRET is missing or too short (>= 16 chars)");
  }
  return s;
}

function sign(token: string): string {
  return createHmac("sha256", secret()).update(token).digest("base64url");
}

function pack(token: string): string {
  return `${token}.${sign(token)}`;
}

function unpack(raw: string): string | null {
  const idx = raw.lastIndexOf(".");
  if (idx < 0) return null;
  const token = raw.slice(0, idx);
  const mac = raw.slice(idx + 1);
  const expected = sign(token);
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return null;
  return timingSafeEqual(a, b) ? token : null;
}

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, BCRYPT_ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

export async function createSession(userId: string): Promise<{
  cookieValue: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS);
  await prisma.session.create({ data: { userId, token, expiresAt } });
  return { cookieValue: pack(token), expiresAt };
}

export async function destroySessionByCookie(rawCookie: string): Promise<void> {
  const token = unpack(rawCookie);
  if (!token) return;
  await prisma.session.deleteMany({ where: { token } });
}

export type Role = "admin" | "member";
export type SessionUser = { id: string; username: string; role: Role };

// DB 列が壊れていても安全側 (member) に倒すための narrow。
export function asRole(value: string): Role {
  return value === "admin" ? "admin" : "member";
}

export async function resolveSessionCookie(
  rawCookie: string | undefined,
): Promise<SessionUser | null> {
  if (!rawCookie) return null;
  const token = unpack(rawCookie);
  if (!token) return null;
  const row = await prisma.session.findUnique({
    where: { token },
    include: { user: true },
  });
  if (!row) return null;
  if (row.expiresAt.getTime() < Date.now()) {
    await prisma.session.delete({ where: { id: row.id } }).catch(() => {});
    return null;
  }
  return {
    id: row.user.id,
    username: row.user.username,
    role: asRole(row.user.role),
  };
}

export function cookieHeader(
  name: string,
  value: string,
  options: { maxAgeMs?: number; expiresAt?: Date; clear?: boolean } = {},
): string {
  const parts: string[] = [`${name}=${value}`, "Path=/", "HttpOnly", "SameSite=Lax"];
  if (process.env.NODE_ENV === "production") parts.push("Secure");
  if (options.clear) {
    parts.push("Max-Age=0");
  } else if (options.expiresAt) {
    parts.push(`Expires=${options.expiresAt.toUTCString()}`);
  } else if (options.maxAgeMs) {
    parts.push(`Max-Age=${Math.floor(options.maxAgeMs / 1000)}`);
  }
  return parts.join("; ");
}

export function parseCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const seg of header.split(";")) {
    const eq = seg.indexOf("=");
    if (eq < 0) continue;
    const k = seg.slice(0, eq).trim();
    if (k === name) return decodeURIComponent(seg.slice(eq + 1).trim());
  }
  return undefined;
}
