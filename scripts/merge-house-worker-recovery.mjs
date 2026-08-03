#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";

function parseArgs(argv) {
  const options = {};

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];

    if (!argument.startsWith("--")) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) throw new Error(`Valeur manquante pour ${argument}`);
    options[argument.slice(2)] = value;
    index += 1;
  }

  if (!options.current || !options.recovery || !options["output-dir"]) {
    throw new Error("Usage: node scripts/merge-house-worker-recovery.mjs --current <payload.json> --recovery <subset.json> [--snapshot <snapshot.json>] --output-dir <dossier-vide>");
  }

  return options;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function unwrapPayload(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    if (value.payload && typeof value.payload === "object") return value.payload;
    if (value.data && typeof value.data === "object") return value.data;
  }

  return value;
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function normalizePart(value) {
  return String(value ?? "").trim();
}

function timeFingerprint(entry) {
  return [
    entry.workerId,
    entry.houseId,
    entry.date,
    entry.startTime,
    entry.endTime,
    entry.breakMinutes,
    entry.hourlyRate
  ].map(normalizePart).join("|");
}

function paymentFingerprint(payment) {
  return [
    payment.workerId,
    payment.houseId,
    payment.date,
    payment.amount,
    payment.method
  ].map(normalizePart).join("|");
}

function getHours(entry) {
  const [startHour, startMinute] = String(entry.startTime || "").split(":").map(Number);
  const [endHour, endMinute] = String(entry.endTime || "").split(":").map(Number);

  if (![startHour, startMinute, endHour, endMinute].every(Number.isFinite)) return 0;

  const start = startHour * 60 + startMinute;
  let end = endHour * 60 + endMinute;
  if (end < start) end += 24 * 60;
  return Math.max((end - start - Math.max(Number(entry.breakMinutes || 0), 0)) / 60, 0);
}

function findDuplicateIds(items) {
  const seen = new Set();
  const duplicates = [];

  items.forEach((item) => {
    const id = normalizePart(item.id);
    if (!id) return;
    if (seen.has(id)) duplicates.push(id);
    seen.add(id);
  });

  return Array.from(new Set(duplicates));
}

function findDuplicateFingerprints(items, fingerprint) {
  const seen = new Set();
  const duplicates = [];

  items.forEach((item) => {
    const value = fingerprint(item);
    if (seen.has(value)) duplicates.push(value);
    seen.add(value);
  });

  return Array.from(new Set(duplicates));
}

function mergeMissing(currentItems, recoveryItems, fingerprint) {
  const currentIds = new Set(currentItems.map((item) => normalizePart(item.id)).filter(Boolean));
  const currentFingerprints = new Set(currentItems.map(fingerprint));
  const additions = [];
  const existingIds = [];
  const duplicateFingerprints = [];

  recoveryItems.forEach((item) => {
    const id = normalizePart(item.id);

    if (id && currentIds.has(id)) {
      existingIds.push(id);
      return;
    }

    const value = fingerprint(item);
    if (currentFingerprints.has(value)) {
      duplicateFingerprints.push({ id, fingerprint: value });
      return;
    }

    additions.push(item);
    if (id) currentIds.add(id);
    currentFingerprints.add(value);
  });

  return { merged: [...currentItems, ...additions], additions, existingIds, duplicateFingerprints };
}

