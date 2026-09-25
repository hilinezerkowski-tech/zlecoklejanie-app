// Jednorazowe pobranie GMAIL_REFRESH_TOKEN dla skrzynki portalu.
//
// Użycie (PowerShell, w katalogu repo, po `npm install`):
//   $env:GMAIL_CLIENT_ID = "..."; $env:GMAIL_CLIENT_SECRET = "..."
//   node scripts/gmail-auth.mjs
// Otwórz wydrukowany link w przeglądarce zalogowanej na zlecoklejaniepl@gmail.com,
// zaakceptuj zgodę — token pojawi się w terminalu. Wklej go do Vercela jako
// GMAIL_REFRESH_TOKEN (Preview + Production). Nic nie jest zapisywane na dysku.
//
// Klient OAuth w Google Cloud musi być typu "Desktop app" (loopback redirect).
//
// Bez przepisywania sekretów: w Google Cloud (Credentials → klient OAuth)
// kliknij "Download JSON" — plik client_secret_*.json wyląduje w Pobranych,
// a skrypt sam go znajdzie:
//   node scripts/gmail-auth.mjs
// Albo wskaż plik ręcznie:  node scripts/gmail-auth.mjs --json "C:\sciezka\client_secret.json"

import http from "node:http";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { auth } from "@googleapis/gmail";

function fromJsonFile(path) {
  const parsed = JSON.parse(readFileSync(path, "utf8"));
  const c = parsed.installed ?? parsed.web ?? parsed;
  if (!c.client_id || !c.client_secret) throw new Error(`Plik ${path} nie wygląda na JSON klienta OAuth z Google Cloud.`);
  console.log(`Dane klienta wzięte z pliku: ${path}`);
  return { clientId: c.client_id, clientSecret: c.client_secret };
}

function newestClientSecretInDownloads() {
  const dir = join(process.env.USERPROFILE ?? process.env.HOME ?? "", "Downloads");
  try {
    const files = readdirSync(dir)
      .filter((f) => /^client_secret.*\.json$/i.test(f))
      .map((f) => join(dir, f))
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);
    return files[0] ?? null;
  } catch {
    return null;
  }
}

function resolveCredentials() {
  const argIdx = process.argv.indexOf("--json");
  if (argIdx !== -1 && process.argv[argIdx + 1]) return fromJsonFile(process.argv[argIdx + 1]);
  if (process.env.GMAIL_CLIENT_ID && process.env.GMAIL_CLIENT_SECRET) {
    return { clientId: process.env.GMAIL_CLIENT_ID, clientSecret: process.env.GMAIL_CLIENT_SECRET };
  }
  const found = newestClientSecretInDownloads();
  if (found) return fromJsonFile(found);
  console.error(
    "Nie znalazłem danych klienta OAuth. Pobierz JSON z Google Cloud (Credentials → klient OAuth → Download JSON)\n" +
      "do folderu Pobrane i uruchom ponownie, albo podaj ścieżkę: node scripts/gmail-auth.mjs --json \"C:\\...\\client_secret.json\""
  );
  process.exit(1);
}

const { clientId, clientSecret } = resolveCredentials();
if (/^(TU_WKLEJ|123456-abc)/.test(clientId) || /^GOCSPX-\.\.\./.test(clientSecret)) {
  console.error("To są wartości przykładowe, nie Twoje. Pobierz JSON z Google Cloud albo wpisz prawdziwe dane.");
  process.exit(1);
}

const portIdx = process.argv.indexOf("--port");
const PORT = portIdx !== -1 ? Number(process.argv[portIdx + 1]) || 53682 : 53682;
const REDIRECT = `http://localhost:${PORT}/oauth2callback`;
// gmail.modify = czytanie, etykiety, oznaczanie jako przeczytane i wysyłka
// (Faza 3 czyta, Faza 5 odpowiada i etykietuje) — jedna zgoda zamiast dwóch.
const SCOPES = ["https://www.googleapis.com/auth/gmail.modify"];

const client = new auth.OAuth2(clientId, clientSecret, REDIRECT);
const url = client.generateAuthUrl({ access_type: "offline", prompt: "consent", scope: SCOPES });

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url ?? "/", REDIRECT);
  if (u.pathname !== "/oauth2callback") {
    res.writeHead(404).end();
    return;
  }
  const code = u.searchParams.get("code");
  const err = u.searchParams.get("error");
  if (!code) {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" }).end(`Błąd: ${err ?? "brak kodu"}`);
    console.error("Google zwrócił błąd:", err ?? "brak kodu");
    server.close();
    process.exit(1);
  }
  try {
    const { tokens } = await client.getToken(code);
    if (!tokens.refresh_token) {
      throw new Error("Brak refresh_token w odpowiedzi — cofnij dostęp aplikacji na https://myaccount.google.com/permissions i uruchom ponownie.");
    }
    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" }).end("Gotowe — wróć do terminala. Tę kartę możesz zamknąć.");
    console.log("\nGMAIL_REFRESH_TOKEN (wklej do Vercela, Preview + Production):\n");
    console.log(tokens.refresh_token);
    console.log("");
  } catch (e) {
    res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" }).end("Błąd wymiany kodu — sprawdź terminal.");
    console.error("Wymiana kodu na token nie powiodła się:", e instanceof Error ? e.message : e);
  } finally {
    server.close();
  }
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") {
    console.error(
      `Port ${PORT} jest zajęty — najpewniej poprzednia instancja tego skryptu wciąż czeka w innym oknie terminala.\n` +
        "Zamknij ją (Ctrl+C) i uruchom ponownie, albo dodaj --port 53690."
    );
  } else {
    console.error("Nie udało się uruchomić serwera:", e.message);
  }
  process.exit(1);
});

server.listen(PORT, () => {
  console.log("Otwórz ten link w przeglądarce zalogowanej na zlecoklejaniepl@gmail.com:\n");
  console.log(url);
  console.log(`\nCzekam na powrót z Google na ${REDIRECT} ...`);
});
