import { NextResponse } from "next/server";
import { z } from "zod";
import { assertSameOrigin, requireSession } from "@/lib/api";
import { createToken } from "@/lib/auth";
import { db } from "@/lib/db";

const schema = z.object({ name: z.string().trim().min(2).max(100) });

export async function PATCH(request: Request) {
  const originError = assertSameOrigin(request);
  if (originError) return originError;

  const session = await requireSession();
  if (session instanceof NextResponse) return session;
  if (session.role !== "ADMIN") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Name must be between 2 and 100 characters." }, { status: 400 });
  }

  const user = await db.user.update({
    where: { id: session.userId },
    data: { name: parsed.data.name },
    select: { id: true, name: true, email: true, role: true, branchId: true },
  });
  const token = await createToken({
    userId: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    branchId: user.branchId ?? "",
  });
  const secure = process.env.COOKIE_SECURE !== undefined
    ? process.env.COOKIE_SECURE === "true"
    : process.env.APP_URL?.startsWith("https://") ?? false;
  const response = NextResponse.json({ name: user.name });
  response.cookies.set("erp_session", token, {
    httpOnly: true,
    secure,
    sameSite: "lax",
    maxAge: 60 * 60 * 8,
    path: "/",
  });
  return response;
}
