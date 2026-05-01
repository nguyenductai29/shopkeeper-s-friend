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
      app_settings: {
        Row: {
          currency: string
          id: string
          notify_discord_webhook: string | null
          notify_email: string | null
          notify_facebook: string | null
          notify_on_low_stock: boolean
          notify_on_new_order: boolean
          shop_name: string | null
          updated_at: string
        }
        Insert: {
          currency?: string
          id?: string
          notify_discord_webhook?: string | null
          notify_email?: string | null
          notify_facebook?: string | null
          notify_on_low_stock?: boolean
          notify_on_new_order?: boolean
          shop_name?: string | null
          updated_at?: string
        }
        Update: {
          currency?: string
          id?: string
          notify_discord_webhook?: string | null
          notify_email?: string | null
          notify_facebook?: string | null
          notify_on_low_stock?: boolean
          notify_on_new_order?: boolean
          shop_name?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      invoice_templates: {
        Row: {
          created_at: string
          footer_note: string | null
          header_note: string | null
          id: string
          is_default: boolean
          name: string
          shop_address: string | null
          shop_name: string | null
          shop_phone: string | null
        }
        Insert: {
          created_at?: string
          footer_note?: string | null
          header_note?: string | null
          id?: string
          is_default?: boolean
          name: string
          shop_address?: string | null
          shop_name?: string | null
          shop_phone?: string | null
        }
        Update: {
          created_at?: string
          footer_note?: string | null
          header_note?: string | null
          id?: string
          is_default?: boolean
          name?: string
          shop_address?: string | null
          shop_name?: string | null
          shop_phone?: string | null
        }
        Relationships: []
      }
      order_items: {
        Row: {
          cost_price: number
          id: string
          image_url: string | null
          order_id: string
          product_code: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_price: number
          subtotal: number
        }
        Insert: {
          cost_price?: number
          id?: string
          image_url?: string | null
          order_id: string
          product_code: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_price?: number
          subtotal?: number
        }
        Update: {
          cost_price?: number
          id?: string
          image_url?: string | null
          order_id?: string
          product_code?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_price?: number
          subtotal?: number
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
            foreignKeyName: "order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      orders: {
        Row: {
          cost_total: number
          created_at: string
          customer_address: string | null
          customer_name: string | null
          customer_phone: string | null
          id: string
          note: string | null
          paid: boolean
          total: number
        }
        Insert: {
          cost_total?: number
          created_at?: string
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          note?: string | null
          paid?: boolean
          total?: number
        }
        Update: {
          cost_total?: number
          created_at?: string
          customer_address?: string | null
          customer_name?: string | null
          customer_phone?: string | null
          id?: string
          note?: string | null
          paid?: boolean
          total?: number
        }
        Relationships: []
      }
      products: {
        Row: {
          code: string
          cost_price: number
          created_at: string
          id: string
          image_url: string | null
          name: string
          sale_price: number
          stock: number
          updated_at: string
        }
        Insert: {
          code: string
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          name: string
          sale_price?: number
          stock?: number
          updated_at?: string
        }
        Update: {
          code?: string
          cost_price?: number
          created_at?: string
          id?: string
          image_url?: string | null
          name?: string
          sale_price?: number
          stock?: number
          updated_at?: string
        }
        Relationships: []
      }
      purchases: {
        Row: {
          cost_price: number
          created_at: string
          id: string
          product_code: string
          product_id: string | null
          product_name: string
          quantity: number
          sale_price: number
          total: number
        }
        Insert: {
          cost_price?: number
          created_at?: string
          id?: string
          product_code: string
          product_id?: string | null
          product_name: string
          quantity?: number
          sale_price?: number
          total?: number
        }
        Update: {
          cost_price?: number
          created_at?: string
          id?: string
          product_code?: string
          product_id?: string | null
          product_name?: string
          quantity?: number
          sale_price?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "purchases_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      [_ in never]: never
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
