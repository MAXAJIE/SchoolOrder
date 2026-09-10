import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export const SHOP_BUCKET = "shop-images";
export const PROOF_BUCKET = "payment-proofs";

/** Buckets are private, so images are read through short-lived signed URLs. */
export async function signedUrl(bucket: string, path: string | null | undefined) {
  if (!path) return null;
  const { data, error } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

export function useSignedUrl(bucket: string, path: string | null | undefined) {
  return useQuery({
    queryKey: ["signed-url", bucket, path],
    queryFn: () => signedUrl(bucket, path),
    enabled: Boolean(path),
    staleTime: 30 * 60 * 1000,
  });
}

export function fileExtension(file: File) {
  const fromName = file.name.includes(".") ? file.name.split(".").pop() : null;
  return (fromName ?? file.type.split("/")[1] ?? "bin").toLowerCase().replace(/[^a-z0-9]/g, "");
}

export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/heic"];
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
