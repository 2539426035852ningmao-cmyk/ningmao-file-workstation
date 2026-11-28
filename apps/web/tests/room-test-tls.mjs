import { execFileSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { isIP } from "node:net";
import { join } from "node:path";

export async function createTestTls(directory, addresses) {
  const ca = join(directory, "root.crt");
  const caKey = join(directory, "root.key");
  const key = join(directory, "station.key");
  const cert = join(directory, "station.crt");
  const request = join(directory, "station.csr");
  const extensions = join(directory, "station.ext");
  const openssl = (...args) => execFileSync(process.env.OPENSSL ?? "openssl", args, { stdio: "pipe" });
  openssl("req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2",
    "-subj", "/CN=Ningmao isolated test CA", "-addext", "basicConstraints=critical,CA:TRUE",
    "-addext", "keyUsage=critical,keyCertSign,cRLSign", "-keyout", caKey, "-out", ca);
  openssl("req", "-new", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=Ningmao test station",
    "-keyout", key, "-out", request);
  await writeFile(extensions, [
    "basicConstraints=critical,CA:FALSE",
    "keyUsage=critical,digitalSignature,keyEncipherment",
    "extendedKeyUsage=serverAuth",
    "subjectAltName=" + addresses.map(address => (isIP(address) ? "IP:" : "DNS:") + address).join(","),
  ].join("\n"));
  openssl("x509", "-req", "-in", request, "-CA", ca, "-CAkey", caKey, "-CAcreateserial",
    "-days", "2", "-extfile", extensions, "-out", cert);
  return { ca, key: await readFile(key), cert: await readFile(cert) };
}
