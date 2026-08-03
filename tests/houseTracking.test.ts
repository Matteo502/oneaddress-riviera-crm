import assert from "node:assert/strict";
import test from "node:test";

import {
  getHouseTrackingWorkerHistorySummary,
  isHouseTrackingWorkerActive,
  permanentlyDeleteHouseTrackingWorker,
  setHouseTrackingWorkerStatus
} from "../lib/houseTracking";
import type { HousePayment, HouseTimeEntry, HouseTrackingWorker } from "../lib/types";

function worker(id: string, status: HouseTrackingWorker["status"] = "Actif"): HouseTrackingWorker {
  return {
    id,
    contactId: `contact-${id}`,
    contactName: `Worker ${id}`,
    role: "Test",
    hourlyRate: 20,
    status,
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

function timeEntry(workerId: string): HouseTimeEntry {
  return {
    id: `hours-${workerId}`,
    houseId: "house-test",
    houseName: "Maison test",
    workerId,
    workerName: `Worker ${workerId}`,
    date: "2026-01-02",
    startTime: "09:00",
    endTime: "13:00",
    breakMinutes: 0,
    hourlyRate: 20,
    createdAt: "2026-01-02T13:00:00.000Z"
  };
}

function payment(workerId: string): HousePayment {
  return {
    id: `payment-${workerId}`,
    houseId: "house-test",
    houseName: "Maison test",
    workerId,
    workerName: `Worker ${workerId}`,
    date: "2026-01-03",
    amount: 30,
    method: "Virement",
    createdAt: "2026-01-03T12:00:00.000Z"
  };
}

test("archiver conserve strictement les heures et paiements", () => {
  const workers = [worker("with-history")];
  const entries = [timeEntry("with-history")];
  const payments = [payment("with-history")];
  const archivedWorkers = setHouseTrackingWorkerStatus(workers, "with-history", "Inactif");

  assert.equal(archivedWorkers[0].status, "Inactif");
  assert.deepEqual(entries, [timeEntry("with-history")]);
  assert.deepEqual(payments, [payment("with-history")]);
  assert.equal(isHouseTrackingWorkerActive(archivedWorkers[0]), false);
  assert.deepEqual(getHouseTrackingWorkerHistorySummary("with-history", entries, payments), {
    timeEntries: 1,
    payments: 1,
    hours: 4,
    due: 80,
    paid: 30,
    balance: 50
  });
});

test("réactiver rend l’intervenant sélectionnable sans toucher à l’historique", () => {
  const entries = [timeEntry("reactivate")];
  const payments = [payment("reactivate")];
  const reactivated = setHouseTrackingWorkerStatus([worker("reactivate", "Inactif")], "reactivate", "Actif");

  assert.equal(isHouseTrackingWorkerActive(reactivated[0]), true);
  assert.equal(entries.length, 1);
  assert.equal(payments.length, 1);
});

test("supprimer définitivement est autorisé sans historique", () => {
  const workers = [worker("empty"), worker("keep")];
  const result = permanentlyDeleteHouseTrackingWorker(workers, [], [], "empty");

  assert.equal(result.deleted, true);
  assert.equal(result.blocked, false);
  assert.deepEqual(result.workers.map((item) => item.id), ["keep"]);
});

test("supprimer définitivement est bloqué avec une heure ou un paiement", () => {
  const workers = [worker("protected")];
  const withHours = permanentlyDeleteHouseTrackingWorker(workers, [timeEntry("protected")], [], "protected");
  const withPayment = permanentlyDeleteHouseTrackingWorker(workers, [], [payment("protected")], "protected");

  assert.equal(withHours.blocked, true);
  assert.equal(withHours.deleted, false);
  assert.equal(withHours.workers, workers);
  assert.equal(withPayment.blocked, true);
  assert.equal(withPayment.deleted, false);
  assert.equal(withPayment.workers, workers);
});

test("un ancien intervenant sans status est considéré actif", () => {
  const { status: _status, ...legacyWorker } = worker("legacy");

  assert.equal(isHouseTrackingWorkerActive(legacyWorker as HouseTrackingWorker), true);
});
