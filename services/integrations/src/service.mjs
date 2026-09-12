import { randomUUID, randomInt, timingSafeEqual } from "node:crypto";
import { Fault, hash, secret, requireValue, seal, unseal } from "./core.mjs";
import { provider, publicCatalog } from "./catalog.mjs";
export class Integrations {
  constructor(db, catalog, billing, fused, mail, encryptionKey) {
    Object.assign(this, { db, catalog, billing, fused, mail, encryptionKey });
    this.locks = new Map();
  }
  exclusive(id, fn) {
    const prior = this.locks.get(id) ?? Promise.resolve();
    const result = prior.catch(() => {}).then(fn);
    this.locks.set(id, result);
    return result.finally(() => {
      if (this.locks.get(id) === result) this.locks.delete(id);
    });
  }
  limit(key, maximum = 10, duration = 600_000) {
    const now = Date.now();
    this.db.run("DELETE FROM limits WHERE expires<?", now);
    const current = this.db.one("SELECT * FROM limits WHERE key=?", key);
    if (current?.count >= maximum)
      throw new Fault(429, "Too many attempts. Try again later.");
    this.db.run(
      "INSERT INTO limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1",
      key,
      now + duration,
    );
  }
  async challenge(user) {
    this.limit(`email:${hash(user.email)}`, 5);
    const id = secret(),
      code = String(randomInt(10000000, 100000000));
    this.db.run(
      "INSERT INTO challenges(id,user_id,digest,expires) VALUES(?,?,?,?)",
      id,
      user.id,
      hash(`${id}:${code}`),
      Date.now() + 600_000,
    );
    try {
      await this.mail.code(user.email, code);
    } catch (error) {
      this.db.run("DELETE FROM challenges WHERE id=?", id);
      throw error;
    }
    return id;
  }
  async register(input) {
    const username = String(input.username ?? "")
        .trim()
        .toLowerCase(),
      email = String(input.email ?? "")
        .trim()
        .toLowerCase();
    requireValue(
      /^[a-z][a-z0-9_-]{2,31}$/.test(username),
      "Use 3–32 letters, digits, underscores or hyphens for your username.",
    );
    requireValue(
      email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
      "Enter a valid email address.",
    );
    return this.exclusive(`email:${email}`, async () => {
      let user = this.db.one("SELECT * FROM users WHERE email=?", email);
      if (!user) {
        if (this.db.one("SELECT id FROM users WHERE username=?", username))
          throw new Fault(409, "Choose another username.");
        const id = randomUUID();
        this.db.run(
          "INSERT INTO users(id,username,email,user_ref,created) VALUES(?,?,?,?,?)",
          id,
          username,
          email,
          `dext_${username}_${id.replaceAll("-", "")}`,
          Date.now(),
        );
        user = this.db.user(id);
      }
      // Existing subscribers sign in; registration must not start a second subscription.
      const challengeId = await this.challenge(user);
      if (user.subscription) return { challengeId };
      const checkout = await this.checkout(user);
      return { challengeId, checkoutUrl: checkout.url };
    });
  }
  async login(input) {
    const email = String(input.email ?? "")
      .trim()
      .toLowerCase();
    this.limit(`login:${hash(email)}`, 5);
    const user = this.db.one("SELECT * FROM users WHERE email=?", email);
    return { challengeId: user ? await this.challenge(user) : secret() };
  }
  verify({ challengeId, code }) {
    const challenge = this.db.one(
      "SELECT * FROM challenges WHERE id=?",
      String(challengeId),
    );
    if (!challenge || challenge.expires < Date.now() || challenge.attempts >= 5)
      throw new Fault(401, "The code is invalid or expired.");
    this.db.run(
      "UPDATE challenges SET attempts=attempts+1 WHERE id=?",
      challengeId,
    );
    if (
      !timingSafeEqual(
        Buffer.from(challenge.digest),
        Buffer.from(hash(`${challengeId}:${code}`)),
      )
    )
      throw new Fault(401, "The code is invalid or expired.");
    const token = secret();
    this.db.transaction(() => {
      this.db.run("DELETE FROM challenges WHERE user_id=?", challenge.user_id);
      this.db.run("UPDATE users SET verified=1 WHERE id=?", challenge.user_id);
      this.db.run(
        "INSERT INTO sessions(digest,user_id,expires) VALUES(?,?,?)",
        hash(token),
        challenge.user_id,
        Date.now() + 30 * 86400_000,
      );
    });
    return { sessionToken: token };
  }
  authenticate(token) {
    if (typeof token !== "string" || token.length > 200)
      throw new Fault(401, "Sign in to Dext Integrations.");
    const session = this.db.one(
      "SELECT * FROM sessions WHERE digest=? AND expires>?",
      hash(token),
      Date.now(),
    );
    if (!session) throw new Fault(401, "Sign in to Dext Integrations.");
    return this.db.user(session.user_id);
  }
  async checkout(user) {
    if (user.subscription) {
      const entitlement = await this.billing.entitlement(user);
      if (!["canceled", "incomplete_expired"].includes(entitlement.status))
        return this.billing.portal(user);
      await this.revokeAll(user);
      this.db.run(
        "UPDATE users SET subscription=NULL,paid_until=0,checkout_url=NULL,checkout_nonce=NULL,checkout_expires=NULL WHERE id=?",
        user.id,
      );
      user = this.db.user(user.id);
    }
    if (user.checkout_url && user.checkout_expires > Date.now() + 60_000)
      return { url: user.checkout_url };
    if (!user.checkout_nonce || user.checkout_expires <= Date.now() + 60_000) {
      this.db.run(
        "UPDATE users SET checkout_nonce=?,checkout_expires=? WHERE id=?",
        randomUUID(),
        Math.floor(Date.now() / 1000) * 1000 + 2100_000,
        user.id,
      );
      user = this.db.user(user.id);
    }
    const session = await this.billing.checkout(user);
    if (
      !session.id ||
      !session.url ||
      new URL(session.url).origin !== "https://checkout.stripe.com"
    )
      throw new Fault(502, "Stripe did not return a payment link.");
    this.db.run(
      "UPDATE users SET checkout_id=?,checkout_url=?,checkout_expires=? WHERE id=?",
      session.id,
      session.url,
      session.expires_at * 1000,
      user.id,
    );
    return { url: session.url };
  }
  enabled(user) {
    return this.db
      .all(
        "SELECT provider FROM enabled WHERE user_id=? ORDER BY provider",
        user.id,
      )
      .map((row) => row.provider);
  }
  identity(user) {
    let identity = this.db.one(
      "SELECT * FROM identities WHERE user_id=? ORDER BY created,id LIMIT 1",
      user.id,
    );
    if (!identity) {
      const id = randomUUID();
      this.db.run(
        "INSERT INTO identities(id,user_id,label,created) VALUES(?,?,?,?)",
        id,
        user.id,
        "Personal",
        Date.now(),
      );
      identity = this.db.one("SELECT * FROM identities WHERE id=?", id);
    }
    return identity;
  }
  selectedAccount(user, id) {
    let account = this.db.one(
      `SELECT a.* FROM provider_accounts a
       JOIN provider_selections s ON s.account_id=a.id
       WHERE s.user_id=? AND s.provider=? AND a.user_id=? AND a.provider=?`,
      user.id,
      id,
      user.id,
      id,
    );
    if (account) return account;
    account = this.db.one(
      "SELECT * FROM provider_accounts WHERE user_id=? AND provider=? ORDER BY created,id LIMIT 1",
      user.id,
      id,
    );
    if (!account) {
      const identity = this.identity(user);
      const accountId = randomUUID();
      this.db.run(
        "INSERT INTO provider_accounts(id,user_id,identity_id,provider,label,user_ref,created) VALUES(?,?,?,?,?,?,?)",
        accountId,
        user.id,
        identity.id,
        id,
        "Default account",
        user.user_ref,
        Date.now(),
      );
      account = this.db.one(
        "SELECT * FROM provider_accounts WHERE id=?",
        accountId,
      );
    }
    this.db.run(
      `INSERT INTO provider_selections(user_id,provider,account_id) VALUES(?,?,?)
       ON CONFLICT(user_id,provider) DO UPDATE SET account_id=excluded.account_id`,
      user.id,
      id,
      account.id,
    );
    return account;
  }
  accountList(user) {
    return this.db.all(
      `SELECT a.id,a.identity_id,a.provider,a.label,
              CASE WHEN s.account_id=a.id THEN 1 ELSE 0 END AS selected
       FROM provider_accounts a
       LEFT JOIN provider_selections s
         ON s.user_id=a.user_id AND s.provider=a.provider
       WHERE a.user_id=? ORDER BY a.provider,a.created,a.id`,
      user.id,
    );
  }
  bindings(user, providers) {
    return providers.map((item) => ({
      provider: item,
      account: this.selectedAccount(user, item.id),
    }));
  }
  async refreshBilling(user, force = false) {
    if (!force && Date.now() - user.billing_checked < 60_000) return user;
    const { paidUntil } = await this.billing.entitlement(user);
    this.db.run(
      "UPDATE users SET paid_until=?,billing_checked=? WHERE id=?",
      paidUntil,
      Date.now(),
      user.id,
    );
    if (paidUntil <= Date.now()) await this.revokeAll(user);
    return this.db.user(user.id);
  }
  async paid(user) {
    user = await this.refreshBilling(user);
    if (!user.verified || user.paid_until <= Date.now())
      throw new Fault(402, "An active £10/month subscription is required.");
    return user;
  }
  async account(user) {
    user = await this.refreshBilling(user);
    const enabled = this.enabled(user);
    const identity = this.identity(user);
    for (const id of enabled) this.selectedAccount(user, id);
    const providerAccounts = this.accountList(user).map((account) => ({
      id: account.id,
      identityId: account.identity_id,
      provider: account.provider,
      label: account.label,
      selected: Boolean(account.selected),
    }));
    const grants = this.db.all(
      "SELECT fingerprint,expires FROM grants WHERE user_id=? AND state='ready'",
      user.id,
    );
    return {
      username: user.username,
      email: user.email,
      subscribed: user.paid_until > Date.now(),
      enabled,
      identities: [{ id: identity.id, label: identity.label }],
      providerAccounts,
      connected: grants.some((g) => g.expires > Date.now()),
      revision: hash(
        JSON.stringify([
          this.catalog.versionId,
          user.id,
          enabled,
          providerAccounts,
        ]),
      ),
      mcpUrl: this.catalog.mcpUrl,
    };
  }
  async connect(user, id, accountId) {
    user = await this.paid(user);
    const item = provider(this.catalog, id);
    if (!this.enabled(user).includes(item.id))
      throw new Fault(
        409,
        "Enable this integration before connecting an account.",
      );
    const selected = this.selectedAccount(user, item.id);
    const account = accountId
      ? this.db.one(
          "SELECT * FROM provider_accounts WHERE id=? AND user_id=? AND provider=?",
          String(accountId),
          user.id,
          id,
        )
      : selected;
    if (!account) throw new Fault(404, "This provider account is unavailable.");
    return this.fused.connect(user, item, account);
  }
  async addAccount(user, id, label) {
    user = await this.paid(user);
    const item = provider(this.catalog, id);
    if (!this.enabled(user).includes(item.id))
      throw new Fault(409, "Enable this integration before adding an account.");
    label = String(label ?? "")
      .trim()
      .replace(/\s+/g, " ");
    requireValue(
      label.length >= 1 && label.length <= 80,
      "Use a 1–80 character account label.",
    );
    if (
      this.db.one(
        "SELECT id FROM provider_accounts WHERE user_id=? AND provider=? AND lower(label)=lower(?)",
        user.id,
        item.id,
        label,
      )
    )
      throw new Fault(409, "Use a different label for this provider account.");
    const count = this.db.one(
      "SELECT count(*) AS count FROM provider_accounts WHERE user_id=? AND provider=?",
      user.id,
      item.id,
    ).count;
    if (count >= 10)
      throw new Fault(409, "A provider can have up to 10 accounts.");
    await this.revokeAll(user);
    const identity = this.identity(user);
    const account = {
      id: randomUUID(),
      user_ref: `dext_connection_${randomUUID().replaceAll("-", "")}`,
    };
    this.db.transaction(() => {
      this.db.run(
        "INSERT INTO provider_accounts(id,user_id,identity_id,provider,label,user_ref,created) VALUES(?,?,?,?,?,?,?)",
        account.id,
        user.id,
        identity.id,
        item.id,
        label,
        account.user_ref,
        Date.now(),
      );
      this.db.run(
        `INSERT INTO provider_selections(user_id,provider,account_id) VALUES(?,?,?)
         ON CONFLICT(user_id,provider) DO UPDATE SET account_id=excluded.account_id`,
        user.id,
        item.id,
        account.id,
      );
    });
    return this.fused.connect(user, item, account);
  }
  async selectAccount(user, id, accountId) {
    user = await this.paid(user);
    provider(this.catalog, id);
    const account = this.db.one(
      "SELECT * FROM provider_accounts WHERE id=? AND user_id=? AND provider=?",
      String(accountId ?? ""),
      user.id,
      id,
    );
    if (!account) throw new Fault(404, "This provider account is unavailable.");
    const selected = this.selectedAccount(user, id);
    if (selected.id === account.id) return this.account(user);
    await this.revokeAll(user);
    this.db.run(
      "UPDATE provider_selections SET account_id=? WHERE user_id=? AND provider=?",
      account.id,
      user.id,
      id,
    );
    return this.account(user);
  }
  async revokeAll(user) {
    const grants = this.db.all("SELECT * FROM grants WHERE user_id=?", user.id);
    for (const grant of grants) {
      this.db.run(
        "UPDATE grants SET state='revoking',ciphertext=NULL WHERE name=?",
        grant.name,
      );
      await this.fused.revoke(grant.name);
      this.db.run("DELETE FROM grants WHERE name=?", grant.name);
    }
  }
  async change(user, id, enabled) {
    user = await this.paid(user);
    provider(this.catalog, id);
    requireValue(
      typeof enabled === "boolean",
      "Choose whether to enable this integration.",
    );
    // Revoke before reducing or expanding scope. Failed revocation blocks replacement.
    await this.revokeAll(user);
    if (enabled)
      this.db.run(
        "INSERT OR IGNORE INTO enabled(user_id,provider) VALUES(?,?)",
        user.id,
        id,
      );
    else
      this.db.run(
        "DELETE FROM enabled WHERE user_id=? AND provider=?",
        user.id,
        id,
      );
    return this.account(user);
  }
  async credentials(user) {
    user = await this.paid(user);
    const providers = this.enabled(user).map((id) =>
      provider(this.catalog, id),
    );
    if (!providers.length)
      throw new Fault(
        409,
        "Enable and connect an integration in Settings → Integrations.",
      );
    const bindings = this.bindings(user, providers);
    const fingerprint = hash(
      JSON.stringify([
        this.catalog.versionId,
        bindings.map(({ provider: item, account }) => [item.id, account.id]),
      ]),
    );
    const current = this.db.one(
      "SELECT * FROM grants WHERE user_id=? AND state='ready' AND fingerprint=? AND expires>?",
      user.id,
      fingerprint,
      Date.now() + 60_000,
    );
    if (current)
      return {
        token: unseal(current.ciphertext, this.encryptionKey),
        tokenId: current.name,
        expiresAt: current.expires,
        url: this.catalog.mcpUrl,
      };
    const missing = await this.fused.missingConnection(bindings);
    if (missing) {
      const connection = await this.fused.connect(
        user,
        missing.provider,
        missing.account,
      );
      const error = new Fault(
        409,
        `Connect ${missing.provider.name} (${missing.account.label}) in your browser, then return to Dext.`,
      );
      error.connection = {
        provider: missing.provider.id,
        accountId: missing.account.id,
        url: connection.url,
      };
      throw error;
    }
    await this.revokeAll(user);
    const name = `dext-${user.id}-${randomUUID()}`;
    this.db.run(
      "INSERT INTO grants(name,user_id,fingerprint,state,expires) VALUES(?,?,?,'issuing',?)",
      name,
      user.id,
      fingerprint,
      Date.now() + 900_000,
    );
    try {
      // Engine refuses fixed bindings until the exact user's provider grant exists.
      const issued = await this.fused.generate(user, bindings, name);
      this.db.run(
        "UPDATE grants SET state='ready',ciphertext=?,expires=? WHERE name=?",
        seal(issued.token, this.encryptionKey),
        issued.expires,
        name,
      );
      return {
        token: issued.token,
        tokenId: name,
        expiresAt: issued.expires,
        url: this.catalog.mcpUrl,
      };
    } catch {
      // Keep a durable cleanup record even when issuance outcome is unknown.
      await this.revokeAll(user).catch(() => {});
      throw new Fault(
        409,
        "Connect every enabled service to your account, then try again. Token activation is pending.",
      );
    }
  }
  async receiveEvent(event) {
    if (this.db.one("SELECT id FROM events WHERE id=?", String(event.id)))
      return;
    const object = event.data?.object;
    if (!event.id || !object) throw new Fault(400, "Invalid Stripe event.");
    let user;
    if (event.type === "checkout.session.completed") {
      user = this.db.one("SELECT * FROM users WHERE checkout_id=?", object.id);
      if (
        !user ||
        object.client_reference_id !== user.id ||
        object.metadata?.dext_user_id !== user.id ||
        object.mode !== "subscription" ||
        typeof object.customer !== "string" ||
        typeof object.subscription !== "string"
      )
        return;
      this.db.run(
        "UPDATE users SET customer=?,subscription=?,billing_checked=0 WHERE id=?",
        object.customer,
        object.subscription,
        user.id,
      );
    } else if (
      [
        "invoice.paid",
        "invoice.payment_failed",
        "customer.subscription.updated",
        "customer.subscription.deleted",
      ].includes(event.type)
    ) {
      user = this.db.one(
        "SELECT * FROM users WHERE customer=?",
        object.customer,
      );
    }
    if (user)
      this.db.run(
        "INSERT OR IGNORE INTO events(id,user_id) VALUES(?,?)",
        event.id,
        user.id,
      );
  }
  async maintain() {
    const users = this.db.all(
      "SELECT DISTINCT user_id FROM events WHERE done=0 UNION SELECT DISTINCT user_id FROM grants",
    );
    for (const row of users) {
      await this.exclusive(row.user_id, async () => {
        const user = this.db.user(row.user_id);
        const unfinished = this.db.one(
          "SELECT name FROM grants WHERE user_id=? AND state!='ready'",
          user.id,
        );
        if (unfinished) await this.revokeAll(user);
        await this.refreshBilling(user, true);
        this.db.run("UPDATE events SET done=1 WHERE user_id=?", user.id);
      }).catch(() => {}); // Durable rows remain for the next reconciliation pass.
    }
    this.db.run("DELETE FROM challenges WHERE expires<?", Date.now());
    this.db.run("DELETE FROM sessions WHERE expires<?", Date.now());
  }
  catalogPublic() {
    return publicCatalog(this.catalog);
  }
}
