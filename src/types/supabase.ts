Need to install the following packages:
  supabase@2.98.0
Ok to proceed? (y) export type Json =
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
          created_at: string
          created_by: string | null
          deal_id: string | null
          description: string | null
          due_date: string | null
          email_clicks: number
          email_opens: number
          id: string
          lead_id: string | null
          linked_meeting_id: string | null
          organization_id: string | null
          status: Database["public"]["Enums"]["activity_status_enum"]
          title: string
          type: Database["public"]["Enums"]["activity_type_enum"]
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          email_clicks?: number
          email_opens?: number
          id?: string
          lead_id?: string | null
          linked_meeting_id?: string | null
          organization_id?: string | null
          status?: Database["public"]["Enums"]["activity_status_enum"]
          title: string
          type: Database["public"]["Enums"]["activity_type_enum"]
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deal_id?: string | null
          description?: string | null
          due_date?: string | null
          email_clicks?: number
          email_opens?: number
          id?: string
          lead_id?: string | null
          linked_meeting_id?: string | null
          organization_id?: string | null
          status?: Database["public"]["Enums"]["activity_status_enum"]
          title?: string
          type?: Database["public"]["Enums"]["activity_type_enum"]
          updated_at?: string
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
          {
            foreignKeyName: "activities_linked_meeting_id_fkey"
            columns: ["linked_meeting_id"]
            isOneToOne: false
            referencedRelation: "meetings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "activities_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      ai_requests: {
        Row: {
          cache_key: string | null
          cached: boolean
          completion_tokens: number | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          feature: string
          id: string
          model: string
          organization_id: string | null
          prompt_tokens: number | null
          response_cache: Json | null
          success: boolean
          total_tokens: number | null
          user_id: string | null
        }
        Insert: {
          cache_key?: string | null
          cached?: boolean
          completion_tokens?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          feature: string
          id?: string
          model?: string
          organization_id?: string | null
          prompt_tokens?: number | null
          response_cache?: Json | null
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Update: {
          cache_key?: string | null
          cached?: boolean
          completion_tokens?: number | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          feature?: string
          id?: string
          model?: string
          organization_id?: string | null
          prompt_tokens?: number | null
          response_cache?: Json | null
          success?: boolean
          total_tokens?: number | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "ai_requests_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_logs: {
        Row: {
          action: string
          created_at: string
          entity: string
          entity_id: string | null
          id: string
          ip_address: string | null
          user_email: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: string
          ip_address?: string | null
          user_email?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      automation_logs: {
        Row: {
          action_taken: string
          created_at: string
          entity_id: string | null
          entity_type: string | null
          error_message: string | null
          id: string
          organization_id: string | null
          rule_id: string | null
          rule_name: string | null
          success: boolean
          trigger_type: string
        }
        Insert: {
          action_taken: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string | null
          rule_id?: string | null
          rule_name?: string | null
          success?: boolean
          trigger_type: string
        }
        Update: {
          action_taken?: string
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          error_message?: string | null
          id?: string
          organization_id?: string | null
          rule_id?: string | null
          rule_name?: string | null
          success?: boolean
          trigger_type?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_logs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "automation_logs_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "automation_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_rules: {
        Row: {
          action_config: Json
          action_type: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_active: boolean
          name: string
          organization_id: string | null
          trigger_config: Json
          trigger_type: string
          updated_at: string
        }
        Insert: {
          action_config?: Json
          action_type: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name: string
          organization_id?: string | null
          trigger_config?: Json
          trigger_type: string
          updated_at?: string
        }
        Update: {
          action_config?: Json
          action_type?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_active?: boolean
          name?: string
          organization_id?: string | null
          trigger_config?: Json
          trigger_type?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_rules_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      companies: {
        Row: {
          address: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          id: string
          industry: string | null
          name: string
          organization_id: string | null
          phone: string | null
          updated_at: string
          website: string | null
        }
        Insert: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          industry?: string | null
          name: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Update: {
          address?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          id?: string
          industry?: string | null
          name?: string
          organization_id?: string | null
          phone?: string | null
          updated_at?: string
          website?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "companies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      contacts: {
        Row: {
          company_id: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          first_name: string | null
          id: string
          is_important: boolean
          last_name: string | null
          name: string | null
          organization_id: string | null
          phone: string | null
          position: string | null
          updated_at: string
        }
        Insert: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_important?: boolean
          last_name?: string | null
          name?: string | null
          organization_id?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Update: {
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          first_name?: string | null
          id?: string
          is_important?: boolean
          last_name?: string | null
          name?: string | null
          organization_id?: string | null
          phone?: string | null
          position?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "contacts_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "contacts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      deals: {
        Row: {
          created_at: string
          created_by: string | null
          deleted_at: string | null
          expected_close_date: string | null
          id: string
          lead_id: string | null
          organization_id: string | null
          probability: number
          stage: Database["public"]["Enums"]["deal_stage_enum"]
          title: string
          updated_at: string
          value: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          probability?: number
          stage?: Database["public"]["Enums"]["deal_stage_enum"]
          title: string
          updated_at?: string
          value?: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          expected_close_date?: string | null
          id?: string
          lead_id?: string | null
          organization_id?: string | null
          probability?: number
          stage?: Database["public"]["Enums"]["deal_stage_enum"]
          title?: string
          updated_at?: string
          value?: number
        }
        Relationships: [
          {
            foreignKeyName: "deals_lead_id_fkey"
            columns: ["lead_id"]
            isOneToOne: false
            referencedRelation: "leads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deals_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      documents: {
        Row: {
          created_at: string
          entity_id: string
          entity_type: string
          file_path: string
          file_size: number
          id: string
          mime_type: string
          name: string
          organization_id: string | null
          uploaded_by: string | null
        }
        Insert: {
          created_at?: string
          entity_id: string
          entity_type: string
          file_path: string
          file_size?: number
          id?: string
          mime_type?: string
          name: string
          organization_id?: string | null
          uploaded_by?: string | null
        }
        Update: {
          created_at?: string
          entity_id?: string
          entity_type?: string
          file_path?: string
          file_size?: number
          id?: string
          mime_type?: string
          name?: string
          organization_id?: string | null
          uploaded_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "documents_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "documents_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      email_send_log: {
        Row: {
          event: string
          id: string
          sent_at: string
          user_id: string
        }
        Insert: {
          event: string
          id?: string
          sent_at?: string
          user_id: string
        }
        Update: {
          event?: string
          id?: string
          sent_at?: string
          user_id?: string
        }
        Relationships: []
      }
      integrations: {
        Row: {
          created_at: string
          created_by: string | null
          credentials: Json | null
          enabled: boolean
          id: string
          last_sync: string | null
          organization_id: string | null
          type: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          credentials?: Json | null
          enabled?: boolean
          id?: string
          last_sync?: string | null
          organization_id?: string | null
          type: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          credentials?: Json | null
          enabled?: boolean
          id?: string
          last_sync?: string | null
          organization_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "integrations_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "integrations_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      interns: {
        Row: {
          created_at: string
          created_by: string | null
          domain: string | null
          end_date: string | null
          id: string
          intern_name: string
          organization_id: string | null
          start_date: string | null
          status: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          domain?: string | null
          end_date?: string | null
          id?: string
          intern_name: string
          organization_id?: string | null
          start_date?: string | null
          status?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          domain?: string | null
          end_date?: string | null
          id?: string
          intern_name?: string
          organization_id?: string | null
          start_date?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "interns_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      investor_dashboard_config: {
        Row: {
          headline: string | null
          id: string
          organization_id: string | null
          updated_at: string
        }
        Insert: {
          headline?: string | null
          id?: string
          organization_id?: string | null
          updated_at?: string
        }
        Update: {
          headline?: string | null
          id?: string
          organization_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "investor_dashboard_config_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      invoices: {
        Row: {
          buyer_gstin: string | null
          company_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_date: string | null
          gst_type: string
          gstin: string | null
          id: string
          invoice_number: string
          items: Json
          notes: string | null
          organization_id: string | null
          paid_at: string | null
          project_id: string | null
          razorpay_payment_id: string | null
          razorpay_payment_link: string | null
          status: Database["public"]["Enums"]["invoice_status_enum"]
          stripe_payment_link: string | null
          stripe_session_id: string | null
          subtotal: number
          tax_amount: number
          tax_rate: number
          total: number
          updated_at: string
        }
        Insert: {
          buyer_gstin?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          gst_type?: string
          gstin?: string | null
          id?: string
          invoice_number: string
          items?: Json
          notes?: string | null
          organization_id?: string | null
          paid_at?: string | null
          project_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_payment_link?: string | null
          status?: Database["public"]["Enums"]["invoice_status_enum"]
          stripe_payment_link?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Update: {
          buyer_gstin?: string | null
          company_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_date?: string | null
          gst_type?: string
          gstin?: string | null
          id?: string
          invoice_number?: string
          items?: Json
          notes?: string | null
          organization_id?: string | null
          paid_at?: string | null
          project_id?: string | null
          razorpay_payment_id?: string | null
          razorpay_payment_link?: string | null
          status?: Database["public"]["Enums"]["invoice_status_enum"]
          stripe_payment_link?: string | null
          stripe_session_id?: string | null
          subtotal?: number
          tax_amount?: number
          tax_rate?: number
          total?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      leads: {
        Row: {
          ai_score: number | null
          assigned_to: string | null
          created_at: string
          created_by: string | null
          deleted_at: string | null
          email: string | null
          id: string
          is_important: boolean
          last_contacted_at: string | null
          name: string
          organization_id: string | null
          phone: string | null
          priority: string
          source: string | null
          status: Database["public"]["Enums"]["lead_status_enum"]
          updated_at: string
        }
        Insert: {
          ai_score?: number | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_important?: boolean
          last_contacted_at?: string | null
          name: string
          organization_id?: string | null
          phone?: string | null
          priority?: string
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status_enum"]
          updated_at?: string
        }
        Update: {
          ai_score?: number | null
          assigned_to?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          email?: string | null
          id?: string
          is_important?: boolean
          last_contacted_at?: string | null
          name?: string
          organization_id?: string | null
          phone?: string | null
          priority?: string
          source?: string | null
          status?: Database["public"]["Enums"]["lead_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "leads_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
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
          linked_activity_id: string | null
          location: string | null
          meeting_type: Database["public"]["Enums"]["meeting_type_enum"]
          mode: string
          notes: string | null
          organization_id: string | null
          start_time: string
          status: Database["public"]["Enums"]["meeting_status_enum"]
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
          linked_activity_id?: string | null
          location?: string | null
          meeting_type?: Database["public"]["Enums"]["meeting_type_enum"]
          mode?: string
          notes?: string | null
          organization_id?: string | null
          start_time: string
          status?: Database["public"]["Enums"]["meeting_status_enum"]
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
          linked_activity_id?: string | null
          location?: string | null
          meeting_type?: Database["public"]["Enums"]["meeting_type_enum"]
          mode?: string
          notes?: string | null
          organization_id?: string | null
          start_time?: string
          status?: Database["public"]["Enums"]["meeting_status_enum"]
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
          {
            foreignKeyName: "meetings_linked_activity_id_fkey"
            columns: ["linked_activity_id"]
            isOneToOne: false
            referencedRelation: "activities"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "meetings_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
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
          organization_id: string | null
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
          organization_id?: string | null
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
          organization_id?: string | null
          pinned?: boolean
          tag?: string
          title?: string
          visible_to_investors?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "notice_board_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string
          created_at: string
          event: string
          id: string
          is_read: boolean
          organization_id: string | null
          title: string
          user_id: string
        }
        Insert: {
          body: string
          created_at?: string
          event: string
          id?: string
          is_read?: boolean
          organization_id?: string | null
          title: string
          user_id: string
        }
        Update: {
          body?: string
          created_at?: string
          event?: string
          id?: string
          is_read?: boolean
          organization_id?: string | null
          title?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organizations: {
        Row: {
          created_at: string
          id: string
          max_users: number
          name: string
          plan: string
          slug: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_users?: number
          name: string
          plan?: string
          slug: string
        }
        Update: {
          created_at?: string
          id?: string
          max_users?: number
          name?: string
          plan?: string
          slug?: string
        }
        Relationships: []
      }
      outreach_tasks: {
        Row: {
          company_id: string | null
          contact_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          lead_id: string | null
          notes: string | null
          organization_id: string | null
          priority: string
          reminder: string
          status: string
          task_type: string
          title: string
        }
        Insert: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          organization_id?: string | null
          priority?: string
          reminder?: string
          status?: string
          task_type?: string
          title: string
        }
        Update: {
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          organization_id?: string | null
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
          {
            foreignKeyName: "outreach_tasks_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      outreach_templates: {
        Row: {
          body: string
          category: string | null
          created_at: string
          created_by: string | null
          id: string
          name: string
          organization_id: string | null
          subject: string | null
        }
        Insert: {
          body: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name: string
          organization_id?: string | null
          subject?: string | null
        }
        Update: {
          body?: string
          category?: string | null
          created_at?: string
          created_by?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          subject?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "outreach_templates_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          company: string | null
          company_id: string | null
          created_at: string
          email: string
          full_name: string | null
          id: string
          invited_by: string | null
          is_active: boolean
          job_title: string | null
          location: string | null
          notification_prefs: Json | null
          organization_id: string | null
          phone: string | null
          role: Database["public"]["Enums"]["app_role_enum"]
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string
          email: string
          full_name?: string | null
          id: string
          invited_by?: string | null
          is_active?: boolean
          job_title?: string | null
          location?: string | null
          notification_prefs?: Json | null
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role_enum"]
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          company?: string | null
          company_id?: string | null
          created_at?: string
          email?: string
          full_name?: string | null
          id?: string
          invited_by?: string | null
          is_active?: boolean
          job_title?: string | null
          location?: string | null
          notification_prefs?: Json | null
          organization_id?: string | null
          phone?: string | null
          role?: Database["public"]["Enums"]["app_role_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_company_id_fkey"
            columns: ["company_id"]
            isOneToOne: false
            referencedRelation: "companies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profiles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      project_tasks: {
        Row: {
          assignee_id: string | null
          created_at: string
          created_by: string | null
          description: string | null
          due_date: string | null
          id: string
          parent_task_id: string | null
          priority: string
          project_id: string
          sprint_id: string | null
          status: string
          story_points: number | null
          title: string
        }
        Insert: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: string
          project_id: string
          sprint_id?: string | null
          status?: string
          story_points?: number | null
          title: string
        }
        Update: {
          assignee_id?: string | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          due_date?: string | null
          id?: string
          parent_task_id?: string | null
          priority?: string
          project_id?: string
          sprint_id?: string | null
          status?: string
          story_points?: number | null
          title?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_tasks_assignee_id_fkey"
            columns: ["assignee_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_parent_task_id_fkey"
            columns: ["parent_task_id"]
            isOneToOne: false
            referencedRelation: "project_tasks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_tasks_sprint_id_fkey"
            columns: ["sprint_id"]
            isOneToOne: false
            referencedRelation: "sprints"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          budget: number | null
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          id: string
          name: string
          organization_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["project_status_enum"]
          updated_at: string
        }
        Insert: {
          budget?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name: string
          organization_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status_enum"]
          updated_at?: string
        }
        Update: {
          budget?: number | null
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["project_status_enum"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      saved_filters: {
        Row: {
          created_at: string
          entity: string
          filters: Json
          id: string
          name: string
          user_id: string
        }
        Insert: {
          created_at?: string
          entity: string
          filters: Json
          id?: string
          name: string
          user_id: string
        }
        Update: {
          created_at?: string
          entity?: string
          filters?: Json
          id?: string
          name?: string
          user_id?: string
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
      sprints: {
        Row: {
          created_at: string
          created_by: string | null
          end_date: string | null
          goal: string | null
          id: string
          name: string
          organization_id: string | null
          project_id: string | null
          start_date: string | null
          status: Database["public"]["Enums"]["sprint_status_enum"]
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          name: string
          organization_id?: string | null
          project_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["sprint_status_enum"]
        }
        Update: {
          created_at?: string
          created_by?: string | null
          end_date?: string | null
          goal?: string | null
          id?: string
          name?: string
          organization_id?: string | null
          project_id?: string | null
          start_date?: string | null
          status?: Database["public"]["Enums"]["sprint_status_enum"]
        }
        Relationships: [
          {
            foreignKeyName: "sprints_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprints_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sprints_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
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
          created_at: string
          created_by: string | null
          deleted_at: string | null
          description: string | null
          github_issue_url: string | null
          id: string
          lead_id: string | null
          notes: string | null
          organization_id: string | null
          priority: Database["public"]["Enums"]["ticket_priority_enum"]
          status: Database["public"]["Enums"]["ticket_status_enum"]
          title: string
          updated_at: string
        }
        Insert: {
          assigned_to_email?: string | null
          category?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          github_issue_url?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority_enum"]
          status?: Database["public"]["Enums"]["ticket_status_enum"]
          title: string
          updated_at?: string
        }
        Update: {
          assigned_to_email?: string | null
          category?: string | null
          company_id?: string | null
          contact_id?: string | null
          created_at?: string
          created_by?: string | null
          deleted_at?: string | null
          description?: string | null
          github_issue_url?: string | null
          id?: string
          lead_id?: string | null
          notes?: string | null
          organization_id?: string | null
          priority?: Database["public"]["Enums"]["ticket_priority_enum"]
          status?: Database["public"]["Enums"]["ticket_status_enum"]
          title?: string
          updated_at?: string
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
          {
            foreignKeyName: "tickets_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      time_entries: {
        Row: {
          created_at: string
          description: string | null
          duration_minutes: number | null
          end_time: string | null
          id: string
          is_billable: boolean
          organization_id: string | null
          project_id: string | null
          start_time: string
          user_id: string
        }
        Insert: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          is_billable?: boolean
          organization_id?: string | null
          project_id?: string | null
          start_time?: string
          user_id: string
        }
        Update: {
          created_at?: string
          description?: string | null
          duration_minutes?: number | null
          end_time?: string | null
          id?: string
          is_billable?: boolean
          organization_id?: string | null
          project_id?: string | null
          start_time?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "time_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "time_entries_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_mfa_backup_codes: {
        Row: {
          code_hash: string
          created_at: string
          id: string
          used_at: string | null
          user_id: string
        }
        Insert: {
          code_hash: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id: string
        }
        Update: {
          code_hash?: string
          created_at?: string
          id?: string
          used_at?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_mfa_secrets: {
        Row: {
          created_at: string
          encrypted_secret: string
          failed_attempts: number
          id: string
          is_verified: boolean
          locked_until: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          encrypted_secret: string
          failed_attempts?: number
          id?: string
          is_verified?: boolean
          locked_until?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          encrypted_secret?: string
          failed_attempts?: number
          id?: string
          is_verified?: boolean
          locked_until?: string | null
          user_id?: string
        }
        Relationships: []
      }
      user_trusted_devices: {
        Row: {
          created_at: string
          expires_at: string
          id: string
          token_hash: string
          user_id: string
        }
        Insert: {
          created_at?: string
          expires_at: string
          id?: string
          token_hash: string
          user_id: string
        }
        Update: {
          created_at?: string
          expires_at?: string
          id?: string
          token_hash?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      ai_rate_limit_check: {
        Row: {
          feature: string | null
          requests_last_hour: number | null
          user_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      org_id: { Args: never; Returns: string }
    }
    Enums: {
      activity_status_enum: "scheduled" | "completed" | "cancelled"
      activity_type_enum: "call" | "meeting" | "follow_up" | "email"
      app_role_enum: "admin" | "manager" | "user" | "investor" | "client"
      deal_stage_enum:
        | "new_lead"
        | "contacted"
        | "meeting_scheduled"
        | "proposal"
        | "negotiation"
        | "won"
        | "lost"
      invoice_status_enum: "draft" | "sent" | "paid" | "overdue"
      lead_status_enum: "new" | "contacted" | "qualified" | "unqualified"
      meeting_status_enum:
        | "scheduled"
        | "completed"
        | "cancelled"
        | "no_show"
        | "active"
        | "on_hold"
      meeting_type_enum:
        | "discovery"
        | "demo"
        | "follow_up"
        | "check_in"
        | "internal"
        | "other"
      project_status_enum: "active" | "completed" | "on_hold"
      sprint_status_enum: "planning" | "active" | "completed"
      ticket_priority_enum: "low" | "medium" | "high" | "urgent"
      ticket_status_enum: "open" | "in_progress" | "resolved" | "closed"
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
      activity_status_enum: ["scheduled", "completed", "cancelled"],
      activity_type_enum: ["call", "meeting", "follow_up", "email"],
      app_role_enum: ["admin", "manager", "user", "investor", "client"],
      deal_stage_enum: [
        "new_lead",
        "contacted",
        "meeting_scheduled",
        "proposal",
        "negotiation",
        "won",
        "lost",
      ],
      invoice_status_enum: ["draft", "sent", "paid", "overdue"],
      lead_status_enum: ["new", "contacted", "qualified", "unqualified"],
      meeting_status_enum: [
        "scheduled",
        "completed",
        "cancelled",
        "no_show",
        "active",
        "on_hold",
      ],
      meeting_type_enum: [
        "discovery",
        "demo",
        "follow_up",
        "check_in",
        "internal",
        "other",
      ],
      project_status_enum: ["active", "completed", "on_hold"],
      sprint_status_enum: ["planning", "active", "completed"],
      ticket_priority_enum: ["low", "medium", "high", "urgent"],
      ticket_status_enum: ["open", "in_progress", "resolved", "closed"],
    },
  },
} as const
