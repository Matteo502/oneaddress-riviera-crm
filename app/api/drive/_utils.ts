const GOOGLE_TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";

function requireEnv(name: string) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Variable Vercel manquante : ${name}`);
  }

  return value;
}

export function getDriveDocumentsRootFolderId() {
  return requireEnv("GOOGLE_DRIVE_DOCUMENTS_FOLDER_ID");
}

export async function getGoogleAccessToken() {
  const clientId = requireEnv("GOOGLE_CLIENT_ID");
  const clientSecret = requireEnv("GOOGLE_CLIENT_SECRET");
  const refreshToken = requireEnv("GOOGLE_REFRESH_TOKEN");

  const response = await fetch(GOOGLE_TOKEN_ENDPOINT, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded"
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token"
    })
  });

  const payload = await response.json().catch(() => ({}));

  if (!response.ok || !payload.access_token) {
    throw new Error(payload.error_description || payload.error || "Impossible de récupérer un access token Google Drive.");
  }

  return String(payload.access_token);
}

export function sanitizeDriveName(value: unknown, fallback = "Document CRM") {
  const name = String(value || "").trim();
  return name || fallback;
}

export function jsonError(message: string, status = 500) {
  return Response.json({ ok: false, error: message }, { status });
}
