const retention = 30 * 86_400_000;
export const socialApi = "/api/social";
export const accountMember = account => "account:" + account;
const accountId = value => typeof value === "string" && /^[a-f0-9]{32}$/.test(value);
const pair = (a, b) => [a, b].sort();

export function createSocial(db, { readJson, requireValue, token, sha }) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      a TEXT NOT NULL REFERENCES accounts(id), b TEXT NOT NULL REFERENCES accounts(id),
      requester TEXT NOT NULL, accepted INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (a,b)
    );
    CREATE TABLE IF NOT EXISTS fixed_rooms (
      code TEXT PRIMARY KEY REFERENCES rooms(code) ON DELETE CASCADE,
      title TEXT NOT NULL, direct_key TEXT UNIQUE
    );
    CREATE TABLE IF NOT EXISTS room_messages (
      id INTEGER PRIMARY KEY, room TEXT NOT NULL REFERENCES fixed_rooms(code) ON DELETE CASCADE,
      sender TEXT NOT NULL REFERENCES accounts(id), body TEXT NOT NULL, sent INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS room_messages_room ON room_messages(room,id);
    CREATE TABLE IF NOT EXISTS room_management (
      code TEXT PRIMARY KEY REFERENCES fixed_rooms(code) ON DELETE CASCADE,
      standby TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 0
    );
    CREATE TRIGGER IF NOT EXISTS release_ineligible_room_standby
    AFTER UPDATE OF role, status ON members
    WHEN NEW.role <> 'admin' OR NEW.status <> 'active'
    BEGIN
      DELETE FROM room_management WHERE code=NEW.room AND standby=NEW.id;
    END;
  `);
  const roomInfo = db.prepare("SELECT title, direct_key FROM fixed_rooms WHERE code = ?");
  const member = db.prepare("SELECT status FROM members WHERE room = ? AND session = ?");
  const relation = db.prepare("SELECT requester, accepted FROM friends WHERE a = ? AND b = ?");
  const findAccount = db.prepare("SELECT id,username FROM accounts WHERE username_key = ?");
  const byConversation = db.prepare("SELECT code FROM fixed_rooms WHERE direct_key = ?");
  const messages = db.prepare(`SELECT m.id, m.sender, a.username, m.body, m.sent, COALESCE(v.preset,v.photo_id) AS avatar FROM room_messages m
    JOIN accounts a ON a.id=m.sender
    LEFT JOIN members member ON member.room=m.room AND member.session='account:' || m.sender AND member.status='active'
    LEFT JOIN account_avatars v ON v.account_id=a.id AND member.status='active'
    WHERE m.room=? AND m.sent>? ORDER BY m.id DESC LIMIT 100`);
  const addMessage = db.prepare("INSERT INTO room_messages(room,sender,body,sent) VALUES(?,?,?,?)");
  const pruneMessages = db.prepare("DELETE FROM room_messages WHERE sent<=?");
  const listFriends = db.prepare(`SELECT a.id, a.username, f.requester, f.accepted, COALESCE(v.preset,v.photo_id) AS avatar FROM friends f
    JOIN accounts a ON a.id=CASE WHEN f.a=? THEN f.b ELSE f.a END
    LEFT JOIN account_avatars v ON v.account_id=a.id AND f.accepted=1
    WHERE f.a=? OR f.b=? ORDER BY a.username_key`);
  const listRooms = db.prepare(`SELECT f.code, f.title, f.direct_key FROM fixed_rooms f
    JOIN members m ON m.room=f.code WHERE m.session=? AND m.status='active' ORDER BY f.rowid DESC`);
  const directDisplayName = db.prepare("SELECT username FROM accounts WHERE id = ?");
  const management = db.prepare("SELECT standby,active FROM room_management WHERE code=?");
  const managementMember = db.prepare("SELECT id,role,status FROM members WHERE room=? AND id=?");
  const setStandby = db.prepare("INSERT INTO room_management(code,standby,active) VALUES(?,?,0) ON CONFLICT(code) DO UPDATE SET standby=excluded.standby,active=0");
  const setActive = db.prepare("UPDATE room_management SET active=? WHERE code=?");
  function directAllowed(direct, id) {
    if (!direct) return true;
    const [a, b] = direct.split("/");
    return (a === id || b === id) && relation.get(a, b)?.accepted === 1;
  }
  function title(row, id) {
    if (!row.direct_key) return row.title;
    return directDisplayName.get(row.direct_key.split("/").find(other => other !== id))?.username ?? row.title;
  }
  function requireMember(code, id) {
    const fixed = roomInfo.get(code);
    requireValue(fixed && member.get(code, accountMember(id))?.status === "active" && directAllowed(fixed.direct_key, id),
      403, "你不在这个会话中。");
    return fixed;
  }
  function summary(id) {
    return { friends: listFriends.all(id, id, id), rooms: listRooms.all(accountMember(id))
      .filter(room => directAllowed(room.direct_key, id))
      .map(room => ({ code: room.code, name: title(room, id), direct: Boolean(room.direct_key) })) };
  }
  function createRoom(actor, input) {
    const direct = input.direct === true;
    const ids = input.members;
    requireValue(Array.isArray(ids) && ids.length >= 1 && ids.length <= (direct ? 1 : 4)
      && ids.every(id => accountId(id) && id !== actor.id) && new Set(ids).size === ids.length, 400, "请选择合适的好友。");
    requireValue(ids.every(id => relation.get(...pair(actor.id, id))?.accepted === 1), 403, "请先成为好友。");
    const name = direct ? "私聊" : typeof input.name === "string" ? input.name.trim() : "";
    requireValue(name.length && name.length <= 60 && !/[\u0000-\u001f\u007f]/u.test(name), 400, "请输入 1 到 60 个字符的群名称。");
    const directKey = direct ? pair(actor.id, ids[0]).join("/") : null;
    const existing = directKey && byConversation.get(directKey);
    if (existing) return { code: existing.code };
    requireValue(db.prepare("SELECT COUNT(*) AS count FROM rooms").get().count < 128, 409, "站点的互传区已满。");
    const code = token(16);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("INSERT INTO rooms VALUES(?,?,?,?)").run(code, Date.now(), 1, sha(token()));
      db.prepare("INSERT INTO fixed_rooms VALUES(?,?,?)").run(code, name, directKey);
      const add = db.prepare("INSERT INTO members VALUES(?,?,?,?,?,?)");
      for (const id of [actor.id, ...ids]) add.run(code, accountMember(id), token(12),
        directDisplayName.get(id).username, id === actor.id ? "owner" : "member", "active");
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { code };
  }
  return {
    canViewAvatar(actor, owner) { return relation.get(...pair(actor, owner))?.accepted === 1; },
    roomInfo(code, id) {
      const fixed = roomInfo.get(code);
      return fixed ? { ...fixed, title: id ? title(fixed, id) : null } : null;
    },
    directAllowed,
    management(code) { return management.get(code) ?? { standby: null, active: 0 }; },
    manage(code, actor, input) {
      const fixed = roomInfo.get(code);
      requireValue(fixed && !fixed.direct_key && actor?.status === "active", 403, "仅固定文件群的成员可以管理值守。");
      const current = management.get(code);
      if (input.action === "designate") {
        requireValue(actor.role === "owner" && !current?.active, 403, "请由群主指定，接管期间须先交回。");
        const standby = typeof input.id === "string" && managementMember.get(code, input.id);
        requireValue(standby?.role === "admin" && standby.status === "active", 400, "请选择已加入的管理员。");
        setStandby.run(code, standby.id);
      } else if (input.action === "start") {
        requireValue(current?.standby === actor.id && actor.role === "admin", 403, "请由已指定的管理员继续管理。");
        setActive.run(1, code);
      } else if (input.action === "return") {
        requireValue(current?.active && (actor.role === "owner" || current.standby === actor.id),
          403, "请由群主或值守管理员交回。");
        setActive.run(0, code);
      } else requireValue(false, 400, "未知的值守操作。");
      return { management: management.get(code) };
    },
    purge() { pruneMessages.run(Date.now() - retention); },
    async handle(request, url, json, who) {
      const actor = requireValue(who(), 401, "请先登录账号。");
      const action = url.pathname.slice(socialApi.length);
      if (request.method === "GET" && action === "") return json(200, { me: actor.id, ...summary(actor.id) });
      if (request.method === "GET" && action === "/messages") {
        const code = url.searchParams.get("room");
        requireMember(code, actor.id);
        return json(200, { messages: messages.all(code, Date.now() - retention).reverse() });
      }
      requireValue(request.method === "POST", 404, "操作不存在。");
      const input = await readJson(request);
      requireValue(who()?.id === actor.id, 401, "登录已失效，请重新登录。");
      if (action === "/request") {
        const name = typeof input.username === "string" ? input.username.normalize("NFKC").trim().toLowerCase() : "";
        const friend = requireValue(name.length <= 100 && name && findAccount.get(name), 404, "找不到该账号。");
        requireValue(actor.id !== friend.id, 400, "不能给自己发好友申请。");
        const peers = pair(actor.id, friend.id);
        const prior = relation.get(...peers);
        if (!prior) {
          const count = db.prepare("SELECT COUNT(*) AS count FROM friends WHERE a=? OR b=?");
          requireValue(count.get(actor.id, actor.id).count < 64 && count.get(friend.id, friend.id).count < 64,
            409, "好友或申请数量已满。");
          db.prepare("INSERT INTO friends(a,b,requester) VALUES(?,?,?)").run(...peers, actor.id);
        }
        return json(200, summary(actor.id));
      }
      if (action === "/accept" || action === "/remove") {
        requireValue(accountId(input.id) && input.id !== actor.id, 400, "账号无效。");
        const peers = pair(actor.id, input.id);
        const prior = requireValue(relation.get(...peers), 404, "好友申请不存在。");
        if (action === "/accept") {
          requireValue(prior.requester !== actor.id, 403, "请等对方确认。");
          db.prepare("UPDATE friends SET accepted=1 WHERE a=? AND b=?").run(...peers);
        } else db.prepare("DELETE FROM friends WHERE a=? AND b=?").run(...peers);
        return json(200, summary(actor.id));
      }
      if (action === "/rooms") return json(201, createRoom(actor, input));
      if (action === "/messages") {
        requireValue(accountId(input.room), 400, "群编号无效。");
        requireMember(input.room, actor.id);
        const body = typeof input.text === "string" ? input.text.trim() : "";
        requireValue(body && body.length <= 2000, 400, "请输入 1 到 2000 个字符。");
        const now = Date.now();
        requireValue((db.prepare("SELECT sent FROM room_messages WHERE room=? AND sender=? ORDER BY id DESC LIMIT 1")
          .get(input.room, actor.id)?.sent ?? 0) <= now - 500, 429, "发送太快，请稍后再试。");
        addMessage.run(input.room, actor.id, body, now);
        return json(201, { messages: messages.all(input.room, now - retention).reverse() });
      }
      requireValue(false, 404, "操作不存在。");
    },
  };
}
