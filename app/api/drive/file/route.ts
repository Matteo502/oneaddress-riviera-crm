import { getGoogleAccessToken, jsonError } from "../_utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeFileName(value: string) {
  return value.replace(/[\r\n"]/g, "").trim() || "document";
}

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const fileId = url.searchParams.get("fileId");
    const download = url.searchParams.get("download") === "1";

    if (!fileId) {
      return jsonError("fileId manquant.", 400);
    }

    const accessToken = await getGoogleAccessToken();
    const metadataResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?supportsAllDrives=true&fields=id,name,mimeType,size`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });

    const metadata = await metadataResponse.json().catch(() => ({}));

    if (!metadataResponse.ok) {
      return jsonError(metadata.error?.message || "Fichier Drive introuvable.", metadataResponse.status);
    }

    const mediaResponse = await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`, {
      headers: { authorization: `Bearer ${accessToken}` }
    });

    if (!mediaResponse.ok || !mediaResponse.body) {
      const payload = await mediaResponse.json().catch(() => ({}));
      return jsonError(payload.error?.message || "Lecture du fichier Drive impossible.", mediaResponse.status);
    }

    const headers = new Headers();
    headers.set("content-type", metadata.mimeType || mediaResponse.headers.get("content-type") || "application/octet-stream");
    headers.set("cache-control", "private, max-age=60");
    headers.set("content-disposition", `${download ? "attachment" : "inline"}; filename="${safeFileName(metadata.name || "document")}"`);

    return new Response(mediaResponse.body, { status: 200, headers });
  } catch (error) {
    return jsonError(error instanceof Error ? error.message : "Erreur serveur Google Drive.");
  }
}
