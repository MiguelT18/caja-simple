export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      branches: {
        Row: {
          address: string;
          business_id: string;
          created_at: string;
          id: string;
          image_path: string | null;
          name: string;
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          address?: string;
          business_id: string;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          name: string;
          slug: string;
        };
        Update: {
          address?: string;
          business_id?: string;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          name?: string;
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "branches_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      businesses: {
        Row: {
          created_at: string;
          id: string;
          kind: Database["public"]["Enums"]["business_kind"];
          name: string;
          owner_id: string;
          plan: Database["public"]["Enums"]["plan"];
          slug: string;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["business_kind"];
          name: string;
          owner_id?: string;
          plan?: Database["public"]["Enums"]["plan"];
          slug: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["business_kind"];
          name?: string;
          owner_id?: string;
          plan?: Database["public"]["Enums"]["plan"];
          slug?: string;
        };
        Relationships: [
          {
            foreignKeyName: "businesses_owner_id_fkey";
            columns: ["owner_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      categories: {
        Row: {
          business_id: string;
          created_at: string;
          id: string;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          created_at?: string;
          id?: string;
          name: string;
        };
        Update: {
          business_id?: string;
          created_at?: string;
          id?: string;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "categories_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
      };
      employees: {
        Row: {
          branch_id: string;
          business_id: string;
          created_at: string;
          email: string;
          id: string;
          job_title: string;
          person_id: string | null;
          shift_id: string | null;
          status: Database["public"]["Enums"]["employee_status"];
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          business_id: string;
          created_at?: string;
          email: string;
          id?: string;
          job_title?: string;
          person_id?: string | null;
          shift_id?: string | null;
          status?: Database["public"]["Enums"]["employee_status"];
        };
        Update: {
          branch_id?: string;
          business_id?: string;
          created_at?: string;
          email?: string;
          id?: string;
          job_title?: string;
          person_id?: string | null;
          shift_id?: string | null;
          status?: Database["public"]["Enums"]["employee_status"];
        };
        Relationships: [
          {
            foreignKeyName: "employees_branch_id_business_id_fkey";
            columns: ["branch_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "employees_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "employees_shift_id_fkey";
            columns: ["shift_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id"];
          },
        ];
      };
      expenses: {
        Row: {
          amount: number;
          branch_id: string;
          business_date: string;
          category: string;
          concept: string;
          id: string;
          occurred_at: string;
          recorded_by: string | null;
          shift_id: string;
        };
        ComputedFields: never;
        Insert: {
          amount: number;
          branch_id: string;
          business_date?: string;
          category: string;
          concept: string;
          id?: string;
          occurred_at?: string;
          recorded_by?: string | null;
          shift_id: string;
        };
        Update: {
          amount?: number;
          branch_id?: string;
          business_date?: string;
          category?: string;
          concept?: string;
          id?: string;
          occurred_at?: string;
          recorded_by?: string | null;
          shift_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "expenses_shift_id_branch_id_fkey";
            columns: ["shift_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id", "branch_id"];
          },
        ];
      };
      inventory: {
        Row: {
          branch_id: string;
          business_id: string;
          min_stock: number | null;
          price: number | null;
          product_id: string;
          stock: number | null;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          business_id: string;
          min_stock?: number | null;
          price?: number | null;
          product_id: string;
          stock?: number | null;
        };
        Update: {
          branch_id?: string;
          business_id?: string;
          min_stock?: number | null;
          price?: number | null;
          product_id?: string;
          stock?: number | null;
        };
        Relationships: [
          {
            foreignKeyName: "inventory_branch_id_business_id_fkey";
            columns: ["branch_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "inventory_product_id_business_id_fkey";
            columns: ["product_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "business_id"];
          },
        ];
      };
      notifications: {
        Row: {
          business_id: string | null;
          created_at: string;
          data: NonNullable<Json>;
          employee_id: string | null;
          id: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          employee_id?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          user_id: string;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          employee_id?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "notifications_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_employee_id_fkey";
            columns: ["employee_id"];
            isOneToOne: false;
            referencedRelation: "employees";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      products: {
        Row: {
          barcode: string | null;
          business_id: string;
          category_id: string | null;
          created_at: string;
          id: string;
          image_path: string | null;
          name: string;
        };
        ComputedFields: never;
        Insert: {
          barcode?: string | null;
          business_id: string;
          category_id?: string | null;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          name: string;
        };
        Update: {
          barcode?: string | null;
          business_id?: string;
          category_id?: string | null;
          created_at?: string;
          id?: string;
          image_path?: string | null;
          name?: string;
        };
        Relationships: [
          {
            foreignKeyName: "products_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "products_category_id_business_id_fkey";
            columns: ["category_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "categories";
            referencedColumns: ["id", "business_id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string;
          first_name: string;
          id: string;
          last_name: string;
        };
        ComputedFields: never;
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email: string;
          first_name?: string;
          id: string;
          last_name?: string;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string;
          first_name?: string;
          id?: string;
          last_name?: string;
        };
        Relationships: [];
      };
      push_subscriptions: {
        Row: {
          auth: string;
          created_at: string;
          endpoint: string;
          id: string;
          p256dh: string;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          auth: string;
          created_at?: string;
          endpoint: string;
          id?: string;
          p256dh: string;
          user_id?: string;
        };
        Update: {
          auth?: string;
          created_at?: string;
          endpoint?: string;
          id?: string;
          p256dh?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_items: {
        Row: {
          id: string;
          product_id: string;
          qty: number;
          sale_id: string;
          unit_price: number;
        };
        ComputedFields: never;
        Insert: {
          id?: string;
          product_id: string;
          qty: number;
          sale_id: string;
          unit_price?: number;
        };
        Update: {
          id?: string;
          product_id?: string;
          qty?: number;
          sale_id?: string;
          unit_price?: number;
        };
        Relationships: [
          {
            foreignKeyName: "sale_items_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sale_totals";
            referencedColumns: ["sale_id"];
          },
          {
            foreignKeyName: "sale_items_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: false;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ];
      };
      sales: {
        Row: {
          branch_id: string;
          business_date: string;
          id: string;
          occurred_at: string;
          recorded_by: string | null;
          shift_id: string;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          business_date?: string;
          id?: string;
          occurred_at?: string;
          recorded_by?: string | null;
          shift_id: string;
        };
        Update: {
          branch_id?: string;
          business_date?: string;
          id?: string;
          occurred_at?: string;
          recorded_by?: string | null;
          shift_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_shift_id_branch_id_fkey";
            columns: ["shift_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id", "branch_id"];
          },
        ];
      };
      shift_closes: {
        Row: {
          branch_id: string;
          business_date: string;
          closed_at: string | null;
          counted: number | null;
          id: string;
          opened_by: string | null;
          opening: number;
          shift_id: string;
          status: Database["public"]["Enums"]["close_status"];
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          business_date?: string;
          closed_at?: string | null;
          counted?: number | null;
          id?: string;
          opened_by?: string | null;
          opening: number;
          shift_id: string;
          status?: Database["public"]["Enums"]["close_status"];
        };
        Update: {
          branch_id?: string;
          business_date?: string;
          closed_at?: string | null;
          counted?: number | null;
          id?: string;
          opened_by?: string | null;
          opening?: number;
          shift_id?: string;
          status?: Database["public"]["Enums"]["close_status"];
        };
        Relationships: [
          {
            foreignKeyName: "shift_closes_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_closes_shift_id_branch_id_fkey";
            columns: ["shift_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id", "branch_id"];
          },
        ];
      };
      shifts: {
        Row: {
          archived_at: string | null;
          branch_id: string;
          created_at: string;
          end_time: string;
          id: string;
          name: string;
          start_time: string;
          tone: Database["public"]["Enums"]["shift_tone"];
        };
        ComputedFields: never;
        Insert: {
          archived_at?: string | null;
          branch_id: string;
          created_at?: string;
          end_time: string;
          id?: string;
          name: string;
          start_time: string;
          tone: Database["public"]["Enums"]["shift_tone"];
        };
        Update: {
          archived_at?: string | null;
          branch_id?: string;
          created_at?: string;
          end_time?: string;
          id?: string;
          name?: string;
          start_time?: string;
          tone?: Database["public"]["Enums"]["shift_tone"];
        };
        Relationships: [
          {
            foreignKeyName: "shifts_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      sale_totals: {
        Row: {
          branch_id: string;
          business_date: string;
          items: number | null;
          occurred_at: string;
          recorded_by: string | null;
          sale_id: string;
          shift_id: string;
          total: number | null;
        };
        ComputedFields: never;
        Relationships: [
          {
            foreignKeyName: "sales_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "sales_shift_id_branch_id_fkey";
            columns: ["shift_id", "branch_id"];
            isOneToOne: false;
            referencedRelation: "shifts";
            referencedColumns: ["id", "branch_id"];
          },
        ];
      };
    };
    Functions: {
      change_my_shift: { Args: { p_employee: string; p_shift: string }; Returns: undefined };
      create_business: {
        Args: {
          p_branch_address: string;
          p_branch_name: string;
          p_branch_slug: string;
          p_kind?: Database["public"]["Enums"]["business_kind"];
          p_name: string;
          p_shifts: Json;
          p_slug: string;
        };
        Returns: string;
      };
      register_sale: { Args: { p_branch: string; p_items: Json; p_shift: string }; Returns: string };
      respond_invitation: { Args: { p_accept: boolean; p_employee: string }; Returns: undefined };
      search_people: {
        Args: { p_business: string; p_page?: number; p_query: string };
        Returns: {
          avatar_url: string;
          by_email: boolean;
          email: string;
          first_name: string;
          id: string;
          last_name: string;
          total: number;
        }[];
      };
    };
    Enums: {
      business_kind: "tienda" | "ropa" | "restaurante";
      close_status: "en-curso" | "cerrado";
      employee_status: "activo" | "invitado";
      notification_kind: "invitation" | "invitation_answer" | "cash_mismatch" | "low_stock" | "shift_change";
      plan: "Gratis" | "Negocio" | "Sucursales";
      shift_tone: "morning" | "afternoon" | "night";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"] | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      business_kind: ["tienda", "ropa", "restaurante"],
      close_status: ["en-curso", "cerrado"],
      employee_status: ["activo", "invitado"],
      notification_kind: ["invitation", "invitation_answer", "cash_mismatch", "low_stock", "shift_change"],
      plan: ["Gratis", "Negocio", "Sucursales"],
      shift_tone: ["morning", "afternoon", "night"],
    },
  },
} as const;
