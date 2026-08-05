import { supabase } from "./supabase";

export async function fetchDriveAPI(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data, error } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token || "";

  if (error || !accessToken) {
    throw new Error("Session CRM absente ou expirée.");
  }

  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${accessToken}`);

  return fetch(input, {
    ...init,
    headers
  });
}
