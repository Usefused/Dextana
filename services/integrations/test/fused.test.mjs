import { test } from "node:test";
import assert from "node:assert/strict";
import { Fused } from "../src/fused.mjs";
const catalog = { mcpId: "mcp-family" };
const config = { engine: "https://fused.run.usefused.com" };
const providers = [
  {
    id: "gmail",
    authName: "oauth2",
    operations: [{ id: "gmail.users.messages.get" }],
  },
];
test("CLI issuance explicitly pins the user and operations, verifies fixed mode, and never falls back to dynamic", async () => {
  const calls = [];
  const run = async (args) => {
    calls.push(args);
    return args[0] === "whoami"
      ? { authenticated: true, engine: config.engine }
      : {
          app_family_id: catalog.mcpId,
          name: "token-name",
          binding_mode: "fixed",
          binding_count: 1,
          allow: ["gmail.users.messages.get"],
          token: "one-time-secret",
          expires_at: new Date(Date.now() + 850000).toISOString(),
        };
  };
  const fused = new Fused(config, catalog, run);
  const user = {
    user_ref: "dext_alice_immutable",
    paid_until: Date.now() + 86400000,
  };
  const bindings = [
    { provider: providers[0], account: { user_ref: user.user_ref } },
  ];
  await fused.generate(user, bindings, "token-name");
  assert.deepEqual(calls[1].slice(-4), [
    "--allow",
    "gmail.users.messages.get",
    "--fixed-binding",
    "gmail,oauth2,dext_alice_immutable",
  ]);
  fused.run = async (args) => {
    const result = await run(args);
    if (args[0] !== "whoami") result.binding_mode = "dynamic";
    return result;
  };
  await assert.rejects(fused.generate(user, bindings, "token-name"), /binding/);
  assert.equal(calls.filter((args) => args.includes("generate")).length, 2);
  await assert.rejects(fused.generate(user, [], "empty"), /Connect/);
});
test("revocation treats a verified missing/expired token as already cleaned up", async () => {
  const calls = [];
  const fused = new Fused(config, catalog, async (args) => {
    calls.push(args);
    return args[0] === "whoami"
      ? { authenticated: true, engine: config.engine }
      : [];
  });
  await fused.revoke("never-created");
  assert.equal(
    calls.some((args) => args.includes("revoke")),
    false,
  );
});

test("OAuth readiness requires the exact bucket, service, auth scheme and immutable user reference", async () => {
  const p = {
    ...providers[0],
    serviceId: "service-gmail",
    authType: "oauth",
    scopes: ["mail.read"],
  };
  const user = { user_ref: "dext_alice" };
  const connection = {
    bucket_id: "bucket",
    service_id: p.serviceId,
    auth_type: "oauth",
    auth_name: "oauth2",
    end_user_ref: "dext_bob",
    scopes: ["mail.read"],
    refresh_state: "healthy",
  };
  const fused = new Fused(
    { ...config, bucketId: "bucket" },
    catalog,
    async (args) => {
      assert.ok(args.includes(user.user_ref));
      return { items: [connection], total: 1 };
    },
  );
  const bindings = [{ provider: p, account: { user_ref: user.user_ref } }];
  assert.equal((await fused.missingConnection(bindings)).provider.id, "gmail");
  connection.end_user_ref = user.user_ref;
  assert.equal(await fused.missingConnection(bindings), undefined);
  connection.refresh_state = "reconnect_required";
  assert.equal((await fused.missingConnection(bindings)).provider.id, "gmail");
});

test("readiness and token bindings resolve each provider account independently", async () => {
  const gmail = {
    ...providers[0],
    serviceId: "service-gmail",
    authType: "oauth",
    scopes: ["mail.read"],
  };
  const github = {
    id: "github",
    serviceId: "service-github",
    authType: "oauth",
    authName: "oauth2",
    scopes: ["repo"],
    operations: [{ id: "github.repos.get" }],
  };
  const bindings = [
    { provider: gmail, account: { user_ref: "gmail-two" } },
    { provider: github, account: { user_ref: "github-only" } },
  ];
  const calls = [];
  const fused = new Fused(
    { ...config, bucketId: "bucket" },
    catalog,
    async (args) => {
      calls.push(args);
      if (args[0] === "whoami")
        return { authenticated: true, engine: config.engine };
      if (args[0] === "bucket") {
        const userRef = args[args.indexOf("--user") + 1];
        return {
          items: [
            {
              bucket_id: "bucket",
              service_id:
                userRef === "gmail-two" ? "service-gmail" : "service-github",
              auth_type: "oauth",
              auth_name: "oauth2",
              end_user_ref: userRef,
              scopes: [userRef === "gmail-two" ? "mail.read" : "repo"],
              refresh_state: "healthy",
            },
          ],
          total: 1,
        };
      }
      return {
        app_family_id: catalog.mcpId,
        name: "multi-token",
        binding_mode: "fixed",
        binding_count: 2,
        allow: ["github.repos.get", "gmail.users.messages.get"],
        token: "secret",
        expires_at: new Date(Date.now() + 850000).toISOString(),
      };
    },
  );
  assert.equal(await fused.missingConnection(bindings), undefined);
  await fused.generate(
    { paid_until: Date.now() + 86400000 },
    bindings,
    "multi-token",
  );
  const generated = calls.find((args) => args.includes("generate"));
  assert.ok(generated.includes("gmail,oauth2,gmail-two"));
  assert.ok(generated.includes("github,oauth2,github-only"));
});
