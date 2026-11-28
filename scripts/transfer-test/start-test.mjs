import { spawn } from "node:child_process";
import { once } from "node:events";
import { access, appendFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL(".", import.meta.url));
const data = join(root, "test-data");
await mkdir(data, { recursive: true });
const log = message => appendFile(join(data, "launch.log"), `${new Date().toISOString()} ${message}\n`);
let origin = "http://127.0.0.1:5186";
let station, desktop;
const desktopOnly = process.argv.includes("--desktop-only");
const stationOnly = process.argv.includes("--station-only");

async function startStation() {
  const portFile = join(data, "account-station-port.txt");
  const savedPort = stationOnly ? await readFile(portFile, "utf8").then(Number).catch(error => {
    if (error.code !== "ENOENT") throw error;
  }) : undefined;
  if (savedPort !== undefined && (!Number.isInteger(savedPort) || savedPort < 1024 || savedPort > 65535)) {
    throw new Error("The saved account station address is invalid.");
  }
  const { createRoomServer } = await import("./web/selfhost/server.mjs");
  station = createRoomServer(join(data, "station"), undefined, 512 * 1024 * 1024);
  async function listen(port) {
    station.listen(port, "127.0.0.1");
    await once(station, "listening");
  }
  try {
    await listen(savedPort ?? 5186);
  } catch (error) {
    if (!stationOnly || savedPort !== undefined || error.code !== "EADDRINUSE") throw error;
    await listen(0);
  }
  const port = station.address().port;
  if (stationOnly && savedPort === undefined) await writeFile(portFile, String(port), { flag: "wx" });
  origin = `http://127.0.0.1:${port}`;
  await log("Station listening at " + origin + "/rooms");
}

async function runDesktop() {
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

  if (!desktopOnly) await startStation();

  desktop = spawn(executable, [], {
    cwd: join(root, "app"), windowsHide: true, stdio: "ignore",
    env: { ...process.env, NINGMAO_DATA_DIR: desktopData, WEBVIEW2_USER_DATA_FOLDER: webview },
  });
  const exit = once(desktop, "exit");
  void exit.catch(() => undefined);
  await once(desktop, "spawn");

  if (desktopOnly) {
    await log("Desktop started. Start the room station manually in the app.");
  } else {
    const browser = join(process.env["ProgramFiles(x86)"] ?? "C:/Program Files (x86)", "Microsoft/Edge/Application/msedge.exe");
    await access(browser);
    const web = spawn(browser, [
      `--user-data-dir=${profile}`, "--no-first-run", "--no-default-browser-check", "--disable-extensions",
      "--disable-sync", "--disable-background-networking", "--new-window", origin + "/rooms",
    ], { stdio: "ignore", detached: true, windowsHide: true });
    await once(web, "spawn");
    web.unref();
    await log("Desktop and isolated Edge profile started.");
  }
  const [code] = await exit;
  if (code !== 0) throw new Error("Desktop exited with code " + code);
}

try {
  if (stationOnly) {
    await startStation();
    console.log("Open " + origin + " in your browser. Press Ctrl+C to stop the test station.");
    await new Promise(resolve => process.once("SIGINT", resolve));
  } else await runDesktop();
} catch (error) {
  await log(error.code === "EADDRINUSE" ? `Port ${error.port} is in use. Check whether the transfer preview is already open.` : String(error));
  process.exitCode = 1;
} finally {
  if (desktop && desktop.exitCode === null && desktop.pid) desktop.kill();
  if (station) {
    station.closeAllConnections();
    await new Promise(resolve => station.close(resolve));
  }
}
