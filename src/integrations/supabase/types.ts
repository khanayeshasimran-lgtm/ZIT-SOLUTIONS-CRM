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
    PostgrestVersion: "14.1"
  }
  public: {
    Tables: {
      activities: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          created_by: string | null
          deal_id: string | null
          description: string
          due_date: string
          id: string
          lead_id: string | null
          status: string
          title: string
          type: string
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          description: string
          due_date: string
          id?: string
          lead_id?: string | null
          status: string
          title: string
          type: string
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          deal_id?: string | null
          description?: string
          due_date?: string
          id?: string
          lead_id?: string | null
          status?: string
          title?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "activities_deal_id_fkey"
            columns: ["deal_id"]
            isOneToOne: false
            referencedRelation: "deals"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          actor_email: string | null
          created_at: string | null
          entity: string
          entity_id: string | null
          id: string
          ip_address: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          created_at?: string | null
          entity: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          created_at?: string | null
          entity?: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      companies: {
        Row: {
          address: string | null
          created_at: string | null
          created_by: string | null
          id: string
          industry: string | null
          name: string
          phone: string | null
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          industry?: string | null
          name: string
          phone?: string | null
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          industry?: string | null
          name?: string
          phone?: string | null
          website?: string | null
        }
        Relationships: []
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          first_name: string
          id: string
          is_important: boolean | null
          last_name: string | null
          phone: string | null
          position: string | null
        }
        Insert: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_important?: boolean | null
          last_name?: string | null
          phone?: string | null
          position?: string | null
        }
        Update: {
          company_id?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          first_name?: string
          id?: string
          is_important?: boolean | null
          last_name?: string | null
          phone?: string | null
          position?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          created_at: string | null
          created_by: string | null
          expected_close_date: string | null
          id: string
          lead_id: string | null
          probability: number | null
          stage: string
          title: string
          value: number | null
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          probability?: number | null
          stage?: string
          title: string
          value?: number | null
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          probability?: number | null
          stage?: string
          title?: string
          value?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: true
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      interns: {
        Row: {
          created_at: string | null
          created_by: string | null
          domain: string | null
          end_date: string | null
          id: string
          intern_name: string
          start_date: string | null
          status: string
        }
        Insert: {
          created_at?: string | null
          created_by?: string | null
          domain?: string | null
          end_date?: string | null
          id?: string
          intern_name: string
          start_date?: string | null
          status: string
        }
        Update: {
          created_at?: string | null
          created_by?: string | null
          domain?: string | null
          end_date?: string | null
          id?: string
          intern_name?: string
          start_date?: string | null
          status?: string
        }
        Relationships: []
      }
      investor_dashboard_config: {
        Row: {
          headline: string | null
          id: string
          updated_at: string
        }
        Insert: {
          headline?: string | null
          id?: string
          updated_at?: string
        }
        Update: {
          headline?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      leads: {
        Row: {
          assigned_to: string | null
          created_at: string | null
          created_by: string | null
          email: string | null
          id: string
          is_important: boolean | null
          last_contacted_at: string | null
          name: string | null
          phone: string | null
          priority: string | null
          role: string | null
          source: string | null
          status: string | null
        }
        Insert: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_important?: boolean | null
          last_contacted_at?: string | null
          name?: string | null
          phone?: string | null
          priority?: string | null
          role?: string | null
          source?: string | null
          status?: string | null
        }
        Update: {
          assigned_to?: string | null
          created_at?: string | null
          created_by?: string | null
          email?: string | null
          id?: string
          is_important?: boolean | null
          last_contacted_at?: string | null
          name?: string | null
          phone?: string | null
          priority?: string | null
          role?: string | null
          source?: string | null
          status?: string | null
        }
        Relationships: []
      }
      meetings: {
        Row: {
          agenda: string | null
          attendees: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          end_time: string | null
          id: string
          lead_id: string | null
          location: string | null
          meeting_type: string
          mode: string
          notes: string | null
          start_time: string
          status: string
          title: string
          updated_at: string
          video_link: string | null
        }
        Insert: {
          agenda?: string | null
          attendees?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_type?: string
          mode?: string
          notes?: string | null
          start_time: string
          status?: string
          title: string
          updated_at?: string
          video_link?: string | null
        }
        Update: {
          agenda?: string | null
          attendees?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_time?: string | null
          id?: string
          lead_id?: string | null
          location?: string | null
          meeting_type?: string
          mode?: string
          notes?: string | null
          start_time?: string
          status?: string
          title?: string
          updated_at?: string
          video_link?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "meetings_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      notice_board: {
        Row: {
          body: string
          created_at: string
          created_by: string | null
          id: string
          pinned: boolean
          tag: string
          title: string
          visible_to_investors: boolean
        }
        Insert: {
          body: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          tag?: string
          title: string
          visible_to_investors?: boolean
        }
        Update: {
          body?: string
          created_at?: string
          created_by?: string | null
          id?: string
          pinned?: boolean
          tag?: string
          title?: string
          visible_to_investors?: boolean
        }
        Relationships: []
      }
      outreach_tasks: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          notes: string | null
          priority: string
          reminder: string
          status: string
          task_type: string
          title: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          priority?: string
          reminder?: string
          status?: string
          task_type?: string
          title: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          priority?: string
          reminder?: string
          status?: string
          task_type?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "outreach_tasks_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_tasks_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "outreach_tasks_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string | null
          created_by: string | null
          id: string
          name: string
          subject: string | null
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name: string
          subject?: string | null
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string | null
          created_by?: string | null
          id?: string
          name?: string
          subject?: string | null
        }
        Relationships: []
      }
      profiles: {
        Row: {
          company: string | null
          created_at: string | null
          email: string
          full_name: string | null
          id: string
          is_active: boolean | null
          job_title: string | null
          location: string | null
          phone: string | null
          role: string | null
          updated_at: string | null
        }
        Insert: {
          company?: string | null
          created_at?: string | null
          email: string
          full_name?: string | null
          id: string
          is_active?: boolean | null
          job_title?: string | null
          location?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Update: {
          company?: string | null
          created_at?: string | null
          email?: string
          full_name?: string | null
          id?: string
          is_active?: boolean | null
          job_title?: string | null
          location?: string | null
          phone?: string | null
          role?: string | null
          updated_at?: string | null
        }
        Relationships: []
      }
      projects: {
        Row: {
          budget: number | null
          created_at: string | null
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          rating: number | null
          start_date: string | null
          status: string
        }
        Insert: {
          budget?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          rating?: number | null
          start_date?: string | null
          status?: string
        }
        Update: {
          budget?: number | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          rating?: number | null
          start_date?: string | null
          status?: string
        }
        Relationships: []
      }
      saved_filters: {
        Row: {
          created_at: string | null
          entity: string
          filters: Json
          id: string
          name: string
          user_id: string | null
        }
        Insert: {
          created_at?: string | null
          entity: string
          filters: Json
          id?: string
          name: string
          user_id?: string | null
        }
        Update: {
          created_at?: string | null
          entity?: string
          filters?: Json
          id?: string
          name?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "saved_filters_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tickets: {
        Row: {
          assigned_to_email: string | null
          category: string | null
          company_id: string | null
          contact_id: string | null
          created_at: string | null
          created_by: string | null
          description: string | null
          id: string
          lead_id: string | null
          notes: string | null
          priority: string
          status: string
          title: string
        }
        Insert: {
          assigned_to_email?: string | null
          category?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          priority?: string
          status?: string
          title: string
        }
        Update: {
          assigned_to_email?: string | null
          category?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string | null
          created_by?: string | null
          description?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          priority?: string
          status?: string
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "tickets_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_contact_id_fkey"
            columns: ["contact_id"]
            isOneToOne: false
            referencedRelation: "contacts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tickets_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      change_user_role: {
        Args: { actor_email: string; new_role: string; target_user_id: string }
        Returns: undefined
      }
      current_user_role: { Args: never; Returns: string }
    }
    Enums: {
      intern_status: "ongoing" | "completed" | "on_hold" | "dropped"
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
    Enums: {
      intern_status: ["ongoing", "completed", "on_hold", "dropped"],
    },
  },
} as const
