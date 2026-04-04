#!/usr/bin/env ts-node
/**
 * CLI to permanently delete a tenant and ALL its associated data.
 *
 * Run with:
 *   npx ts-node scripts/delete-tenant.ts --subdomain=clinic-a
 *
 * ⚠️  IRREVERSIBLE — use with extreme caution!
 */

import mongoose, { Types } from "mongoose";
import * as readline from "readline";
import * as dotenv from "dotenv";
import * as path from "path";
import * as fs from "fs";

const envFile = fs.existsSync(path.resolve(process.cwd(), ".env.local"))
  ? ".env.local"
  : ".env.example";
dotenv.config({ path: path.resolve(process.cwd(), envFile) });

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error("❌  MONGODB_URI is not set.");
  process.exit(1);
}

import Tenant from "../src/models/Tenant";
import User from "../src/models/User";
import Patient from "../src/models/Patient";
import TriageSession from "../src/models/TriageSession";
import ClinicalRecord from "../src/models/ClinicalRecord";
import AuditLog from "../src/models/AuditLog";
import Settings from "../src/models/Settings";

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = (q: string) => new Promise<string>((res) => rl.question(q, (a) => res(a.trim())));

async function main() {
  const args = process.argv.slice(2);
  let subdomain = args.find((a) => a.startsWith("--subdomain="))?.split("=")[1];

  console.log("\n⚠️   CMS Triage AI — Tenant Deletion\n");

  if (!subdomain) {
    subdomain = await ask("Subdomain to delete: ");
  }

  if (!subdomain) { console.error("❌  Subdomain is required."); process.exit(1); }

  await mongoose.connect(MONGODB_URI as string);

  const tenant = await Tenant.findOne({ subdomain: subdomain.toLowerCase() });
  if (!tenant) {
    console.error(`❌  No tenant found with subdomain "${subdomain}".`);
    await mongoose.disconnect(); process.exit(1);
  }

  console.log(`\n  Found: ${tenant.name} (${tenant.subdomain})`);
  console.log(`  Status: ${tenant.status}`);
  console.log(`  Created: ${tenant.createdAt.toISOString().split("T")[0]}\n`);

  const confirm1 = await ask(`Type the subdomain "${subdomain}" to confirm deletion: `);
  if (confirm1 !== subdomain) {
    console.log("Subdomain mismatch — aborted."); rl.close(); process.exit(0);
  }

  const confirm2 = await ask("This is IRREVERSIBLE. Type YES to continue: ");
  if (confirm2 !== "YES") {
    console.log("Aborted."); rl.close(); process.exit(0);
  }

  const tid = tenant._id as Types.ObjectId;

  console.log("\n🗑️   Deleting tenant data…");

  const results = await Promise.allSettled([
    User.deleteMany({ tenantId: tid }),
    Patient.deleteMany({ tenantIds: tid }),
    TriageSession.deleteMany({ tenantId: tid }),
    ClinicalRecord.deleteMany({ tenantId: tid }),
    AuditLog.deleteMany({ tenantId: tid }),
    Settings.deleteMany({ tenantId: tid }),
  ]);

  results.forEach((r, i) => {
    const labels = ["Users", "Patients", "TriageSessions", "ClinicalRecords", "AuditLogs", "Settings"];
    if (r.status === "fulfilled") {
      console.log(`  ✔  ${labels[i]}: ${(r.value as { deletedCount: number }).deletedCount} deleted`);
    } else {
      console.error(`  ✖  ${labels[i]}: ${r.reason}`);
    }
  });

  await Tenant.deleteOne({ _id: tid });
  console.log(`  ✔  Tenant document deleted\n`);

  console.log(`✅  Tenant "${subdomain}" has been permanently deleted.\n`);

  rl.close();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("❌  Fatal:", err.message);
  process.exit(1);
});
