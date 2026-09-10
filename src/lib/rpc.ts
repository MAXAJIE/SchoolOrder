import { supabase } from "@/integrations/supabase/client";

/**
 * The generated RPC arg types do not model SQL NULL/defaults, so calls that
 * legitimately pass null (optional buyer age, notes, promo code) do not
 * typecheck. This thin wrapper keeps a single, reviewed cast in one place.
 */
type RpcCaller = (
  fn: string,
  args: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message: string } | null }>;

export async function callRpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await (supabase.rpc as unknown as RpcCaller)(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}
