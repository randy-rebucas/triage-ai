#!/usr/bin/env ts-node
/**
 * Interactive CLI wizard to onboard a new tenant.
 *
 * Run with:
 *   npx ts-node scripts/onboard-tenant.ts
 *
 * Mirrors the POST /api/tenants/onboard API logic.
 */

import mongoose, { Types } from "mongoose";
import * as readline from "readline";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

// Load env from .env.local → .env.example fallback
const envFile = fs.existsSync(path.resolve(process.cwd(), ".env.local"))
  ? ".env.local"
  : ".env.example";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set. Add it to .env.local and retry.");
  process.exit(1);
}

// ─── Models (inline to avoid Next.js server-only imports) ─────────
import Tenant, { RESERVED_SUBDOMAINS, SUBDOMAIN_REGEX } from "../src/models/Tenant";
import User from "../src/models/User";

// ─── Readline helper ──────────────────────────────────────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(prompt: string, defaultVal = ""): Promise<string> {
  return new Promise((resolve) => {
    rl.question(
      `${prompt}${defaultVal ? ` [${defaultVal}]` : ""}: `,
      (ans) => resolve(ans.trim() || defaultVal)
    );
  });
}

function askPassword(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    process.stdout.write(`${prompt}: `);
    const stdin = process.stdin;
    const originalRaw = !!stdin.isRaw;
    if (stdin.setRawMode) stdin.setRawMode(true);
    let input = "";
    stdin.resume();
    stdin.on("data", function handler(char: Buffer) {
      const c = char.toString();
      if (c === "\r" || c === "\n") {
        stdin.removeListener("data", handler);
        if (stdin.setRawMode) stdin.setRawMode(originalRaw);
        stdin.pause();
        process.stdout.write("\n");
        resolve(input);
      } else if (c === "\u0003") {
        process.exit();
      } else {
        input += c;
        process.stdout.write("*");
      }
    });
  });
}

// ─── Main ─────────────────────────────────────────────────────────
async function main() {
  console.log("\n🏥  CMS Triage AI — Tenant Onboarding Wizard\n");

  // ── 1. Clinic details ──────────────────────────────────────────
  const name = await ask("Clinic name (required)");
  if (!name) { console.error("❌  Clinic name is required."); process.exit(1); }

  const defaultSub = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 30);
  let subdomain = await ask("Subdomain", defaultSub);
  subdomain = subdomain.toLowerCase();

  if (!SUBDOMAIN_REGEX.test(subdomain)) {
    console.error("❌  Invalid subdomain format."); process.exit(1);
  }
  if (RESERVED_SUBDOMAINS.includes(subdomain)) {
    console.error(`❌  "${subdomain}" is a reserved subdomain.`); process.exit(1);
  }

  const email = await ask("Clinic contact email (optional)");
  const timezone = await ask("Timezone", "UTC");
  const currency = await ask("Currency", "PHP");

  // ── 2. Admin account ───────────────────────────────────────────
  console.log("\n👤  Admin Account\n");
  const adminName = await ask("Admin full name (required)");
  if (!adminName) { console.error("❌  Admin name is required."); process.exit(1); }

  const adminEmail = await ask("Admin email (required)");
  if (!adminEmail || !adminEmail.includes("@")) {
    console.error("❌  Valid admin email is required."); process.exit(1);
  }

  const adminPassword = await askPassword("Admin password (min 8 chars)");
  if (adminPassword.length < 8) {
    console.error("❌  Password must be at least 8 characters."); process.exit(1);
  }

  // ── 3. Confirmation ────────────────────────────────────────────
  console.log("\n─────────────────────────────────────────");
  console.log(`  Clinic:    ${name}`);
  console.log(`  Subdomain: ${subdomain}`);
  console.log(`  Admin:     ${adminName} <${adminEmail}>`);
  console.log("─────────────────────────────────────────\n");

  const confirm = await ask("Create this tenant? (yes/no)", "yes");
  if (confirm.toLowerCase() !== "yes") {
    console.log("Aborted."); rl.close(); process.exit(0);
  }

  // ── 4. Create ──────────────────────────────────────────────────
  await mongoose.connect(MONGODB_URI as string);
  console.log("✔  Connected to MongoDB\n");

  const existing = await Tenant.findOne({ subdomain });
  if (existing) { console.error("❌  Subdomain already taken."); process.exit(1); }

  const existingUser = await User.findOne({ email: adminEmail.toLowerCase() });
  if (existingUser) { console.error("❌  Admin email already registered."); process.exit(1); }

  const trialExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  const tenant = await Tenant.create({
    name,
    subdomain,
    email: email || undefined,
    settings: { timezone, currency },
    status: "active",
    subscription: { plan: "trial", status: "active", expiresAt: trialExpiry },
  });

  const tenantId = tenant._id as Types.ObjectId;

  await User.create({
    email: adminEmail.toLowerCase(),
    password: adminPassword,
    name: adminName,
    role: "doctor",
    tenantId,
    isActive: true,
  });

  console.log(`✅  Tenant created!`);
  console.log(`   Subdomain: ${subdomain}`);
  console.log(`   Trial ends: ${trialExpiry.toISOString().split("T")[0]}`);
  console.log(`   Admin email: ${adminEmail}\n`);

  rl.close();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Fatal error:", err.message);
  process.exit(1);
});
