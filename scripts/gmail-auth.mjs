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

import http from "node:http";
import { auth } from "@googleapis/gmail";

const clientId = process.env.GMAIL_CLIENT_ID;
const clientSecret = process.env.GMAIL_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error("Brak GMAIL_CLIENT_ID albo GMAIL_CLIENT_SECRET w zmiennych środowiskowych.");
  process.exit(1);
}

const PORT = 53682;
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

server.listen(PORT, () => {
  console.log("Otwórz ten link w przeglądarce zalogowanej na zlecoklejaniepl@gmail.com:\n");
  console.log(url);
  console.log(`\nCzekam na powrót z Google na ${REDIRECT} ...`);
});
