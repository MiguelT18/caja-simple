export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      billing_settings: {
        Row: {
          bank_details: string | null;
          card_note: string;
          charge_days: number;
          founder_active: boolean;
          founder_discount: number;
          founder_months: number;
          founder_slots: number;
          id: boolean;
          qr_image_url: string | null;
          tax_rate: number;
        };
        ComputedFields: never;
        Insert: {
          bank_details?: string | null;
          card_note?: string;
          charge_days?: number;
          founder_active?: boolean;
          founder_discount?: number;
          founder_months?: number;
          founder_slots?: number;
          id?: boolean;
          qr_image_url?: string | null;
          tax_rate?: number;
        };
        Update: {
          bank_details?: string | null;
          card_note?: string;
          charge_days?: number;
          founder_active?: boolean;
          founder_discount?: number;
          founder_months?: number;
          founder_slots?: number;
          id?: boolean;
          qr_image_url?: string | null;
          tax_rate?: number;
        };
        Relationships: [];
      };
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
          description: string | null;
          founder_since: string | null;
          id: string;
          image_path: string | null;
          kind: Database["public"]["Enums"]["business_kind"];
          listed: boolean;
          name: string;
          owner_id: string;
          plan: Database["public"]["Enums"]["plan"];
          plan_until: string | null;
          slug: string;
          trial: boolean;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          description?: string | null;
          founder_since?: string | null;
          id?: string;
          image_path?: string | null;
          kind?: Database["public"]["Enums"]["business_kind"];
          listed?: boolean;
          name: string;
          owner_id?: string;
          plan?: Database["public"]["Enums"]["plan"];
          plan_until?: string | null;
          slug: string;
          trial?: boolean;
        };
        Update: {
          created_at?: string;
          description?: string | null;
          founder_since?: string | null;
          id?: string;
          image_path?: string | null;
          kind?: Database["public"]["Enums"]["business_kind"];
          listed?: boolean;
          name?: string;
          owner_id?: string;
          plan?: Database["public"]["Enums"]["plan"];
          plan_until?: string | null;
          slug?: string;
          trial?: boolean;
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
      exchange_rates: {
        Row: {
          date: string;
          fetched_at: string;
          source: string;
          usd_bob: number;
        };
        ComputedFields: never;
        Insert: {
          date: string;
          fetched_at?: string;
          source: string;
          usd_bob: number;
        };
        Update: {
          date?: string;
          fetched_at?: string;
          source?: string;
          usd_bob?: number;
        };
        Relationships: [];
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
          voided_at: string | null;
          voided_by: string | null;
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
          voided_at?: string | null;
          voided_by?: string | null;
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
          voided_at?: string | null;
          voided_by?: string | null;
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
          {
            foreignKeyName: "expenses_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      feedback: {
        Row: {
          created_at: string;
          id: string;
          images: string[];
          kind: string;
          message: string;
          page: string | null;
          person_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          created_at?: string;
          id?: string;
          images?: string[];
          kind: string;
          message: string;
          page?: string | null;
          person_id?: string | null;
        };
        Update: {
          created_at?: string;
          id?: string;
          images?: string[];
          kind?: string;
          message?: string;
          page?: string | null;
          person_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "feedback_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
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
      join_requests: {
        Row: {
          branch_id: string | null;
          business_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          message: string | null;
          person_email: string;
          person_id: string;
          person_name: string;
          status: Database["public"]["Enums"]["join_status"];
        };
        ComputedFields: never;
        Insert: {
          branch_id?: string | null;
          business_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          message?: string | null;
          person_email: string;
          person_id?: string;
          person_name: string;
          status?: Database["public"]["Enums"]["join_status"];
        };
        Update: {
          branch_id?: string | null;
          business_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          message?: string | null;
          person_email?: string;
          person_id?: string;
          person_name?: string;
          status?: Database["public"]["Enums"]["join_status"];
        };
        Relationships: [
          {
            foreignKeyName: "join_requests_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "join_requests_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "join_requests_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "join_requests_person_id_fkey";
            columns: ["person_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
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
          join_request_id: string | null;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at: string | null;
          reopen_request_id: string | null;
          stock_request_id: string | null;
          user_id: string;
        };
        ComputedFields: never;
        Insert: {
          business_id?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          employee_id?: string | null;
          id?: string;
          join_request_id?: string | null;
          kind: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          reopen_request_id?: string | null;
          stock_request_id?: string | null;
          user_id: string;
        };
        Update: {
          business_id?: string | null;
          created_at?: string;
          data?: NonNullable<Json>;
          employee_id?: string | null;
          id?: string;
          join_request_id?: string | null;
          kind?: Database["public"]["Enums"]["notification_kind"];
          read_at?: string | null;
          reopen_request_id?: string | null;
          stock_request_id?: string | null;
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
            foreignKeyName: "notifications_join_request_id_fkey";
            columns: ["join_request_id"];
            isOneToOne: false;
            referencedRelation: "join_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_reopen_request_id_fkey";
            columns: ["reopen_request_id"];
            isOneToOne: false;
            referencedRelation: "reopen_requests";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "notifications_stock_request_id_fkey";
            columns: ["stock_request_id"];
            isOneToOne: false;
            referencedRelation: "stock_requests";
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
      orders: {
        Row: {
          branch_id: string;
          created_at: string;
          created_by: string | null;
          id: string;
          items: NonNullable<Json>;
          label: string;
          sale_id: string | null;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          items?: NonNullable<Json>;
          label: string;
          sale_id?: string | null;
        };
        Update: {
          branch_id?: string;
          created_at?: string;
          created_by?: string | null;
          id?: string;
          items?: NonNullable<Json>;
          label?: string;
          sale_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "orders_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "orders_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: true;
            referencedRelation: "sale_totals";
            referencedColumns: ["sale_id"];
          },
          {
            foreignKeyName: "orders_sale_id_fkey";
            columns: ["sale_id"];
            isOneToOne: true;
            referencedRelation: "sales";
            referencedColumns: ["id"];
          },
        ];
      };
      plan_charges: {
        Row: {
          amount_bs: number;
          business_id: string;
          created_at: string;
          created_by: string | null;
          discount: number;
          expires_at: string;
          extra_branches: number;
          id: string;
          method: Database["public"]["Enums"]["charge_method"];
          paid_at: string | null;
          period: Database["public"]["Enums"]["plan_period"];
          plan: Database["public"]["Enums"]["plan"];
          rate: number;
          rate_date: string;
          tax_rate: number;
          usd: number;
        };
        ComputedFields: never;
        Insert: {
          amount_bs: number;
          business_id: string;
          created_at?: string;
          created_by?: string | null;
          discount?: number;
          expires_at: string;
          extra_branches?: number;
          id?: string;
          method: Database["public"]["Enums"]["charge_method"];
          paid_at?: string | null;
          period: Database["public"]["Enums"]["plan_period"];
          plan: Database["public"]["Enums"]["plan"];
          rate: number;
          rate_date: string;
          tax_rate: number;
          usd: number;
        };
        Update: {
          amount_bs?: number;
          business_id?: string;
          created_at?: string;
          created_by?: string | null;
          discount?: number;
          expires_at?: string;
          extra_branches?: number;
          id?: string;
          method?: Database["public"]["Enums"]["charge_method"];
          paid_at?: string | null;
          period?: Database["public"]["Enums"]["plan_period"];
          plan?: Database["public"]["Enums"]["plan"];
          rate?: number;
          rate_date?: string;
          tax_rate?: number;
          usd?: number;
        };
        Relationships: [
          {
            foreignKeyName: "plan_charges_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "plan_charges_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      product_components: {
        Row: {
          business_id: string;
          combo_id: string;
          component_id: string;
          qty: number;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          combo_id: string;
          component_id: string;
          qty: number;
        };
        Update: {
          business_id?: string;
          combo_id?: string;
          component_id?: string;
          qty?: number;
        };
        Relationships: [
          {
            foreignKeyName: "product_components_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "product_components_combo_id_business_id_fkey";
            columns: ["combo_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "product_components_component_id_business_id_fkey";
            columns: ["component_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "business_id"];
          },
        ];
      };
      products: {
        Row: {
          barcode: string | null;
          business_id: string;
          category_id: string | null;
          created_at: string;
          description: string | null;
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
          description?: string | null;
          id?: string;
          image_path?: string | null;
          name: string;
        };
        Update: {
          barcode?: string | null;
          business_id?: string;
          category_id?: string | null;
          created_at?: string;
          description?: string | null;
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
      promotion_products: {
        Row: {
          business_id: string;
          product_id: string;
          promotion_id: string;
        };
        ComputedFields: never;
        Insert: {
          business_id: string;
          product_id: string;
          promotion_id: string;
        };
        Update: {
          business_id?: string;
          product_id?: string;
          promotion_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "promotion_products_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "promotion_products_product_id_business_id_fkey";
            columns: ["product_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id", "business_id"];
          },
          {
            foreignKeyName: "promotion_products_promotion_id_business_id_fkey";
            columns: ["promotion_id", "business_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
            referencedColumns: ["id", "business_id"];
          },
        ];
      };
      promotions: {
        Row: {
          active: boolean;
          branch_ids: string[] | null;
          business_id: string;
          buy: number | null;
          created_at: string;
          ends_on: string | null;
          id: string;
          kind: Database["public"]["Enums"]["promo_kind"];
          name: string;
          pay: number | null;
          percent: number | null;
          price: number | null;
          starts_on: string | null;
          weekdays: number[] | null;
        };
        ComputedFields: never;
        Insert: {
          active?: boolean;
          branch_ids?: string[] | null;
          business_id: string;
          buy?: number | null;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          kind: Database["public"]["Enums"]["promo_kind"];
          name: string;
          pay?: number | null;
          percent?: number | null;
          price?: number | null;
          starts_on?: string | null;
          weekdays?: number[] | null;
        };
        Update: {
          active?: boolean;
          branch_ids?: string[] | null;
          business_id?: string;
          buy?: number | null;
          created_at?: string;
          ends_on?: string | null;
          id?: string;
          kind?: Database["public"]["Enums"]["promo_kind"];
          name?: string;
          pay?: number | null;
          percent?: number | null;
          price?: number | null;
          starts_on?: string | null;
          weekdays?: number[] | null;
        };
        Relationships: [
          {
            foreignKeyName: "promotions_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
        ];
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
      reopen_requests: {
        Row: {
          branch_id: string;
          close_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          reason: string | null;
          requested_by: string | null;
          status: Database["public"]["Enums"]["reopen_status"];
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          close_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          reason?: string | null;
          requested_by?: string | null;
          status?: Database["public"]["Enums"]["reopen_status"];
        };
        Update: {
          branch_id?: string;
          close_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          reason?: string | null;
          requested_by?: string | null;
          status?: Database["public"]["Enums"]["reopen_status"];
        };
        Relationships: [
          {
            foreignKeyName: "reopen_requests_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reopen_requests_close_id_fkey";
            columns: ["close_id"];
            isOneToOne: false;
            referencedRelation: "shift_closes";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reopen_requests_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "reopen_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      sale_items: {
        Row: {
          components: Json | null;
          discount: number;
          id: string;
          product_id: string;
          promotion_id: string | null;
          qty: number;
          sale_id: string;
          unit_price: number;
        };
        ComputedFields: never;
        Insert: {
          components?: Json | null;
          discount?: number;
          id?: string;
          product_id: string;
          promotion_id?: string | null;
          qty: number;
          sale_id: string;
          unit_price?: number;
        };
        Update: {
          components?: Json | null;
          discount?: number;
          id?: string;
          product_id?: string;
          promotion_id?: string | null;
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
            foreignKeyName: "sale_items_promotion_id_fkey";
            columns: ["promotion_id"];
            isOneToOne: false;
            referencedRelation: "promotions";
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
          payment_method: Database["public"]["Enums"]["payment_method"];
          receipt_path: string | null;
          recorded_by: string | null;
          shift_id: string;
          voided_at: string | null;
          voided_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          business_date?: string;
          id?: string;
          occurred_at?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          receipt_path?: string | null;
          recorded_by?: string | null;
          shift_id: string;
          voided_at?: string | null;
          voided_by?: string | null;
        };
        Update: {
          branch_id?: string;
          business_date?: string;
          id?: string;
          occurred_at?: string;
          payment_method?: Database["public"]["Enums"]["payment_method"];
          receipt_path?: string | null;
          recorded_by?: string | null;
          shift_id?: string;
          voided_at?: string | null;
          voided_by?: string | null;
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
          {
            foreignKeyName: "sales_voided_by_fkey";
            columns: ["voided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      shift_closes: {
        Row: {
          branch_id: string;
          business_date: string;
          closed_at: string | null;
          closed_by: string | null;
          counted: number | null;
          id: string;
          note: string | null;
          opened_at: string;
          opened_by: string | null;
          opening: number;
          reopened_at: string | null;
          reopened_by: string | null;
          shift_id: string;
          status: Database["public"]["Enums"]["close_status"];
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          business_date?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          counted?: number | null;
          id?: string;
          note?: string | null;
          opened_at?: string;
          opened_by?: string | null;
          opening: number;
          reopened_at?: string | null;
          reopened_by?: string | null;
          shift_id: string;
          status?: Database["public"]["Enums"]["close_status"];
        };
        Update: {
          branch_id?: string;
          business_date?: string;
          closed_at?: string | null;
          closed_by?: string | null;
          counted?: number | null;
          id?: string;
          note?: string | null;
          opened_at?: string;
          opened_by?: string | null;
          opening?: number;
          reopened_at?: string | null;
          reopened_by?: string | null;
          shift_id?: string;
          status?: Database["public"]["Enums"]["close_status"];
        };
        Relationships: [
          {
            foreignKeyName: "shift_closes_closed_by_fkey";
            columns: ["closed_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_closes_opened_by_fkey";
            columns: ["opened_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "shift_closes_reopened_by_fkey";
            columns: ["reopened_by"];
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
      stock_movements: {
        Row: {
          approved_by: string | null;
          branch_id: string;
          business_id: string;
          id: string;
          kind: Database["public"]["Enums"]["stock_move_kind"];
          occurred_at: string;
          product_id: string;
          qty: number;
          reason: string | null;
          recorded_by: string | null;
        };
        ComputedFields: never;
        Insert: {
          approved_by?: string | null;
          branch_id: string;
          business_id: string;
          id?: string;
          kind: Database["public"]["Enums"]["stock_move_kind"];
          occurred_at?: string;
          product_id: string;
          qty: number;
          reason?: string | null;
          recorded_by?: string | null;
        };
        Update: {
          approved_by?: string | null;
          branch_id?: string;
          business_id?: string;
          id?: string;
          kind?: Database["public"]["Enums"]["stock_move_kind"];
          occurred_at?: string;
          product_id?: string;
          qty?: number;
          reason?: string | null;
          recorded_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "stock_movements_approved_by_fkey";
            columns: ["approved_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_movements_recorded_by_fkey";
            columns: ["recorded_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      stock_requests: {
        Row: {
          branch_id: string;
          business_id: string;
          created_at: string;
          decided_at: string | null;
          decided_by: string | null;
          id: string;
          product_id: string;
          qty: number;
          reason: string | null;
          requested_by: string | null;
          status: Database["public"]["Enums"]["reopen_status"];
        };
        ComputedFields: never;
        Insert: {
          branch_id: string;
          business_id: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          product_id: string;
          qty: number;
          reason?: string | null;
          requested_by?: string | null;
          status?: Database["public"]["Enums"]["reopen_status"];
        };
        Update: {
          branch_id?: string;
          business_id?: string;
          created_at?: string;
          decided_at?: string | null;
          decided_by?: string | null;
          id?: string;
          product_id?: string;
          qty?: number;
          reason?: string | null;
          requested_by?: string | null;
          status?: Database["public"]["Enums"]["reopen_status"];
        };
        Relationships: [
          {
            foreignKeyName: "stock_requests_branch_id_fkey";
            columns: ["branch_id"];
            isOneToOne: false;
            referencedRelation: "branches";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_requests_business_id_fkey";
            columns: ["business_id"];
            isOneToOne: false;
            referencedRelation: "businesses";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_requests_decided_by_fkey";
            columns: ["decided_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_requests_product_id_fkey";
            columns: ["product_id"];
            isOneToOne: false;
            referencedRelation: "products";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "stock_requests_requested_by_fkey";
            columns: ["requested_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
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
          payment_method: Database["public"]["Enums"]["payment_method"];
          receipt_path: string | null;
          recorded_by: string | null;
          sale_id: string;
          shift_id: string;
          total: number | null;
          voided_at: string | null;
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
      answer_join: { Args: { p_accept: boolean; p_branch?: string; p_job_title?: string; p_request: string; p_shift?: string }; Returns: undefined };
      answer_reopen: { Args: { p_accept: boolean; p_request: string }; Returns: undefined };
      answer_stock_request: { Args: { p_accept: boolean; p_request: string }; Returns: undefined };
      attach_sale_receipt: { Args: { p_path: string; p_sale: string }; Returns: undefined };
      branch_team: {
        Args: { p_branch: string };
        Returns: {
          avatar_url: string;
          first_name: string;
          is_owner: boolean;
          job_title: string;
          last_name: string;
          person_id: string;
          shift_id: string;
        }[];
      };
      business_stats: { Args: { p_business: string; p_from: string; p_to: string }; Returns: Json };
      change_my_shift: { Args: { p_employee: string; p_shift: string }; Returns: undefined };
      charge_order: {
        Args: { p_items: Json; p_order: string; p_payment: Database["public"]["Enums"]["payment_method"]; p_sale: string; p_shift: string };
        Returns: string;
      };
      create_business: {
        Args: {
          p_branch_address: string;
          p_branch_name: string;
          p_branch_slug: string;
          p_description?: string;
          p_kind?: Database["public"]["Enums"]["business_kind"];
          p_listed?: boolean;
          p_name: string;
          p_shifts: Json;
          p_slug: string;
        };
        Returns: string;
      };
      create_plan_charge: {
        Args: {
          p_branches: number;
          p_business: string;
          p_method: Database["public"]["Enums"]["charge_method"];
          p_period: Database["public"]["Enums"]["plan_period"];
        };
        Returns: string;
      };
      delete_my_account: { Args: Record<PropertyKey, never>; Returns: undefined };
      founder_promo: {
        Args: { p_business?: string };
        Returns: {
          active: boolean;
          discount: number;
          founder_until: string;
          months: number;
          slots: number;
          taken: number;
        }[];
      };
      record_stock_move: {
        Args: { p_branch: string; p_kind: Database["public"]["Enums"]["stock_move_kind"]; p_product: string; p_qty: number; p_reason: string };
        Returns: undefined;
      };
      register_sale: {
        Args: {
          p_branch: string;
          p_items: Json;
          p_payment: Database["public"]["Enums"]["payment_method"];
          p_sale: string;
          p_shift: string;
          p_sold_at?: string;
        };
        Returns: string;
      };
      reopen_shift: { Args: { p_close: string }; Returns: undefined };
      request_join: { Args: { p_branch?: string; p_business: string; p_message?: string }; Returns: string };
      request_reopen: { Args: { p_close: string; p_reason?: string }; Returns: string };
      request_stock_entry: { Args: { p_branch: string; p_product: string; p_qty: number; p_reason?: string }; Returns: string };
      respond_invitation: { Args: { p_accept: boolean; p_employee: string }; Returns: undefined };
      save_promotion: {
        Args: {
          p_branch_ids: string[];
          p_business: string;
          p_buy: number;
          p_ends_on: string;
          p_id: string;
          p_kind: Database["public"]["Enums"]["promo_kind"];
          p_name: string;
          p_pay: number;
          p_percent: number;
          p_price: number;
          p_product_ids: string[];
          p_starts_on: string;
          p_weekdays: number[];
        };
        Returns: string;
      };
      search_businesses: {
        Args: { p_kind?: Database["public"]["Enums"]["business_kind"]; p_page?: number; p_query?: string };
        Returns: {
          branches: Json;
          description: string;
          id: string;
          image_path: string;
          kind: Database["public"]["Enums"]["business_kind"];
          name: string;
          relation: string;
          total: number;
        }[];
      };
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
      set_close_note: { Args: { p_close: string; p_note: string }; Returns: undefined };
      transfer_ownership: { Args: { p_employee: string }; Returns: undefined };
      void_sale: { Args: { p_sale: string }; Returns: undefined };
    };
    Enums: {
      business_kind: "tienda" | "ropa" | "restaurante";
      charge_method: "qr" | "transferencia" | "tarjeta";
      close_status: "en-curso" | "cerrado";
      employee_status: "activo" | "invitado";
      join_status: "pendiente" | "aceptada" | "rechazada";
      notification_kind:
        | "invitation"
        | "invitation_answer"
        | "cash_mismatch"
        | "low_stock"
        | "shift_change"
        | "plan_expiring"
        | "plan_expired"
        | "shift_closed"
        | "shift_reminder"
        | "shift_late"
        | "reopen_request"
        | "reopen_answer"
        | "reopen_sent"
        | "ownership"
        | "join_request"
        | "join_answer"
        | "shift_overdue"
        | "stock_request"
        | "stock_answer";
      payment_method: "efectivo" | "qr" | "transferencia";
      plan: "Gratis" | "Negocio" | "Sucursales";
      plan_period: "mensual" | "anual";
      promo_kind: "percent" | "price" | "bundle";
      reopen_status: "pendiente" | "aceptada" | "rechazada";
      shift_tone: "morning" | "afternoon" | "night";
      stock_move_kind: "entrada" | "merma" | "ajuste";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"]) | { schema: keyof DatabaseWithoutInternals },
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
      charge_method: ["qr", "transferencia", "tarjeta"],
      close_status: ["en-curso", "cerrado"],
      employee_status: ["activo", "invitado"],
      join_status: ["pendiente", "aceptada", "rechazada"],
      notification_kind: [
        "invitation",
        "invitation_answer",
        "cash_mismatch",
        "low_stock",
        "shift_change",
        "plan_expiring",
        "plan_expired",
        "shift_closed",
        "shift_reminder",
        "shift_late",
        "reopen_request",
        "reopen_answer",
        "reopen_sent",
        "ownership",
        "join_request",
        "join_answer",
        "shift_overdue",
        "stock_request",
        "stock_answer",
      ],
      payment_method: ["efectivo", "qr", "transferencia"],
      plan: ["Gratis", "Negocio", "Sucursales"],
      plan_period: ["mensual", "anual"],
      promo_kind: ["percent", "price", "bundle"],
      reopen_status: ["pendiente", "aceptada", "rechazada"],
      shift_tone: ["morning", "afternoon", "night"],
      stock_move_kind: ["entrada", "merma", "ajuste"],
    },
  },
} as const;
