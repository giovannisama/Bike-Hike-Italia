import * as admin from "firebase-admin";
import * as fs from "fs";
import * as path from "path";
import { formatDisplayName, normalizeSpaces } from "../src/utils/formatDisplayName";

const SELF_DELETED_SENTINEL = "__self_deleted__";
const MAX_BATCH_SIZE = 500;

type Action = "APPLY" | "REVIEW" | "SKIP";

type ReportRow = {
  uid: string;
  oldDisplayName: string | null;
  newDisplayName: string | null;
  action: Action;
  reason: string;
};

const hasFlag = (flag: string) => process.argv.includes(flag);

const escapeCsv = (value: string) => {
  if (value.includes("\"") || value.includes(",") || value.includes("\n")) {
    return `"${value.replace(/"/g, "\"\"")}"`;
  }
  return value;
};

const toCsv = (rows: ReportRow[]) => {
  const header = ["uid", "oldDisplayName", "newDisplayName", "action", "reason"].join(",");
  const lines = rows.map((row) =>
    [
      row.uid,
      row.oldDisplayName ?? "",
      row.newDisplayName ?? "",
      row.action,
      row.reason,
    ].map((value) => escapeCsv(String(value))).join(",")
  );
  return [header, ...lines].join("\n");
};

const normalizeMaybe = (value: unknown) => {
  if (typeof value !== "string") return "";
  return normalizeSpaces(value);
};

async function main() {
  const applyFirestore = hasFlag("--apply");
  const applyAuth = hasFlag("--apply-auth");
  const dryRun = !applyFirestore && !applyAuth;

  if (!admin.apps.length) {
    admin.initializeApp();
  }

  const db = admin.firestore();
  const snapshot = await db.collection("users").get();

  const rows: ReportRow[] = [];
  let applyCount = 0;
  let reviewCount = 0;
  let skipCount = 0;

  snapshot.docs.forEach((docSnap) => {
    const data = docSnap.data() as Record<string, unknown>;
    const uid = docSnap.id;
    const oldDisplayName =
      typeof data.displayName === "string" ? data.displayName : null;

    if (oldDisplayName === SELF_DELETED_SENTINEL) {
      rows.push({
        uid,
        oldDisplayName,
        newDisplayName: null,
        action: "SKIP",
        reason: "self-deleted-sentinel",
      });
      skipCount += 1;
      return;
    }

    const hasFirst = normalizeMaybe(data.firstName).length > 0;
    const hasLast = normalizeMaybe(data.lastName).length > 0;

    if (hasFirst && hasLast) {
      const newDisplayName = formatDisplayName(
        data.firstName as string,
        data.lastName as string
      );

      if (!newDisplayName) {
        rows.push({
          uid,
          oldDisplayName,
          newDisplayName: null,
          action: "REVIEW",
          reason: "empty-format",
        });
        reviewCount += 1;
        return;
      }

      if (oldDisplayName === newDisplayName) {
        rows.push({
          uid,
          oldDisplayName,
          newDisplayName,
          action: "SKIP",
          reason: "already-canonical",
        });
        skipCount += 1;
        return;
      }

      rows.push({
        uid,
        oldDisplayName,
        newDisplayName,
        action: "APPLY",
        reason: "format-from-first-last",
      });
      applyCount += 1;
      return;
    }

    rows.push({
      uid,
      oldDisplayName,
      newDisplayName: null,
      action: "REVIEW",
      reason: "missing-first-or-last",
    });
    reviewCount += 1;
  });

  const reportDir = path.resolve(process.cwd(), "scripts");
  const reportBase = path.join(reportDir, "migrateDisplayName.report");
  const jsonPath = `${reportBase}.json`;
  const csvPath = `${reportBase}.csv`;

  fs.writeFileSync(jsonPath, JSON.stringify(rows, null, 2));
  fs.writeFileSync(csvPath, toCsv(rows));

  console.log(
    `[migrateDisplayName] dryRun=${dryRun} total=${rows.length} apply=${applyCount} review=${reviewCount} skip=${skipCount}`
  );
  console.log(`[migrateDisplayName] report json=${jsonPath}`);
  console.log(`[migrateDisplayName] report csv=${csvPath}`);

  const updates = rows.filter(
    (row) => row.action === "APPLY" && row.newDisplayName
  );

  if (applyFirestore) {
    let batch = db.batch();
    let batchCount = 0;
    let applied = 0;

    for (const row of updates) {
      const ref = db.collection("users").doc(row.uid);
      batch.update(ref, { displayName: row.newDisplayName });
      batchCount += 1;

      if (batchCount >= MAX_BATCH_SIZE) {
        await batch.commit();
        applied += batchCount;
        console.log(`[migrateDisplayName] committed ${applied}/${updates.length}`);
        batch = db.batch();
        batchCount = 0;
      }
    }

    if (batchCount > 0) {
      await batch.commit();
      applied += batchCount;
      console.log(`[migrateDisplayName] committed ${applied}/${updates.length}`);
    }
  }

  const authReportPath = `${reportBase}.auth.json`;
  const authReport = {
    authChecked: 0,
    authUpdated: 0,
    authSkippedSame: 0,
    authFailed: 0,
    authFailedUids: [] as string[],
  };

  if (!applyAuth) {
    fs.writeFileSync(authReportPath, JSON.stringify(authReport, null, 2));
    return;
  }

  const eligibleForAuth = rows.filter(
    (row) =>
      row.action !== "REVIEW" &&
      row.reason !== "self-deleted-sentinel" &&
      !!row.newDisplayName
  );

  const concurrency = 5;
  let index = 0;

  const runWorker = async () => {
    while (true) {
      const current = index;
      index += 1;
      if (current >= eligibleForAuth.length) break;

      const row = eligibleForAuth[current];
      authReport.authChecked += 1;
      try {
        const userRecord = await admin.auth().getUser(row.uid);
        const authDisplayName =
          typeof userRecord.displayName === "string"
            ? userRecord.displayName
            : null;
        if (authDisplayName === row.newDisplayName) {
          authReport.authSkippedSame += 1;
          continue;
        }

        await admin.auth().updateUser(row.uid, {
          displayName: row.newDisplayName || undefined,
        });
        authReport.authUpdated += 1;
      } catch (err) {
        authReport.authFailed += 1;
        authReport.authFailedUids.push(row.uid);
        console.warn(`[migrateDisplayName] auth update failed uid=${row.uid}`, err);
      }
    }
  };

  const workers = Array.from(
    { length: Math.min(concurrency, eligibleForAuth.length) },
    () => runWorker()
  );
  await Promise.all(workers);

  fs.writeFileSync(authReportPath, JSON.stringify(authReport, null, 2));
  console.log(
    `[migrateDisplayName] authChecked=${authReport.authChecked} authUpdated=${authReport.authUpdated} authSkippedSame=${authReport.authSkippedSame} authFailed=${authReport.authFailed}`
  );
  console.log(`[migrateDisplayName] auth report json=${authReportPath}`);
}

main().catch((err) => {
  console.error("[migrateDisplayName] failed", err);
  process.exitCode = 1;
});
