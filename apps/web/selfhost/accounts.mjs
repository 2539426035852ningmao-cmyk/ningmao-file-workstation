import { createHash, randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

export const accountApi = "/api/account";
const derive = promisify(scrypt);
const sessionSeconds = 7 * 24 * 60 * 60;
const invalidCredentials = "账号名或密码不正确。";
const hex = value => value.toString("hex");
const digest = secret => createHash("sha256").update(secret).digest("hex");
const publicAccount = ({ id, username }) => ({ id, username });
const loopbackHost = /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i;

export function createAccountHandler(db, { secure, readJson, requireValue }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS accounts (
      id TEXT PRIMARY KEY, username TEXT NOT NULL, username_key TEXT UNIQUE NOT NULL,
      salt TEXT NOT NULL, password_hash TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS account_sessions (
      token_hash TEXT PRIMARY KEY, account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
      expires INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS account_sessions_account ON account_sessions(account_id);
  `);
  const byName = db.prepare("SELECT * FROM accounts WHERE username_key = ?");
  const byId = db.prepare("SELECT * FROM accounts WHERE id = ?");
  const bySession = db.prepare(`SELECT a.* FROM accounts a JOIN account_sessions s ON s.account_id = a.id
    WHERE s.token_hash = ? AND s.expires > ?`);
  const insertAccount = db.prepare("INSERT INTO accounts VALUES (?, ?, ?, ?, ?) ON CONFLICT(username_key) DO NOTHING");
  const insertSession = db.prepare("INSERT INTO account_sessions VALUES (?, ?, ?)");
  const endSession = db.prepare("DELETE FROM account_sessions WHERE token_hash = ?");
  const endAccountSessions = db.prepare("DELETE FROM account_sessions WHERE account_id = ?");
  const purgeSessions = db.prepare("DELETE FROM account_sessions WHERE expires <= ?");
  const trimSessions = db.prepare(`DELETE FROM account_sessions WHERE account_id = ? AND rowid NOT IN (
    SELECT rowid FROM account_sessions WHERE account_id = ? ORDER BY rowid DESC LIMIT 8)`);
  const updateName = db.prepare("UPDATE OR IGNORE accounts SET username = ?, username_key = ? WHERE id = ?");
  const updatePassword = db.prepare("UPDATE accounts SET salt = ?, password_hash = ? WHERE id = ?");
  const cookie = secure ? "__Host-ningmao_account" : "ningmao_account";
  const cookiePattern = new RegExp(`(?:^|;\\s*)${cookie}=([a-f0-9]{64})(?:;|$)`);
  const attempts = new Map();
  const browserLinks = new Map();
  let minute = 0, total = 0, hashing = 0;

  function usernameOf(value) {
    const name = typeof value === "string" ? value.normalize("NFKC").trim() : "";
    return requireValue(/^[\p{L}\p{N}_-]{2,32}$/u.test(name) && name, 400, "账号名使用 2 到 32 个字母、数字、下划线或连字符。");
  }

  function passwordOf(value, minimum) {
    const length = typeof value === "string" && value.length <= 256 ? [...value].length : 0;
    return requireValue(length >= minimum && length <= 128 && value, 400,
      minimum > 1 ? "新密码须为 15 到 128 个字符。" : "密码须为 1 到 128 个字符。");
  }

  function limitAttempts(address) {
    const now = Math.floor(Date.now() / 60_000);
    if (now !== minute) { minute = now; attempts.clear(); total = 0; }
    const count = attempts.get(address) ?? 0;
    requireValue(count < 20 && total < 60, 429, "操作过于频繁，请稍后重试。");
    attempts.set(address, count + 1);
    total++;
  }

  async function hashPassword(password, salt) {
    requireValue(hashing < 2, 429, "登录服务繁忙，请稍后重试。");
    hashing++;
    try {
      return await derive(password, salt, 32, { N: 2 ** 15, r: 8, p: 3, maxmem: 40 * 1024 * 1024 });
    } finally {
      hashing--;
    }
  }

  async function matchesPassword(account, password) {
    const actual = await hashPassword(password, Buffer.from(account?.salt ?? "0".repeat(32), "hex"));
    const match = timingSafeEqual(actual, Buffer.from(account?.password_hash ?? "0".repeat(64), "hex"));
    return Boolean(account && match);
  }

  function sessionCookie(response, secret, seconds = sessionSeconds) {
    response.setHeader("Set-Cookie", `${cookie}=${secret}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${seconds}${secure ? "; Secure" : ""}`);
  }

  function issueSession(id) {
    const secret = hex(randomBytes(32));
    const now = Date.now();
    purgeSessions.run(now);
    insertSession.run(digest(secret), id, now + sessionSeconds * 1000);
    trimSessions.run(id, id);
    return secret;
  }

  const tokenFor = request => cookiePattern.exec(request.headers.cookie ?? "")?.[1];
  const accountTransport = request => secure || (
    ["127.0.0.1", "::ffff:127.0.0.1", "::1"].includes(request.socket.remoteAddress)
    && loopbackHost.test(request.headers.host ?? "")
  );
  function current(request) {
    const token = tokenFor(request);
    return accountTransport(request) && token ? bySession.get(digest(token), Date.now()) : null;
  }

  function transaction(action) {
    db.exec("BEGIN IMMEDIATE");
    try {
      const value = action();
      db.exec("COMMIT");
      return value;
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }

  async function handle(request, response, pathname, json) {
    requireValue(accountTransport(request), 403, "请用 HTTPS 或本机站点访问账号。");
    response.setHeader("Cache-Control", "no-store");
    const action = pathname.slice(accountApi.length);
    const secret = tokenFor(request);
    const session = secret ? digest(secret) : null;
    const getAccount = () => session ? bySession.get(session, Date.now()) : null;
    if (request.method === "GET" && action === "") {
      const account = getAccount();
      return json(200, { account: account ? publicAccount(account) : null });
    }
    requireValue(request.method === "POST" && ["/register", "/login", "/logout", "/username", "/password", "/browser-link", "/browser-login"].includes(action),
      404, "账号操作不存在。");
    const input = await readJson(request);
    if (action === "/logout") {
      if (session) endSession.run(session);
      sessionCookie(response, "", 0);
      return json(200, { account: null });
    }
    if (action === "/browser-link") {
      requireValue(getAccount(), 401, "登录已失效，请重新登录。");
      const now = Date.now();
      for (const [key, link] of browserLinks) {
        if (link.expires <= now || link.session === session) browserLinks.delete(key);
      }
      requireValue(browserLinks.size < 128, 429, "打开网页的请求过多，请稍后重试。");
      const code = hex(randomBytes(32));
      browserLinks.set(digest(code), { session, expires: now + 120_000 });
      return json(200, { code });
    }
    if (action === "/browser-login") {
      const key = typeof input.code === "string" && /^[a-f0-9]{64}$/.test(input.code) ? digest(input.code) : "";
      const link = browserLinks.get(key);
      const now = Date.now();
      const account = link?.expires > now && bySession.get(link.session, now);
      requireValue(account, 401, "打开网页的授权已失效，请从软件重新打开。");
      const signedIn = getAccount();
      requireValue(!signedIn || signedIn.id === account.id, 409, "浏览器已登录其他账号。可继续使用当前账号，或先退出再从软件打开。");
      if (!signedIn && input.confirm !== true) return json(200, { username: account.username, confirm: true });
      if (!signedIn) sessionCookie(response, transaction(() => issueSession(account.id)));
      browserLinks.delete(key);
      return json(200, { account: publicAccount(account) });
    }
    limitAttempts(request.socket.remoteAddress);
    if (action === "/register") {
      const username = usernameOf(input.username);
      const key = username.toLowerCase();
      const password = passwordOf(input.password, 15);
      requireValue(!byName.get(key), 409, "这个账号名已被使用。");
      const id = hex(randomBytes(16));
      const salt = randomBytes(16);
      const hash = await hashPassword(password, salt);
      const fresh = transaction(() => {
        requireValue(insertAccount.run(id, username, key, hex(salt), hex(hash)).changes, 409, "这个账号名已被使用。");
        if (session) endSession.run(session);
        return issueSession(id);
      });
      sessionCookie(response, fresh);
      return json(201, { account: { id, username } });
    }
    if (action === "/login") {
      const username = usernameOf(input.username);
      const password = passwordOf(input.password, 1);
      const account = byName.get(username.toLowerCase());
      requireValue(await matchesPassword(account, password), 401, invalidCredentials);
      const fresh = transaction(() => {
        const current = byId.get(account.id);
        requireValue(current?.password_hash === account.password_hash && current.username_key === account.username_key,
          401, invalidCredentials);
        if (session) endSession.run(session);
        return issueSession(account.id);
      });
      sessionCookie(response, fresh);
      return json(200, { account: publicAccount(account) });
    }

    const account = requireValue(getAccount(), 401, "登录已失效，请重新登录。");
    const password = passwordOf(input.password, 1);
    requireValue(await matchesPassword(account, password), 403, "当前密码不正确。");
    function requireSameSession() {
      const current = getAccount();
      return requireValue(current?.password_hash === account.password_hash && current, 401, "登录状态已变化，请重新登录。");
    }
    if (action === "/username") {
      const username = usernameOf(input.username);
      transaction(() => {
        requireSameSession();
        requireValue(updateName.run(username, username.toLowerCase(), account.id).changes, 409, "这个账号名已被使用。");
      });
      return json(200, { account: { id: account.id, username } });
    }
    const newPassword = passwordOf(input.newPassword, 15);
    const salt = randomBytes(16);
    const hash = await hashPassword(newPassword, salt);
    const { fresh, current } = transaction(() => {
      const current = requireSameSession();
      updatePassword.run(hex(salt), hex(hash), account.id);
      endAccountSessions.run(account.id);
      return { fresh: issueSession(account.id), current };
    });
    sessionCookie(response, fresh);
    return json(200, { account: publicAccount(current) });
  }
  return { handle, current };
}
