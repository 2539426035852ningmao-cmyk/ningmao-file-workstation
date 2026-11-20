import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const data = join(root, "test-data");
await mkdir(data, { recursive: true });
const log = message => appendFile(join(data, "launch.log"), `${new Date().toISOString()} ${message}\n`);
const origin = "http://127.0.0.1:5186";
let station, desktop;

try {
  const executable = join(root, "app", "Ningmao-Preview-0.1.0-x64.exe");
  const desktopData = join(data, "desktop");
  const webview = join(data, "webview");
  const profile = join(data, "browser");
  const downloads = join(root, "网页收件");
  for (const dir of [desktopData, webview, join(profile, "Default"), downloads, join(root, "桌面收件")]) {
    await mkdir(dir, { recursive: true });
  }
  await access(executable);
  await writeFile(join(profile, "Default", "Preferences"), JSON.stringify({
    download: { default_directory: downloads, prompt_for_download: false },
  }), { flag: "wx" }).catch(error => {
    if (error.code !== "EEXIST") throw error;
  });

  const { createRoomServer } = await import("./web/selfhost/server.mjs");
  station = createRoomServer(join(data, "station"), undefined, 512 * 1024 * 1024);
  station.listen(5186, "127.0.0.1");
  await once(station, "listening");
  await log("Station listening at " + origin + "/rooms");

  desktop = spawn(executable, [], {
    cwd: join(root, "app"), windowsHide: true, stdio: "ignore",
    env: { ...process.env, NINGMAO_DATA_DIR: desktopData, WEBVIEW2_USER_DATA_FOLDER: webview },
  });
  const exit = once(desktop, "exit");
  void exit.catch(() => undefined);
  await once(desktop, "spawn");

  const browser = join(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe");
  await access(browser);
  const web = spawn(browser, [
    `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions",
    "--disable-sync", "--disable-background-networking", "--new-window", origin + "/rooms",
  ], { stdio: "ignore", detached: true, windowsHide: true });
  await once(web, "spawn");
  web.unref();
  await log("Desktop and isolated Edge profile started.");
  const [code] = await exit;
  if (code !== 0) throw new Error("Desktop exited with code " + code);
} catch (error) {
  await log(error.code === "EADDRINUSE" ? "Port 5186 is in use. Check whether the transfer preview is already open." : String(error));
  process.exitCode = 1;
} finally {
  if (desktop && desktop.exitCode === null && desktop.pid) desktop.kill();
  if (station) {
    station.closeAllConnections();
    await new Promise(resolve => station.close(resolve));
  }
}
