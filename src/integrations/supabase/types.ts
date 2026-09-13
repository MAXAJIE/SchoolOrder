export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      dealer_request_items: {
        Row: {
          id: string
          quantity: number
          request_id: string
          variant_id: string
        }
        Insert: {
          id?: string
          quantity: number
          request_id: string
          variant_id: string
        }
        Update: {
          id?: string
          quantity?: number
          request_id?: string
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_request_items_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "dealer_requests"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dealer_request_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      dealer_requests: {
        Row: {
          affects_inventory: boolean
          created_at: string
          dealer_id: string
          id: string
          note: string | null
          organization_id: string
          status: Database["public"]["Enums"]["request_status"]
          updated_at: string
        }
        Insert: {
          affects_inventory?: boolean
          created_at?: string
          dealer_id: string
          id?: string
          note?: string | null
          organization_id: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Update: {
          affects_inventory?: boolean
          created_at?: string
          dealer_id?: string
          id?: string
          note?: string | null
          organization_id?: string
          status?: Database["public"]["Enums"]["request_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dealer_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      inventory_movements: {
        Row: {
          created_at: string
          created_by: string | null
          delta: number
          id: string
          note: string | null
          organization_id: string
          product_id: string | null
          reason: Database["public"]["Enums"]["movement_reason"]
          variant_id: string | null
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          delta: number
          id?: string
          note?: string | null
          organization_id: string
          product_id?: string | null
          reason: Database["public"]["Enums"]["movement_reason"]
          variant_id?: string | null
        }
        Update: {
          created_at?: string
          created_by?: string | null
          delta?: number
          id?: string
          note?: string | null
          organization_id?: string
          product_id?: string | null
          reason?: Database["public"]["Enums"]["movement_reason"]
          variant_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "inventory_movements_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "inventory_movements_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      order_items: {
        Row: {
          options: Json | null
          product_id: string | null
          id: string
          line_total: number
          order_id: string
          organization_id: string
          product_name: string
          quantity: number
          unit_cost: number
          unit_price: number
          variant_id: string | null
          variant_name: string
        }
        Insert: {
          options?: Json | null
          product_id?: string | null
          id?: string
          line_total: number
          order_id: string
          organization_id: string
          product_name: string
          quantity: number
          unit_cost?: number
          unit_price: number
          variant_id?: string | null
          variant_name: string
        }
        Update: {
          options?: Json | null
          product_id?: string | null
          id?: string
          line_total?: number
          order_id?: string
          organization_id?: string
          product_name?: string
          quantity?: number
          unit_cost?: number
          unit_price?: number
          variant_id?: string | null
          variant_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "order_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          access_token: string
          buyer_age: number | null
          buyer_class: string | null
          buyer_name: string
          cost_total: number
          created_at: string
          discount: number
          id: string
          note: string | null
          order_number: string
          organization_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_proof_path: string | null
          payment_status: Database["public"]["Enums"]["payment_status"]
          pickup_code: string
          promo_code: string | null
          promo_code_id: string | null
          status: Database["public"]["Enums"]["order_status"]
          subtotal: number
          total: number
          updated_at: string
        }
        Insert: {
          access_token: string
          buyer_age?: number | null
          buyer_class?: string | null
          buyer_name: string
          cost_total?: number
          created_at?: string
          discount?: number
          id?: string
          note?: string | null
          order_number: string
          organization_id: string
          payment_method: Database["public"]["Enums"]["payment_method"]
          payment_proof_path?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pickup_code: string
          promo_code?: string | null
          promo_code_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Update: {
          access_token?: string
          buyer_age?: number | null
          buyer_class?: string | null
          buyer_name?: string
          cost_total?: number
          created_at?: string
          discount?: number
          id?: string
          note?: string | null
          order_number?: string
          organization_id?: string
          payment_method?: Database["public"]["Enums"]["payment_method"]
          payment_proof_path?: string | null
          payment_status?: Database["public"]["Enums"]["payment_status"]
          pickup_code?: string
          promo_code?: string | null
          promo_code_id?: string | null
          status?: Database["public"]["Enums"]["order_status"]
          subtotal?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "orders_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "orders_promo_code_id_fkey"
            columns: ["promo_code_id"]
            isOneToOne: false
            referencedRelation: "promo_codes"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_members: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id?: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          status?: Database["public"]["Enums"]["member_status"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          button_color: string
          public_theme: string
          created_at: string
          currency: string
          id: string
          is_open: boolean
          name: string
          owner_id: string
        }
        Insert: {
          button_color?: string
          public_theme?: string
          created_at?: string
          currency?: string
          id?: string
          is_open?: boolean
          name: string
          owner_id: string
        }
        Update: {
          button_color?: string
          public_theme?: string
          created_at?: string
          currency?: string
          id?: string
          is_open?: boolean
          name?: string
          owner_id?: string
        }
        Relationships: []
      }
      payment_qr: {
        Row: {
          created_at: string
          id: string
          image_url: string
          is_active: boolean
          label: string | null
          organization_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url: string
          is_active?: boolean
          label?: string | null
          organization_id: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string
          is_active?: boolean
          label?: string | null
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_qr_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_variants: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          is_active: boolean
          name: string
          organization_id: string
          price: number
          product_id: string
          sort_order: number
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id: string
          price: number
          product_id: string
          sort_order?: number
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string
          price?: number
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_variants_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_variants_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      product_options: {
        Row: {
          created_at: string
          id: string
          is_required: boolean
          max_select: number
          name: string
          organization_id: string
          product_id: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          id?: string
          is_required?: boolean
          max_select?: number
          name: string
          organization_id: string
          product_id: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          id?: string
          is_required?: boolean
          max_select?: number
          name?: string
          organization_id?: string
          product_id?: string
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_options_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_options_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      product_option_values: {
        Row: {
          cost_delta: number
          created_at: string
          id: string
          label: string
          option_id: string
          organization_id: string
          price_delta: number
          sort_order: number
        }
        Insert: {
          cost_delta?: number
          created_at?: string
          id?: string
          label: string
          option_id: string
          organization_id: string
          price_delta?: number
          sort_order?: number
        }
        Update: {
          cost_delta?: number
          created_at?: string
          id?: string
          label?: string
          option_id?: string
          organization_id?: string
          price_delta?: number
          sort_order?: number
        }
        Relationships: [
          {
            foreignKeyName: "product_option_values_option_id_fkey"
            columns: ["option_id"]
            isOneToOne: false
            referencedRelation: "product_options"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "product_option_values_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          base_price: number
          cost_price: number
          created_at: string
          description: string | null
          id: string
          image_url: string | null
          is_active: boolean
          name: string
          organization_id: string
          sort_order: number
          stock: number
          updated_at: string
        }
        Insert: {
          base_price?: number
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name: string
          organization_id: string
          sort_order?: number
          stock?: number
          updated_at?: string
        }
        Update: {
          base_price?: number
          cost_price?: number
          created_at?: string
          description?: string | null
          id?: string
          image_url?: string | null
          is_active?: boolean
          name?: string
          organization_id?: string
          sort_order?: number
          stock?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          display_name: string | null
          id: string
        }
        Insert: {
          created_at?: string
          display_name?: string | null
          id: string
        }
        Update: {
          created_at?: string
          display_name?: string | null
          id?: string
        }
        Relationships: []
      }
      promo_codes: {
        Row: {
          code: string
          created_at: string
          ends_at: string | null
          id: string
          is_active: boolean
          max_discount: number | null
          minimum_order_amount: number
          organization_id: string
          product_id: string | null
          starts_at: string | null
          type: Database["public"]["Enums"]["promo_type"]
          usage_limit: number | null
          used_count: number
          value: number
        }
        Insert: {
          code: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          minimum_order_amount?: number
          organization_id: string
          product_id?: string | null
          starts_at?: string | null
          type: Database["public"]["Enums"]["promo_type"]
          usage_limit?: number | null
          used_count?: number
          value: number
        }
        Update: {
          code?: string
          created_at?: string
          ends_at?: string | null
          id?: string
          is_active?: boolean
          max_discount?: number | null
          minimum_order_amount?: number
          organization_id?: string
          product_id?: string | null
          starts_at?: string | null
          type?: Database["public"]["Enums"]["promo_type"]
          usage_limit?: number | null
          used_count?: number
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "promo_codes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "promo_codes_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      quote_items: {
        Row: {
          id: string
          quantity: number
          quote_id: string
          unit_price: number
          variant_id: string
        }
        Insert: {
          id?: string
          quantity: number
          quote_id: string
          unit_price: number
          variant_id: string
        }
        Update: {
          id?: string
          quantity?: number
          quote_id?: string
          unit_price?: number
          variant_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "quote_items_quote_id_fkey"
            columns: ["quote_id"]
            isOneToOne: false
            referencedRelation: "quotes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quote_items_variant_id_fkey"
            columns: ["variant_id"]
            isOneToOne: false
            referencedRelation: "product_variants"
            referencedColumns: ["id"]
          },
        ]
      }
      quotes: {
        Row: {
          created_at: string
          created_by: string
          dealer_id: string
          id: string
          note: string | null
          organization_id: string
          request_id: string
          status: Database["public"]["Enums"]["quote_status"]
          total: number
          version: number
        }
        Insert: {
          created_at?: string
          created_by: string
          dealer_id: string
          id?: string
          note?: string | null
          organization_id: string
          request_id: string
          status?: Database["public"]["Enums"]["quote_status"]
          total?: number
          version?: number
        }
        Update: {
          created_at?: string
          created_by?: string
          dealer_id?: string
          id?: string
          note?: string | null
          organization_id?: string
          request_id?: string
          status?: Database["public"]["Enums"]["quote_status"]
          total?: number
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "quotes_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "quotes_request_id_fkey"
            columns: ["request_id"]
            isOneToOne: false
            referencedRelation: "dealer_requests"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      update_shop_appearance: {
        Args: { p_button_color: string; p_org: string; p_theme: string }
        Returns: undefined
      }
      adjust_stock: {
        Args: {
          p_delta: number
          p_note?: string
          p_product: string
          p_reason: Database["public"]["Enums"]["movement_reason"]
        }
        Returns: Json
      }
      attach_payment_proof: {
        Args: { p_path: string; p_token: string }
        Returns: Json
      }
      cancel_order: { Args: { p_order: string }; Returns: Json }
      create_public_order: {
        Args: {
          p_buyer_age: number
          p_buyer_class: string
          p_buyer_name: string
          p_items: Json
          p_org: string
          p_payment_method: Database["public"]["Enums"]["payment_method"]
          p_promo_code?: string
        }
        Returns: Json
      }
      gen_code: { Args: { _len: number }; Returns: string }
      get_order_by_token: { Args: { p_token: string }; Returns: Json }
      has_org_role: {
        Args: { _org: string; _role: Database["public"]["Enums"]["app_role"] }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string }; Returns: boolean }
    }
    Enums: {
      app_role: "owner" | "dealer"
      member_status: "active" | "disabled"
      movement_reason:
        | "purchase"
        | "manual_adjustment"
        | "order_deduct"
        | "order_cancel"
        | "dealer_reservation"
        | "dealer_release"
        | "return"
      order_status: "pending" | "confirmed" | "completed" | "cancelled"
      payment_method: "cash" | "duitnow"
      payment_status: "pending_payment" | "proof_uploaded" | "paid" | "rejected"
      promo_type:
        | "fixed_amount_off"
        | "percentage_off"
        | "second_item_percentage_off"
      quote_status:
        | "pending_owner"
        | "countered"
        | "accepted"
        | "rejected"
        | "cancelled"
      request_status:
        | "draft"
        | "submitted"
        | "quoted"
        | "approved"
        | "rejected"
        | "cancelled"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "dealer"],
      member_status: ["active", "disabled"],
      movement_reason: [
        "purchase",
        "manual_adjustment",
        "order_deduct",
        "order_cancel",
        "dealer_reservation",
        "dealer_release",
        "return",
      ],
      order_status: ["pending", "confirmed", "completed", "cancelled"],
      payment_method: ["cash", "duitnow"],
      payment_status: ["pending_payment", "proof_uploaded", "paid", "rejected"],
      promo_type: [
        "fixed_amount_off",
        "percentage_off",
        "second_item_percentage_off",
      ],
      quote_status: [
        "pending_owner",
        "countered",
        "accepted",
        "rejected",
        "cancelled",
      ],
      request_status: [
        "draft",
        "submitted",
        "quoted",
        "approved",
        "rejected",
        "cancelled",
      ],
    },
  },
} as const
