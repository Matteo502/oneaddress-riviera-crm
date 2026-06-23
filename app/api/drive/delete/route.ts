import { getGoogleAccessToken, jsonError } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}));
    const fileId = String(body.fileId || "").trim();

    if (!fileId) {
      return jsonError("fileId manquant.", 400);
    }

    const accessToken = await getGoogleAccessToken();
    const response = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, {
      method: "DELETE",
      headers: { authorization: `Bearer ${accessToken}` }
    });

    if (!response.ok && response.status !== 404) {
      const payload = await response.json().catch(() => ({}));
      return jsonError(payload.error?.message || "Suppression Drive impossible.", response.status);
    }

    return Response.json({ ok: true });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Erreur serveur Google Drive.");
  }
}