function idDifferences(currentItems, snapshotItems) {
  const currentIds = new Set(currentItems.map((item) => normalizePart(item.id)).filter(Boolean));
  const snapshotIds = new Set(snapshotItems.map((item) => normalizePart(item.id)).filter(Boolean));

  return {
    currentOnly: Array.from(currentIds).filter((id) => !snapshotIds.has(id)).sort(),
    snapshotOnly: Array.from(snapshotIds).filter((id) => !currentIds.has(id)).sort(),
    common: Array.from(currentIds).filter((id) => snapshotIds.has(id)).sort()
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const currentPath = path.resolve(options.current);
  const recoveryPath = path.resolve(options.recovery);
  const snapshotPath = options.snapshot ? path.resolve(options.snapshot) : "";
  const outputDir = path.resolve(options["output-dir"]);
  const current = unwrapPayload(readJson(currentPath));
  const recovery = unwrapPayload(readJson(recoveryPath));
  const snapshot = snapshotPath ? unwrapPayload(readJson(snapshotPath)) : null;

  const recoveryWorkers = array(recovery.houseTrackingWorkers);
  const recoveryEntries = array(recovery.houseTimeEntries);
  const recoveryPayments = array(recovery.housePayments);
  const recoveryHouses = array(recovery.houseTrackingHouses);

  if (recoveryWorkers.length !== 1 || !normalizePart(recoveryWorkers[0].id)) {
    throw new Error("Le fichier de récupération doit contenir exactement un intervenant avec un ID.");
  }

  const workerId = normalizePart(recoveryWorkers[0].id);
  const inconsistencies = [];
  recoveryEntries.forEach((entry) => {
    if (!normalizePart(entry.id)) inconsistencies.push("Une ligne d’heures n’a pas d’ID.");
    if (normalizePart(entry.workerId) !== workerId) inconsistencies.push(`L’heure ${entry.id || "sans ID"} référence un autre workerId.`);
  });
  recoveryPayments.forEach((payment) => {
    if (!normalizePart(payment.id)) inconsistencies.push("Un paiement n’a pas d’ID.");
    if (normalizePart(payment.workerId) !== workerId) inconsistencies.push(`Le paiement ${payment.id || "sans ID"} référence un autre workerId.`);
  });

  const currentWorkers = array(current.houseTrackingWorkers);
  const currentEntries = array(current.houseTimeEntries);
  const currentPayments = array(current.housePayments);
  const currentHouses = array(current.houseTrackingHouses);
  const existingWorker = currentWorkers.find((worker) => normalizePart(worker.id) === workerId);
  const workerToRestore = { ...recoveryWorkers[0], status: "Inactif" };
  const mergedWorkers = existingWorker
    ? currentWorkers.map((worker) => normalizePart(worker.id) === workerId ? { ...worker, status: "Inactif" } : worker)
    : [...currentWorkers, workerToRestore];

  const currentHouseIds = new Set(currentHouses.map((house) => normalizePart(house.id)).filter(Boolean));
  const housesToAdd = recoveryHouses.filter((house) => !currentHouseIds.has(normalizePart(house.id)));
  const mergedHouses = [...currentHouses, ...housesToAdd];
  const mergedTimes = mergeMissing(currentEntries, recoveryEntries, timeFingerprint);
  const mergedPayments = mergeMissing(currentPayments, recoveryPayments, paymentFingerprint);
  const knownHouseIds = new Set(mergedHouses.map((house) => normalizePart(house.id)).filter(Boolean));

  [...recoveryEntries, ...recoveryPayments].forEach((item) => {
    if (!knownHouseIds.has(normalizePart(item.houseId))) inconsistencies.push(`La maison ${item.houseId || "sans ID"} est absente du résultat fusionné.`);
  });

  const merged = {
    ...current,
    houseTrackingHouses: mergedHouses,
    houseTrackingWorkers: mergedWorkers,
    houseTimeEntries: mergedTimes.merged,
    housePayments: mergedPayments.merged
  };

  const totalHours = recoveryEntries.reduce((sum, entry) => sum + getHours(entry), 0);
  const calculatedCost = recoveryEntries.reduce((sum, entry) => sum + getHours(entry) * Number(entry.hourlyRate || 0), 0);
  const totalPaid = recoveryPayments.reduce((sum, payment) => sum + Number(payment.amount || 0), 0);
  const collectionNames = ["houseTrackingHouses", "houseTrackingWorkers", "houseTimeEntries", "housePayments"];
  const snapshotComparison = snapshot ? Object.fromEntries(collectionNames.map((name) => [name, {
    currentCount: array(current[name]).length,
    snapshotCount: array(snapshot[name]).length,
    ...idDifferences(array(current[name]), array(snapshot[name]))
  }])) : null;

  const report = {
    mode: "dry-run",
    generatedAt: new Date().toISOString(),
    inputs: { current: currentPath, recovery: recoveryPath, snapshot: snapshotPath || null },
    workerId,
    currentState: {
      houses: currentHouses.length,
      workers: currentWorkers.length,
      timeEntries: currentEntries.length,
      payments: currentPayments.length
    },
    recoveryCandidate: {
      houses: recoveryHouses.length,
      workers: recoveryWorkers.length,
      timeEntries: recoveryEntries.length,
      payments: recoveryPayments.length
    },
    plannedChanges: {
      housesToAdd: housesToAdd.map((house) => house.id),
      workerToAdd: existingWorker ? [] : [workerId],
      workerStatusToSetInactive: existingWorker ? [workerId] : [],
      timeEntriesToAdd: mergedTimes.additions.map((entry) => entry.id),
      paymentsToAdd: mergedPayments.additions.map((payment) => payment.id)
    },
    alreadyPresent: {
      workerIds: existingWorker ? [workerId] : [],
      timeEntryIds: mergedTimes.existingIds,
      paymentIds: mergedPayments.existingIds,
      houseIds: recoveryHouses.filter((house) => currentHouseIds.has(normalizePart(house.id))).map((house) => house.id)
    },
    duplicatesIgnored: {
      timeEntryIdsInsideRecovery: findDuplicateIds(recoveryEntries),
      paymentIdsInsideRecovery: findDuplicateIds(recoveryPayments),
      timeEntryFingerprintsInsideRecovery: findDuplicateFingerprints(recoveryEntries, timeFingerprint),
      paymentFingerprintsInsideRecovery: findDuplicateFingerprints(recoveryPayments, paymentFingerprint),
      timeEntryFingerprintMatchesCurrent: mergedTimes.duplicateFingerprints,
      paymentFingerprintMatchesCurrent: mergedPayments.duplicateFingerprints
    },
    inconsistencies: Array.from(new Set(inconsistencies)),
    expectedState: {
      houses: mergedHouses.length,
      workers: mergedWorkers.length,
      timeEntries: mergedTimes.merged.length,
      payments: mergedPayments.merged.length
    },
    recoveredWorkerTotals: {
      timeEntries: recoveryEntries.length,
      totalHours: Number(totalHours.toFixed(6)),
      calculatedCost: Number(calculatedCost.toFixed(2)),
      payments: recoveryPayments.length,
      totalPaid: Number(totalPaid.toFixed(2)),
      delta: Number((calculatedCost - totalPaid).toFixed(2))
    },
    snapshotComparison
  };

  fs.mkdirSync(outputDir, { recursive: false, mode: 0o700 });
  fs.writeFileSync(path.join(outputDir, "merged-preview.json"), `${JSON.stringify(merged, null, 2)}\n`, { flag: "wx", mode: 0o600 });
  fs.writeFileSync(path.join(outputDir, "dry-run-report.json"), `${JSON.stringify(report, null, 2)}\n`, { flag: "wx", mode: 0o600 });
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
