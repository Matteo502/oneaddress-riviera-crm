import { getDriveDocumentsRootFolderId, getGoogleAccessToken, jsonError, sanitizeDriveName } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const accessToken = await getGoogleAccessToken();
    const parentDriveFolderId = sanitizeDriveName(body.parentDriveFolderId || getDriveDocumentsRootFolderId(), getDriveDocumentsRootFolderId());
    const name = sanitizeDriveName(body.name, "Nouveau dossier");

    const response = await fetch("https://www.googleapis.com/drive/v3/files?supportsAllDrives=true&fields=id,name,mimeType,webViewLink,createdTime,modifiedTime", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        name,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentDriveFolderId]
      })
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return jsonError(payload.error?.message || "Création du dossier Drive impossible.", response.status);
    }

    return Response.json({ ok: true, folder: payload });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Erreur serveur Google Drive.");
  }
}
