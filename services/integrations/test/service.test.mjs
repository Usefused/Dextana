import { test } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { Database } from "../src/database.mjs";
import { Integrations } from "../src/service.mjs";
import { Billing } from "../src/billing.mjs";
import { catalogFromCLI } from "../src/catalog.mjs";
import { serverFor } from "../src/http.mjs";
const catalog = JSON.parse(
  await readFile(new URL("../catalog/catalog.json", import.meta.url)),
);
function fixture(t) {
  const db = new Database(":memory:");
  t.after(() => db.close());
  const mail = [],
    issued = [],
    revoked = [];
  let paidUntil = 0;
  const billing = {
    async checkout(user) {
      return {
        id: `cs_${user.id}`,
        url: `https://checkout.stripe.com/c/pay/${user.id}`,
        expires_at: user.checkout_expires / 1000,
      };
    },
    async entitlement() {
      return { paidUntil };
    },
    async portal() {
      return { url: "https://billing.stripe.com/test" };
    },
  };
  const fused = {
    async missingConnection() {
      return undefined;
    },
    async generate(user, bindings, name) {
      issued.push({
        user: bindings[0].account.user_ref,
        providers: bindings.map(({ provider }) => provider.id),
        bindings: bindings.map(({ provider, account }) => [
          provider.id,
          account.user_ref,
        ]),
        name,
      });
      return {
        token: `token-${bindings[0].account.user_ref}`,
        expires: Date.now() + 900_000,
      };
    },
    async revoke(name) {
      revoked.push(name);
    },
    async connect(user, provider, account) {
      return {
        url: `https://provider.example/authorize?user=${account.user_ref}&service=${provider.id}`,
      };
    },
  };
  const service = new Integrations(
    db,
    catalog,
    billing,
    fused,
    {
      async code(email, code) {
        mail.push({ email, code });
      },
    },
    randomBytes(32),
  );
  return {
    service,
    db,
    mail,
    issued,
    revoked,
    billing,
    fused,
    pay() {
      paidUntil = Date.now() + 86400_000;
    },
    stop() {
      paidUntil = 0;
    },
  };
}
async function signup(f, username = "alice") {
  const registration = await f.service.register({
    username,
    email: `${username}@example.com`,
  });
  const session = f.service.verify({
    challengeId: registration.challengeId,
    code: f.mail.at(-1).code,
  });
  return {
    ...registration,
    session: session.sessionToken,
    user: f.service.authenticate(session.sessionToken),
  };
}
test("registration requires email ownership and billing before integrations can be used", async (t) => {
  const f = fixture(t);
  const registration = await f.service.register({
    username: "alice",
    email: "alice@example.com",
  });
  assert.match(registration.checkoutUrl, /^https:\/\/checkout.stripe.com/);
  assert.throws(
    () => f.service.authenticate(registration.challengeId),
    /Sign in/,
  );
  assert.throws(
    () =>
      f.service.verify({
        challengeId: registration.challengeId,
        code: "00000000",
      }),
    /invalid/,
  );
  const session = f.service.verify({
    challengeId: registration.challengeId,
    code: f.mail[0].code,
  });
  const user = f.service.authenticate(session.sessionToken);
  assert.match(user.user_ref, /^dext_alice_[a-f0-9]{32}$/);
  assert.throws(
    () =>
      f.service.verify({
        challengeId: registration.challengeId,
        code: f.mail[0].code,
      }),
    /invalid/,
  );
  await assert.rejects(f.service.credentials(user), /subscription/);
  await assert.rejects(f.service.connect(user, "gmail"), /subscription/);
  assert.equal(f.issued.length, 0);
});
test("explicit scopes and identity remain separate for two paid users and tokens are encrypted", async (t) => {
  const f = fixture(t);
  f.pay();
  const alice = await signup(f),
    bob = await signup(f, "bob");
  await f.service.change(alice.user, "gmail", true);
  await f.service.change(bob.user, "google-calendar", true);
  const a = await f.service.credentials(alice.user),
    b = await f.service.credentials(bob.user);
  assert.notEqual(a.token, b.token);
  assert.notEqual(
    (await f.service.account(alice.user)).revision,
    (await f.service.account(bob.user)).revision,
  );
  assert.deepEqual(
    f.issued.map((i) => i.providers),
    [["gmail"], ["google-calendar"]],
  );
  assert.notEqual(f.issued[0].user, f.issued[1].user);
  assert.equal((await f.service.credentials(alice.user)).token, a.token);
  assert.equal(f.issued.length, 2);
  assert.ok(
    f.db
      .all("SELECT ciphertext FROM grants")
      .every((g) => !g.ciphertext.includes("token-")),
  );
  await assert.rejects(
    f.service.change(alice.user, "unlisted-service", true),
    /unavailable/,
  );
});
test("one Dext identity can select several accounts for one provider without changing another provider", async (t) => {
  const f = fixture(t);
  f.pay();
  const a = await signup(f);
  await f.service.change(a.user, "gmail", true);
  await f.service.change(a.user, "google-calendar", true);
  const initial = await f.service.account(a.user);
  assert.deepEqual(
    initial.identities.map(({ label }) => label),
    ["Personal"],
  );
  assert.equal(initial.providerAccounts.length, 2);
  assert.equal(
    initial.providerAccounts.every((account) => account.selected),
    true,
  );
  assert.equal(JSON.stringify(initial).includes(a.user.user_ref), false);

  const connection = await f.service.addAccount(
    a.user,
    "gmail",
    "Second Gmail",
  );
  const added = f.db.one(
    "SELECT * FROM provider_accounts WHERE user_id=? AND provider='gmail' AND label='Second Gmail'",
    a.user.id,
  );
  assert.ok(added.user_ref.startsWith("dext_connection_"));
  assert.notEqual(added.user_ref, a.user.user_ref);
  assert.ok(connection.url.includes(added.user_ref));

  const account = await f.service.account(a.user);
  assert.equal(
    account.providerAccounts.filter((item) => item.provider === "gmail").length,
    2,
  );
  assert.equal(
    account.providerAccounts.find((item) => item.id === added.id).selected,
    true,
  );
  await f.service.credentials(a.user);
  assert.deepEqual(f.issued[0].bindings, [
    ["gmail", added.user_ref],
    ["google-calendar", a.user.user_ref],
  ]);

  const originalGmail = account.providerAccounts.find(
    (item) => item.provider === "gmail" && item.id !== added.id,
  );
  await f.service.selectAccount(a.user, "gmail", originalGmail.id);
  await f.service.credentials(a.user);
  assert.deepEqual(f.issued[1].bindings, [
    ["gmail", a.user.user_ref],
    ["google-calendar", a.user.user_ref],
  ]);
});
test("disabling a provider revokes the earlier token before replacement; no empty wildcard token", async (t) => {
  const f = fixture(t);
  f.pay();
  const a = await signup(f);
  await f.service.change(a.user, "gmail", true);
  const old = await f.service.credentials(a.user);
  await f.service.change(a.user, "gmail", false);
  assert.deepEqual(f.revoked, [old.tokenId]);
  await assert.rejects(f.service.credentials(a.user), /Enable and connect/);
  assert.equal(f.issued.length, 1);
});
test("unknown issuance and failed revocation survive restart for reconciliation", async (t) => {
  const f = fixture(t);
  f.pay();
  const a = await signup(f);
  await f.service.change(a.user, "gmail", true);
  f.fused.generate = async () => {
    throw new Error("connection lost after issuance");
  };
  f.fused.revoke = async () => {
    throw new Error("offline");
  };
  await assert.rejects(f.service.credentials(a.user), /pending/);
  assert.equal(f.db.one("SELECT state FROM grants").state, "revoking");
  await assert.rejects(
    f.service.change(a.user, "google-calendar", true),
    /offline/,
  );
  assert.deepEqual(f.service.enabled(a.user), ["gmail"]);
  f.fused.revoke = async (name) => f.revoked.push(name);
  await f.service.maintain();
  assert.equal(f.db.all("SELECT * FROM grants").length, 0);
  assert.equal(f.revoked.length, 1);
});
test("cancellation reconciles and revokes, regardless of old event payload order", async (t) => {
  const f = fixture(t);
  f.pay();
  const a = await signup(f);
  const event = {
    id: "evt_checkout",
    type: "checkout.session.completed",
    data: {
      object: {
        id: `cs_${a.user.id}`,
        mode: "subscription",
        client_reference_id: a.user.id,
        metadata: { dext_user_id: a.user.id },
        customer: "cus_a",
        subscription: "sub_a",
      },
    },
  };
  await f.service.receiveEvent(event);
  await f.service.maintain();
  await f.service.change(a.user, "gmail", true);
  await f.service.credentials(a.user);
  f.stop();
  await f.service.receiveEvent({
    id: "evt_late",
    type: "customer.subscription.updated",
    data: { object: { customer: "cus_a", status: "active" } },
  });
  await f.service.maintain();
  assert.equal(f.db.user(a.user.id).paid_until, 0);
  assert.equal(f.db.all("SELECT * FROM grants").length, 0);
  assert.equal(f.revoked.length, 1);
  await f.service.receiveEvent(event);
  assert.equal(f.db.all("SELECT * FROM events").length, 2);
});
test("verification guesses are bounded and existing accounts do not get a second subscription", async (t) => {
  const f = fixture(t);
  const a = await signup(f);
  f.db.run(
    "UPDATE users SET subscription=? WHERE id=?",
    "sub_existing",
    a.user.id,
  );
  const registered = await f.service.register({
    username: "alice",
    email: "alice@example.com",
  });
  assert.equal(registered.checkoutUrl, undefined);
  for (let i = 0; i < 5; i++)
    assert.throws(
      () =>
        f.service.verify({ challengeId: registered.challengeId, code: "bad" }),
      /invalid/,
    );
  assert.throws(
    () =>
      f.service.verify({
        challengeId: registered.challengeId,
        code: f.mail.at(-1).code,
      }),
    /invalid/,
  );
});
test("billing only accepts the exact paid GBP monthly subscription and stable checkout request", async () => {
  const billing = new Billing({ origin: "https://integrations.example" });
  const user = {
    id: "a",
    email: "a@example.com",
    subscription: "sub_a",
    customer: "cus_a",
    checkout_nonce: "attempt",
    checkout_expires: Date.now() + 2100_000,
  };
  const subscription = {
    id: "sub_a",
    customer: "cus_a",
    metadata: { dext_user_id: "a" },
    status: "active",
    items: {
      data: [
        {
          quantity: 1,
          current_period_end: 1234567890,
          price: {
            currency: "gbp",
            unit_amount: 1000,
            recurring: { interval: "month", interval_count: 1 },
          },
        },
      ],
    },
    latest_invoice: { status: "paid", currency: "gbp", amount_paid: 1000 },
  };
  billing.request = async () => subscription;
  assert.equal((await billing.entitlement(user)).paidUntil, 1234567890000);
  subscription.status = "past_due";
  assert.equal((await billing.entitlement(user)).paidUntil, 0);
  subscription.items.data[0].price.currency = "usd";
  await assert.rejects(billing.entitlement(user), /price/);
  const calls = [];
  billing.request = async (...args) => {
    calls.push(args);
    return {};
  };
  await billing.checkout(user);
  await billing.checkout(user);
  assert.deepEqual(calls[0], calls[1]);
  assert.equal(calls[0][1].line_items[0].price_data.unit_amount, 1000);
});
test("HTTP catalog is public, customer credentials require authentication, and forged webhooks fail", async (t) => {
  const f = fixture(t);
  const server = serverFor(f.service, {
    origin: "http://127.0.0.1",
    stripeLive: false,
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const result = await fetch(`${origin}/v1/catalog`);
  const body = await result.json();
  assert.equal(body.providers.length, 3);
  assert.deepEqual(body.availability, { subscribe: false, signIn: false });
  assert.equal(JSON.stringify(body).includes("authRef"), false);
  assert.equal(
    (await fetch(`${origin}/v1/credentials`, { method: "POST", body: "{}" }))
      .status,
    401,
  );
  assert.equal(
    (await fetch(`${origin}/v1/stripe/webhook`, { method: "POST", body: "{}" }))
      .status,
    404,
  );
});

test("cancelled subscribers can subscribe again while past-due subscribers use the billing portal", async (t) => {
  const f = fixture(t);
  const a = await signup(f);
  f.db.run(
    "UPDATE users SET subscription=?,customer=? WHERE id=?",
    "sub_old",
    "cus_old",
    a.user.id,
  );
  f.billing.entitlement = async () => ({ paidUntil: 0, status: "past_due" });
  assert.equal(
    (await f.service.checkout(f.db.user(a.user.id))).url,
    "https://billing.stripe.com/test",
  );
  f.billing.entitlement = async () => ({ paidUntil: 0, status: "canceled" });
  assert.match(
    (await f.service.checkout(f.db.user(a.user.id))).url,
    /^https:\/\/checkout.stripe.com/,
  );
  assert.equal(f.db.user(a.user.id).subscription, null);
  assert.equal(f.db.user(a.user.id).customer, "cus_old");
});

test("first use starts OAuth for the missing account instead of issuing an unbound token", async (t) => {
  const f = fixture(t);
  f.pay();
  const a = await signup(f);
  await f.service.change(a.user, "gmail", true);
  f.fused.missingConnection = async (bindings) =>
    bindings.find(({ provider }) => provider.id === "gmail");
  await assert.rejects(f.service.credentials(a.user), (error) => {
    assert.equal(error.status, 409);
    assert.equal(error.connection.provider, "gmail");
    assert.ok(error.connection.url.includes(a.user.user_ref));
    return true;
  });
  assert.equal(f.issued.length, 0);
});

test("an unfinished token journal is recovered from SQLite after the service restarts", async (t) => {
  const { mkdtemp, rm } = await import("node:fs/promises");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const directory = await mkdtemp(join(tmpdir(), "dext-integrations-restart-"));
  const file = join(directory, "state.sqlite");
  const key = randomBytes(32);
  let db = new Database(file);
  const revoked = [];
  const billing = {
    async entitlement() {
      return { paidUntil: Date.now() + 86400000 };
    },
  };
  const fused = {
    async revoke(name) {
      revoked.push(name);
    },
  };
  try {
    db.run(
      "INSERT INTO users(id,username,email,user_ref,verified,created) VALUES(?,?,?,?,1,?)",
      "alice",
      "alice",
      "alice@example.com",
      "dext_alice_unique",
      Date.now(),
    );
    db.run(
      "INSERT INTO grants(name,user_id,fingerprint,state,expires) VALUES('orphan','alice','scope','issuing',?)",
      Date.now() + 900000,
    );
    db.close();
    db = new Database(file);
    const restarted = new Integrations(db, catalog, billing, fused, {}, key);
    await restarted.maintain();
    assert.deepEqual(revoked, ["orphan"]);
    assert.equal(db.all("SELECT * FROM grants").length, 0);
  } finally {
    db.close();
    await rm(directory, { recursive: true, force: true });
  }
});
