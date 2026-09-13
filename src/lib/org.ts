import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export type Role = "owner" | "dealer";

export type Membership = {
  organizationId: string;
  role: Role;
  organization: {
    id: string;
    name: string;
    currency: string;
    is_open: boolean;
    owner_id: string;
    public_theme: string;
    button_color: string;
  };
} | null;

/** Resolves the signed-in user's shop and role. One shop per user in the MVP. */
export function useMembership() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ["membership", user?.id],
    enabled: Boolean(user?.id),
    queryFn: async (): Promise<Membership> => {
      const { data: member, error } = await supabase
        .from("organization_members")
        .select("organization_id, role, status")
        .eq("user_id", user!.id)
        .eq("status", "active")
        .order("created_at", { ascending: true })
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!member) return null;

      const { data: org, error: orgErr } = await supabase
        .from("organizations")
        .select("id, name, currency, is_open, owner_id, public_theme, button_color")
        .eq("id", member.organization_id)
        .maybeSingle();
      if (orgErr) throw orgErr;
      if (!org) return null;

      return {
        organizationId: org.id,
        role: member.role as Role,
        organization: org,
      };
    },
  });
}
