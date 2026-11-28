import { ArrowLeft, UserRound } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import "./rooms.css";

type Account = { id: string; username: string };
type AccountAction = "/login" | "/register" | "/logout" | "/username" | "/password";
type BrowserLogin = { username: string; confirm: true } | { account: Account };
const accountEndpoint = "/api/account";

class AccountRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function accountRequest<T = { account: Account | null }>(action = "", input?: object, signal?: AbortSignal): Promise<T> {
  const response = await fetch(accountEndpoint + action, {
    method: input ? "POST" : "GET",
    ...(input ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(input) } : {}),
    signal,
  });
  if (!response.headers.get("Content-Type")?.startsWith("application/json")) {
    throw new Error("请从自建互传站点打开账号页。");
  }
  const body = await response.json();
  if (!response.ok) throw new AccountRequestError(response.status, typeof body === "string" ? body : "账号操作未完成，请重试。");
  return body as T;
}

const browserCode = location.pathname === "/account" && /^#open=([a-f0-9]{64})$/.exec(location.hash)?.[1];
if (browserCode) history.replaceState(null, "", location.pathname + location.search);
let browserLogin: Promise<BrowserLogin> | undefined;

export function StationAccount() {
  const [account, setAccount] = useState<Account | null>();
  const [register, setRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [message, setMessage] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [browserName, setBrowserName] = useState("");
  const room = new URLSearchParams(location.search).get("room") ?? "";
  const returnToRoom = /^[a-f0-9]{32}$/i.test(room) ? `/rooms?code=${room.toLowerCase()}` : "/rooms";
  useEffect(() => {
    document.documentElement.dataset.theme ??= "light";
    const controller = new AbortController();
    setProblem("");
    async function load() {
      if (browserCode && loadAttempt === 0) {
        try {
          browserLogin ??= accountRequest<BrowserLogin>("/browser-login", { code: browserCode });
          const result = await browserLogin;
          if (controller.signal.aborted) return;
          if ("confirm" in result) setBrowserName(result.username);
          else location.replace(returnToRoom);
          return;
        } catch (error) {
          if (controller.signal.aborted) return;
          setProblem(error instanceof Error ? error.message : "打开网页的授权不可用。");
        }
      }
      try {
        const result = await accountRequest("", undefined, controller.signal);
        if (!controller.signal.aborted) setAccount(result.account);
      } catch (error) {
        if (!controller.signal.aborted) setProblem(error instanceof TypeError ? "站点暂时无法连接。" : (error as Error).message);
      }
    }
    void load();
    return () => controller.abort();
  }, [loadAttempt, returnToRoom]);

  async function finishBrowserLogin() {
    setBusy(true);
    setProblem("");
    try {
      await accountRequest<BrowserLogin>("/browser-login", { code: browserCode, confirm: true });
      location.replace(returnToRoom);
    } catch (error) {
      setBusy(false);
      setProblem(error instanceof Error ? error.message : "登录未完成，请从软件重新打开。");
    }
  }

  async function perform(action: AccountAction, data: Record<string, string>, success: string) {
    setBusy(true);
    setProblem("");
    setMessage("");
    try {
      setAccount((await accountRequest(action, data)).account);
      setMessage(success);
      return true;
    } catch (error) {
      if (account && error instanceof AccountRequestError && error.status === 401) {
        setAccount(null);
        setRegister(false);
      }
      setProblem(error instanceof TypeError ? "站点暂时无法连接，请重试。"
        : error instanceof Error ? error.message : "账号操作未完成，请重试。");
      return false;
    } finally { setBusy(false); }
  }

  async function submit(event: FormEvent<HTMLFormElement>, action: AccountAction, success: string) {
    event.preventDefault();
    const form = event.currentTarget;
    const input = Object.fromEntries([...new FormData(form)].map(([key, value]) => [key, String(value)]));
    if (input.repeat !== undefined && input.repeat !== (input.newPassword ?? input.password)) {
      setProblem("两次输入的密码不一致。");
      setMessage("");
      return;
    }
    delete input.repeat;
    if (await perform(action, input, success)) form.reset();
  }

  function switchEntry(toRegister: boolean) {
    setRegister(toRegister);
    setProblem("");
    setMessage("");
  }

  return <main className="room-page account-page">
    <header className="room-header">
      <strong><UserRound size={20} aria-hidden /> 柠猫文件工作站</strong>
      <a className="room-nav-link" href={returnToRoom}><ArrowLeft size={16} aria-hidden /> 返回互传区</a>
    </header>
    <h1>{browserName ? "使用桌面账号" : account ? "账号设置" : "站点账号"}</h1>
    {problem && <p className="room-feedback" role="alert">{problem}</p>}
    {message && <p className="room-feedback" role="status">{message}</p>}
    {browserName ? <section className="room-card account-summary">
      <strong>{browserName}</strong>
      <button type="button" className="room-primary" disabled={busy} onClick={() => void finishBrowserLogin()}>继续使用桌面账号</button>
    </section> : account === undefined ? problem
      ? <button type="button" onClick={() => setLoadAttempt(attempt => attempt + 1)}>重新检查</button>
      : <p className="room-note" role="status">正在确认登录状态…</p> : !account ?
      <section className="room-card">
        <div className="room-entry-tabs" role="group" aria-label="账号入口">
          <button type="button" disabled={busy} aria-pressed={!register} onClick={() => switchEntry(false)}>登录账号</button>
          <button type="button" disabled={busy} aria-pressed={register} onClick={() => switchEntry(true)}>注册新账号</button>
        </div>
        <form key={String(register)} onSubmit={event => void submit(event, register ? "/register" : "/login", register ? "账号已创建。" : "已登录。")}>
          <fieldset disabled={busy}>
            <label>账号名<input name="username" autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required /></label>
            <label>密码<input name="password" type="password" autoComplete={register ? "new-password" : "current-password"} maxLength={256} required /></label>
            {register && <label>再输入一次密码<input name="repeat" type="password" autoComplete="new-password" maxLength={256} required /></label>}
            {register && <p className="room-note">账号名用 2 到 32 个字母、数字、下划线或连字符。密码须为 15 到 128 个字符。</p>}
            <button type="submit" className="room-primary">{register ? "创建账号" : "登录"}</button>
          </fieldset>
        </form>
      </section> : <>
        <section className="room-card account-summary" aria-label="当前账号">
          <div><p className="room-note">当前登录</p><strong>{account.username}</strong></div>
          <a className="room-nav-link" href="/social">好友与文件群</a>
          <button type="button" disabled={busy} onClick={() => {
            setRegister(false);
            void perform("/logout", {}, "已退出登录。");
          }}>退出登录</button>
        </section>
        <section className="room-card" aria-labelledby="account-name-heading">
          <h2 id="account-name-heading">修改账号名</h2>
          <form key={account.username} onSubmit={event => void submit(event, "/username", "账号名已更新。")}>
            <fieldset disabled={busy}>
              <label>新账号名<input name="username" defaultValue={account.username} autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={64} required /></label>
              <label>当前密码<input name="password" type="password" autoComplete="current-password" maxLength={256} required /></label>
              <button type="submit">保存账号名</button>
            </fieldset>
          </form>
        </section>
        <section className="room-card" aria-labelledby="account-password-heading">
          <h2 id="account-password-heading">修改密码</h2>
          <form onSubmit={event => void submit(event, "/password", "密码已更新，其他会话已退出。")}>
            <fieldset disabled={busy}>
              <label>当前密码<input name="password" type="password" autoComplete="current-password" maxLength={256} required /></label>
              <label>新密码<input name="newPassword" type="password" autoComplete="new-password" maxLength={256} required /></label>
              <label>再输入一次新密码<input name="repeat" type="password" autoComplete="new-password" maxLength={256} required /></label>
              <p className="room-note">新密码须为 15 到 128 个字符。</p>
              <button type="submit">保存新密码</button>
            </fieldset>
          </form>
        </section>
      </>}
  </main>;
}
