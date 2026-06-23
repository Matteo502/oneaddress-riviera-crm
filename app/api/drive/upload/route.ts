import { getDriveDocumentsRootFolderId, getGoogleAccessToken, jsonError, sanitizeDriveName } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file");

    if (!(file instanceof File) || file.size <= 0) {
      return jsonError("Aucun fichier reçu.", 400);
    }

    const accessToken = await getGoogleAccessToken();
    const parentDriveFolderId = sanitizeDriveName(form.get("parentDriveFolderId") || getDriveDocumentsRootFolderId(), getDriveDocumentsRootFolderId());
    const requestedName = sanitizeDriveName(form.get("title") || file.name, file.name || "Document CRM");

    const multipart = new FormData();
    multipart.append("metadata", new Blob([JSON.stringify({
      name: requestedName,
      parents: [parentDriveFolderId]
    })], { type: "application/json" }));
    multipart.append("file", file, file.name || requestedName);

    const response = await fetch("https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,mimeType,size,webViewLink,webContentLink,iconLink,createdTime,modifiedTime", {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`
      },
      body: multipart
    });

    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      return jsonError(payload.error?.message || "Upload Google Drive impossible.", response.status);
    }

    return Response.json({ ok: true, file: payload });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Erreur serveur Google Drive.");
  }
}
