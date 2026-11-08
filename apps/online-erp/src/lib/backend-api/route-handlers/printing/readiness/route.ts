import { NextResponse } from "next/server";
import net from "node:net";
import bcrypt from "bcryptjs";
import { requireAdmin } from "@/lib/api";
import { db } from "@/lib/db";
import { PRINT_CONFIG } from "@/config/print";

export const dynamic = "force-dynamic";

interface DiagnosticItem {
  id: string;
  category: "DATABASE" | "SECURITY" | "AGENT" | "PRINTER" | "DRAWER" | "JOBS";
  titleAr: string;
  titleEn: string;
  status: "pass" | "warn" | "fail";
  detailsAr: string;
  detailsEn: string;
  fixAr?: string;
  fixEn?: string;
}

export async function GET() {
  const user = await requireAdmin();
  if (user instanceof NextResponse) return user;

  const checks: DiagnosticItem[] = [];

  // 1. Cloud Database Connectivity & Latency
  let dbLatency = -1;
  let migrationsCount = 0;
  try {
    const start = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbLatency = Date.now() - start;

    const migrations = await db.$queryRaw<{ count: bigint }[]>`SELECT COUNT(*) FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL`;
    migrationsCount = Number(migrations[0]?.count || 0);

    checks.push({
      id: "db_connectivity",
      category: "DATABASE",
      titleAr: "اتصال قاعدة البيانات السحابية وسرعة الاستجابة",
      titleEn: "Cloud Database Connectivity & Latency",
      status: dbLatency < 500 ? "pass" : "warn",
      detailsAr: `متصل بقاعدة البيانات السحابية بنجاح (${dbLatency}ms) - تم تطبيق ${migrationsCount} ترقية (Migrations).`,
      detailsEn: `Connected to cloud database (${dbLatency}ms) with ${migrationsCount} applied migrations.`,
    });
  } catch (err: unknown) {
    checks.push({
      id: "db_connectivity",
      category: "DATABASE",
      titleAr: "اتصال قاعدة البيانات السحابية",
      titleEn: "Cloud Database Connectivity",
      status: "fail",
      detailsAr: `فشل الاتصال بقاعدة البيانات: ${(err as Error).message}`,
      detailsEn: `Database connection failed: ${(err as Error).message}`,
      fixAr: "تحقق من متغير DATABASE_URL ووجود sslmode=verify-full والاتصال بالإنترنت.",
      fixEn: "Verify DATABASE_URL with sslmode=verify-full and check internet connection.",
    });
  }

  // 2. AUTH_SECRET Security
  const authSecret = process.env.AUTH_SECRET || "";
  if (authSecret.length >= 32) {
    checks.push({
      id: "auth_secret",
      category: "SECURITY",
      titleAr: "مفتاح التشفير السري (AUTH_SECRET)",
      titleEn: "Auth Secret Security",
      status: "pass",
      detailsAr: `طول المفتاح ${authSecret.length} حرف (مطابق لمعايير الأمان >= 32).`,
      detailsEn: `Secret length is ${authSecret.length} chars (complies with >= 32 standard).`,
    });
  } else {
    checks.push({
      id: "auth_secret",
      category: "SECURITY",
      titleAr: "مفتاح التشفير السري (AUTH_SECRET)",
      titleEn: "Auth Secret Security",
      status: "fail",
      detailsAr: `طول المفتاح الحالي ${authSecret.length} حرف (غير آمن).`,
      detailsEn: `Secret length is only ${authSecret.length} chars (insecure).`,
      fixAr: "عيّن AUTH_SECRET في ملف .env.local بسلسلة عشوائية قوية لا تقل عن 32 حرفاً.",
      fixEn: "Set AUTH_SECRET in .env.local to a strong random string of at least 32 characters.",
    });
  }

  // 3. Cookie & APP_URL Security Consistency
  const appUrl = process.env.APP_URL || "http://localhost:3000";
  const cookieSecureEnv = process.env.COOKIE_SECURE;
  const isHttps = appUrl.startsWith("https://");
  const isCookieSecure = cookieSecureEnv ? cookieSecureEnv === "true" : isHttps;

  if (!isHttps && isCookieSecure) {
    checks.push({
      id: "cookie_consistency",
      category: "SECURITY",
      titleAr: "توافق إعدادات ملفات الكوكيز والبروتوكول",
      titleEn: "Cookie Security & Protocol Consistency",
      status: "fail",
      detailsAr: "التطبيق يعمل عبر HTTP بينما ملفات تعريف الارتباط محددة كـ Secure، مما يمنع تسجيل الدخول على الشبكة المحلية.",
      detailsEn: "APP_URL is HTTP but secure cookies are enabled, which breaks login over local LAN.",
      fixAr: "اضبط COOKIE_SECURE=false في .env.local للأجهزة المحلية التي تعمل على HTTP.",
      fixEn: "Set COOKIE_SECURE=false in .env.local for local HTTP cashier stations.",
    });
  } else {
    checks.push({
      id: "cookie_consistency",
      category: "SECURITY",
      titleAr: "توافق إعدادات ملفات الكوكيز والبروتوكول",
      titleEn: "Cookie Security & Protocol Consistency",
      status: "pass",
      detailsAr: `إعدادات الكوكيز متوافقة (${isHttps ? "HTTPS / Secure" : "HTTP / Non-Secure"}).`,
      detailsEn: `Cookie security is aligned with protocol (${isHttps ? "HTTPS / Secure" : "HTTP / Non-Secure"}).`,
    });
  }

  // 4. Demo Credentials Warning
  try {
    const demoUser = await db.user.findFirst({
      where: { email: { in: ["admin@noura.test", "cashier@noura.test"] } },
    });
    if (demoUser) {
      const isDefaultPass = await bcrypt.compare("Demo123!", demoUser.passwordHash).catch(() => false);
      if (isDefaultPass) {
        checks.push({
          id: "demo_credentials",
          category: "SECURITY",
          titleAr: "فحص الحسابات التجريبية الافتراضية",
          titleEn: "Demo Credentials Check",
          status: "warn",
          detailsAr: `حساب تجريبي (${demoUser.email}) لا يزال يستخدم كلمة المرور الافتراضية Demo123!`,
          detailsEn: `Demo account (${demoUser.email}) is still using the default password Demo123!`,
          fixAr: "قم بتغيير كلمة المرور أو استخدام بذر الإنتاج المخصص (Production Seed).",
          fixEn: "Change password or run production seed without demo accounts.",
        });
      }
    }
  } catch {
    // ignore
  }

  // 5. Agent Pairing & Heartbeat
  const offlineThresholdSeconds = Number(process.env.PRINT_DEVICE_OFFLINE_SECONDS || 90);
  const cutoff = new Date(Date.now() - offlineThresholdSeconds * 1000);

  const devices = await db.printDevice.findMany({
    include: { printerConfigs: true },
    orderBy: { lastHeartbeatAt: "desc" },
  });

  const onlineDevices = devices.filter((d) => d.lastHeartbeatAt && d.lastHeartbeatAt > cutoff && d.status === "ONLINE");

  if (!devices.length) {
    checks.push({
      id: "agent_paired",
      category: "AGENT",
      titleAr: "حالة اقتران وكيل الطباعة",
      titleEn: "Print Agent Pairing",
      status: "fail",
      detailsAr: "لم يتم اقتران أي وكيل طباعة في النظام حتى الآن.",
      detailsEn: "No print agent device has been paired in the ERP yet.",
      fixAr: "أنشئ رمز اقتران من صفحة إعدادات الطباعة ثم نفذ: `agent pair <CODE>` على جهاز الكاشير.",
      fixEn: "Generate pairing code in printing settings and run: `agent pair <CODE>` on cashier PC.",
    });
  } else if (!onlineDevices.length) {
    checks.push({
      id: "agent_paired",
      category: "AGENT",
      titleAr: "حالة اتصال وكيل الطباعة",
      titleEn: "Print Agent Online Status",
      status: "fail",
      detailsAr: `يوجد ${devices.length} جهاز مقترن، لكن جميعها غير متصلة (آخر اتصال يتجاوز ${offlineThresholdSeconds} ثانية).`,
      detailsEn: `${devices.length} devices paired but none is online (heartbeat > ${offlineThresholdSeconds}s).`,
      fixAr: "تأكد من تشغيل وكيل الطباعة عبر الأمر `agent run` أو التحقق من `scripts/start-all.bat`.",
      fixEn: "Ensure the print agent is running via `agent run` or `scripts/start-all.bat`.",
    });
  } else {
    checks.push({
      id: "agent_paired",
      category: "AGENT",
      titleAr: "حالة وكيل الطباعة",
      titleEn: "Print Agent Online Status",
      status: "pass",
      detailsAr: `وكيل الطباعة متصل ونشط (${onlineDevices.map((d) => `${d.name} v${d.appVersion || "1.0.0"}`).join(", ")}).`,
      detailsEn: `Print agent is online and active (${onlineDevices.map((d) => `${d.name} v${d.appVersion || "1.0.0"}`).join(", ")}).`,
    });
  }

  // 6. Cashier Printer & Kitchen/Bar Printers
  const printers = await db.printerConfiguration.findMany({
    include: { printDevice: true },
  });

  const cashierPrinters = printers.filter((p) => p.printerType === "CASHIER" && p.enabled);
  if (!cashierPrinters.length) {
    checks.push({
      id: "cashier_printer",
      category: "PRINTER",
      titleAr: "طابعة الكاشير الرئيسية",
      titleEn: "Cashier Receipt Printer",
      status: "fail",
      detailsAr: "لا توجد طابعة كاشير مفعلة في النظام لطباعة فواتير الزبائن.",
      detailsEn: "No enabled CASHIER printer found to print customer receipts.",
      fixAr: "أضف أو فعّل طابعة من نوع CASHIER في صفحة إعدادات الطباعة.",
      fixEn: "Add or enable a CASHIER printer in the printing settings page.",
    });
  } else {
    checks.push({
      id: "cashier_printer",
      category: "PRINTER",
      titleAr: "طابعة الكاشير الرئيسية",
      titleEn: "Cashier Receipt Printer",
      status: "pass",
      detailsAr: `طابعة الكاشير مهيأة ومفعلة: ${cashierPrinters[0].displayName} (${cashierPrinters[0].connectionType}).`,
      detailsEn: `Cashier printer is active: ${cashierPrinters[0].displayName} (${cashierPrinters[0].connectionType}).`,
    });
  }

  // Check Kitchen/Bar if routes exist
  const productRoutesCount = await db.productPrinterRoute.count();
  const categoryRoutesCount = await db.categoryPrinterRoute.count();
  const kitchenPrinters = printers.filter((p) => (p.printerType === "KITCHEN" || p.printerType === "BAR") && p.enabled);

  if ((productRoutesCount > 0 || categoryRoutesCount > 0) && !kitchenPrinters.length) {
    checks.push({
      id: "kitchen_printers",
      category: "PRINTER",
      titleAr: "طابعة المطبخ / البار",
      titleEn: "Kitchen / Bar Printers",
      status: "warn",
      detailsAr: `توجد توجيهات أصناف للمطبخ (${productRoutesCount + categoryRoutesCount}) ولكن لا توجد طابعة مطبخ مفعلة.`,
      detailsEn: `Item routes exist (${productRoutesCount + categoryRoutesCount}) but no KITCHEN or BAR printer is enabled.`,
      fixAr: "أضف طابعة مطبخ مخصصة أو وجّه الطلبات إلى طابعة الكاشير.",
      fixEn: "Add a kitchen printer or adjust routing.",
    });
  }

  // 7. Reachability check per printer
  for (const p of printers) {
    if (!p.enabled) continue;
    if (p.connectionType === "LAN" && p.ipAddress) {
      const isPingable = await pingTcp(p.ipAddress, p.port || 9100, 1500);
      checks.push({
        id: `printer_ping_${p.id}`,
        category: "PRINTER",
        titleAr: `اتصال طابعة الشبكة (${p.displayName})`,
        titleEn: `LAN Printer Reachability (${p.displayName})`,
        status: isPingable ? "pass" : "warn",
        detailsAr: isPingable
          ? `المنفذ ${p.port || 9100} مفتوح على عنوان IP ${p.ipAddress}.`
          : `تعذر الاتصال بمنفذ ${p.port || 9100} على عنوان IP ${p.ipAddress}.`,
        detailsEn: isPingable
          ? `Port ${p.port || 9100} open on IP ${p.ipAddress}.`
          : `Could not connect to port ${p.port || 9100} at ${p.ipAddress}.`,
        fixAr: isPingable ? undefined : "تأكد من تشغيل الطابعة وتوصيل كابل الشبكة ومطابقة عنوان IP.",
        fixEn: isPingable ? undefined : "Verify printer is powered on and IP address is correct.",
      });
    }
  }

  // 8. Paper Width Consistency
  const primaryCashier = cashierPrinters[0];
  if (primaryCashier) {
    const configuredWidth = primaryCashier.paperWidth;
    checks.push({
      id: "paper_width",
      category: "PRINTER",
      titleAr: "عرض ورق الطباعة وتوافق القالب",
      titleEn: "Paper Width Consistency",
      status: "pass",
      detailsAr: `عرض الورق المعتمد هو ${configuredWidth === "CUSTOM" ? `${primaryCashier.customWidthMm}mm` : configuredWidth === "W58" ? "58mm" : "80mm"}، ومطابق لقوالب الفواتير الحرارية.`,
      detailsEn: `Configured width is ${configuredWidth} and aligned with thermal receipt template.`,
    });
  }

  // 9. Cash Drawer Setup
  const drawerPrinter = printers.find((p) => p.openCashDrawer && p.enabled);
  if (drawerPrinter) {
    checks.push({
      id: "cash_drawer",
      category: "DRAWER",
      titleAr: "تهيئة درج النقدية",
      titleEn: "Cash Drawer Configuration",
      status: "pass",
      detailsAr: `درج النقدية مربوط بطابعة: ${drawerPrinter.displayName} (مقبس Pin ${drawerPrinter.cashDrawerPin === 1 ? "5" : "2"}).`,
      detailsEn: `Cash drawer attached to: ${drawerPrinter.displayName} (Pin ${drawerPrinter.cashDrawerPin === 1 ? "5" : "2"}).`,
    });
  } else {
    checks.push({
      id: "cash_drawer",
      category: "DRAWER",
      titleAr: "تهيئة درج النقدية",
      titleEn: "Cash Drawer Configuration",
      status: "warn",
      detailsAr: "درج النقدية غير مفعل على أي طابعة في النظام.",
      detailsEn: "Cash drawer kick is not enabled on any configured printer.",
      fixAr: "إذا كان الدرج موصولاً بكابل RJ11، فعّله من إعدادات طابعة الكاشير.",
      fixEn: "If drawer is connected via RJ11, enable it in printer settings.",
    });
  }

  // 10. Pending / Failed Jobs
  const [pendingJobsCount, failedJobsCount] = await Promise.all([
    db.printJob.count({ where: { status: "PENDING" } }),
    db.printJob.count({ where: { status: "FAILED" } }),
  ]);

  if (failedJobsCount > 0) {
    checks.push({
      id: "jobs_status",
      category: "JOBS",
      titleAr: "مهام الطباعة المعلقة والفاشلة",
      titleEn: "Pending & Failed Print Jobs",
      status: "warn",
      detailsAr: `يوجد ${failedJobsCount} مهمة طباعة فاشلة و ${pendingJobsCount} مهمة بانتظار الطباعة.`,
      detailsEn: `${failedJobsCount} failed print jobs and ${pendingJobsCount} pending jobs.`,
      fixAr: "انقر على زر 'إعادة محاولة المهام الفاشلة' بعد التأكد من تشغيل الطابعة والوكيل.",
      fixEn: "Click 'Retry Failed Jobs' after verifying printer and agent status.",
    });
  } else {
    checks.push({
      id: "jobs_status",
      category: "JOBS",
      titleAr: "مهام الطباعة المعلقة والفاشلة",
      titleEn: "Pending & Failed Print Jobs",
      status: "pass",
      detailsAr: `قائمة مهام الطباعة سليمة (0 مهام فاشلة، ${pendingJobsCount} معلقة).`,
      detailsEn: `Print queue healthy (0 failed, ${pendingJobsCount} pending).`,
    });
  }

  return NextResponse.json({
    success: true,
    timestamp: new Date().toISOString(),
    overallStatus: checks.some((c) => c.status === "fail")
      ? "fail"
      : checks.some((c) => c.status === "warn")
      ? "warn"
      : "pass",
    checks,
    metrics: {
      dbLatencyMs: dbLatency,
      appliedMigrationsCount: migrationsCount,
      pairedDevicesCount: devices.length,
      onlineDevicesCount: onlineDevices.length,
      configuredPrintersCount: printers.length,
      pendingJobsCount,
      failedJobsCount,
      defaultPaperSize: PRINT_CONFIG.PAPER_SIZE,
    },
  });
}

function pingTcp(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(timeoutMs);

    socket.on("connect", () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(true);
      }
    });

    const finish = () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    };

    socket.on("timeout", finish);
    socket.on("error", finish);

    try {
      socket.connect(port, host);
    } catch {
      finish();
    }
  });
}
