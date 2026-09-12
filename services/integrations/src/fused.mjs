import { spawn } from "node:child_process";
import { Fault, jsonFetch, secret } from "./core.mjs";
export function cli(args, config, structured = true) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env, CI: "true", FUSED_NO_UPDATE_CHECK: "1" };
    if (config.apiKey) {
      for (const key of Object.keys(env))
        if (key.startsWith("FUSED_")) delete env[key];
      Object.assign(env, {
        FUSED_API_KEY: config.apiKey,
        XDG_CONFIG_HOME: config.cliHome,
        FUSED_NO_UPDATE_CHECK: "1",
      });
    }
    const child = spawn(
      config.cli ?? "fused-cli",
      [
        ...args,
        "--engine-url",
        config.engine,
        "--no-input",
        "--timeout",
        "20s",
      ],
      { env, shell: false, stdio: ["ignore", "pipe", "pipe"] },
    );
    let output = "",
      oversized = false;
    const timer = setTimeout(() => {
      oversized = true;
      child.kill("SIGKILL");
    }, 25_000);
    child.stdout.on("data", (bytes) => {
      output += bytes;
      if (Buffer.byteLength(output) > 8_000_000) {
        oversized = true;
        child.kill("SIGKILL");
      }
    });
    child.stderr.resume();
    child.once("error", () => {
      clearTimeout(timer);
      reject(new Fault(502, "Fused CLI is unavailable."));
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      if (code !== 0 || oversized)
        return reject(new Fault(502, "Fused could not complete this request."));
      if (!structured) return resolve(undefined);
      try {
        resolve(JSON.parse(output));
      } catch {
        reject(new Fault(502, "Fused returned an invalid response."));
      }
    });
  });
}
export class Fused {
  constructor(config, catalog, run = cli) {
    this.config = config;
    this.catalog = catalog;
    this.run = run;
  }
  async identity() {
    const identity = await this.run(["whoami", "--json"], this.config);
    if (!identity.authenticated || identity.engine !== this.config.engine)
      throw new Fault(502, "Fused control identity is unavailable.");
  }
  async connect(user, provider, account) {
    if (!this.config.apiKey || !this.config.bucketId)
      throw new Fault(
        503,
        "The integrations control credential and bucket are not configured yet.",
      );
    const query = `mutation StartConnectSession($bucketId: String!, $serviceId: String!, $endUserRef: String!, $authType: String, $authName: String, $authRef: String, $scopes: [String!]) { startConnectSession(bucket_id:$bucketId,service_id:$serviceId,end_user_ref:$endUserRef,auth_type:$authType,auth_name:$authName,auth_ref:$authRef,scopes:$scopes) { authorize_url expires_at } }`;
    const result = await jsonFetch(`${this.config.engine}/engine/graphql`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.config.apiKey,
      },
      body: JSON.stringify({
        query,
        variables: {
          bucketId: this.config.bucketId,
          serviceId: provider.serviceId,
          endUserRef: account.user_ref,
          authType: provider.authType,
          authName: provider.authName,
          authRef: provider.authRef,
          scopes: provider.scopes,
        },
      }),
    });
    const connection = result.data?.startConnectSession;
    if (
      result.errors?.length ||
      !connection?.authorize_url ||
      new URL(connection.authorize_url).protocol !== "https:"
    )
      throw new Fault(502, "Could not start this provider connection.");
    return { url: connection.authorize_url };
  }
  async storeStripeSigningSecret(value) {
    if (!this.config.apiKey || !this.config.bucketId)
      throw new Fault(
        503,
        "Configure the Fused control credential and bucket before registration.",
      );
    // Same control API used by fused-cli secret set. The provider credential stays in the bucket.
    const response = await fetch(`${this.config.engine}/workspace/secrets`, {
      method: "PUT",
      redirect: "error",
      signal: AbortSignal.timeout(20_000),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": this.config.apiKey,
      },
      body: JSON.stringify({
        service_id: "3e092174-528d-4768-8b38-9f631de38e64",
        key_name: "dext_stripe_signing",
        credential_type: "api_key",
        value,
        bucket_id: this.config.bucketId,
        expires_at: null,
      }),
    });
    await response.body?.cancel();
    if (!response.ok)
      throw new Fault(
        502,
        "Fused could not store the webhook signing secret. Registration remains pending.",
      );
  }
  async bootstrapStripeSigningSecret() {
    if (!this.config.apiKey || !this.config.bucketId)
      throw new Fault(
        503,
        "Configure the Fused control credential and bucket first.",
      );
    let offset = 0;
    for (;;) {
      const page = await this.run(
        [
          "secret",
          "list",
          "--bucket",
          this.config.bucketId,
          "--json",
          "--limit",
          "100",
          "--offset",
          String(offset),
        ],
        this.config,
      );
      if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total))
        throw new Fault(
          502,
          "Could not verify existing Fused secret metadata.",
        );
      // Never rotate a signing secret belonging to a previously initialized registration.
      if (page.items.some((item) => item.key_name === "dext_stripe_signing"))
        return { initialized: true, existing: true };
      offset += page.items.length;
      if (offset >= page.total) break;
      if (!page.items.length || offset > 10_000)
        throw new Fault(502, "Incomplete secret metadata.");
    }
    await this.storeStripeSigningSecret(secret());
    return { initialized: true, existing: false };
  }
  async missingConnection(bindings) {
    const connections = [];
    for (const userRef of [
      ...new Set(bindings.map(({ account }) => account.user_ref)),
    ]) {
      let offset = 0;
      for (;;) {
        const page = await this.run(
          [
            "bucket",
            "connections",
            this.config.bucketId,
            "--user",
            userRef,
            "--json",
            "--limit",
            "100",
            "--offset",
            String(offset),
          ],
          this.config,
        );
        if (!Array.isArray(page.items) || !Number.isSafeInteger(page.total))
          throw new Fault(502, "Could not verify provider connections.");
        connections.push(...page.items);
        offset += page.items.length;
        if (offset >= page.total) break;
        if (!page.items.length || offset > 10000)
          throw new Fault(502, "Provider connections are incomplete.");
      }
    }
    return bindings.find(
      ({ provider: p, account }) =>
        !connections.some(
          (c) =>
            c.bucket_id === this.config.bucketId &&
            c.service_id === p.serviceId &&
            c.end_user_ref === account.user_ref &&
            c.auth_name === p.authName &&
            c.auth_type === p.authType &&
            c.refresh_state !== "reconnect_required" &&
            p.scopes.every((scope) => c.scopes?.includes(scope)),
        ),
    );
  }
  async generate(user, bindings, name) {
    if (!bindings.length) throw new Fault(409, "Connect an integration first.");
    await this.identity();
    const allow = [
      ...new Set(
        bindings.flatMap(({ provider: p }) => p.operations.map((op) => op.id)),
      ),
    ].sort();
    if (!allow.length || allow.includes("*"))
      throw new Fault(502, "An exact operation scope is required.");
    const lifetime = Math.min(
      900,
      Math.floor((user.paid_until - Date.now()) / 1000),
    );
    if (lifetime < 1)
      throw new Fault(402, "Your paid subscription period has ended.");
    const args = [
      "mcp",
      "token",
      "generate",
      this.catalog.mcpId,
      name,
      "--expires-in",
      `${lifetime}s`,
      "--json",
    ];
    for (const operation of allow) args.push("--allow", operation);
    for (const { provider: p, account } of bindings)
      args.push("--fixed-binding", `${p.id},${p.authName},${account.user_ref}`);
    const token = await this.run(args, this.config);
    const expiry = Date.parse(token.expires_at);
    if (
      token.app_family_id !== this.catalog.mcpId ||
      token.name !== name ||
      token.binding_mode !== "fixed" ||
      token.binding_count !== bindings.length ||
      !Array.isArray(token.allow) ||
      JSON.stringify([...token.allow].sort()) !== JSON.stringify(allow) ||
      typeof token.token !== "string" ||
      !token.token ||
      !Number.isFinite(expiry) ||
      expiry <= Date.now() ||
      expiry > Math.min(Date.now() + 930_000, user.paid_until + 1000)
    )
      throw new Fault(
        502,
        "Fused did not confirm the requested account binding.",
      );
    return { token: token.token, expires: expiry };
  }
  async revoke(name) {
    await this.identity();
    const tokens = await this.run(
      ["mcp", "token", "list", this.catalog.mcpId, "--json"],
      this.config,
    );
    if (!Array.isArray(tokens))
      throw new Fault(502, "Could not verify token revocation.");
    const token = tokens.find((item) => item.name === name);
    if (!token || ["revoked", "expired"].includes(token.status)) return;
    await this.run(
      ["mcp", "token", "revoke", this.catalog.mcpId, name],
      this.config,
      false,
    );
  }
}
