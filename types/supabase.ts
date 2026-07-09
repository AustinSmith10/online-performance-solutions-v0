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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      app_settings: {
        Row: {
          key: string
          updated_at: string
          updated_by: string | null
          value: Json
        }
        Insert: {
          key: string
          updated_at?: string
          updated_by?: string | null
          value: Json
        }
        Update: {
          key?: string
          updated_at?: string
          updated_by?: string | null
          value?: Json
        }
        Relationships: [
          {
            foreignKeyName: "app_settings_updated_by_fkey"
            columns: ["updated_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_log: {
        Row: {
          actor_email: string | null
          actor_id: string | null
          client_id: string | null
          created_at: string
          event_type: string
          id: string
          metadata: Json | null
          project_id: string | null
        }
        Insert: {
          actor_email?: string | null
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json | null
          project_id?: string | null
        }
        Update: {
          actor_email?: string | null
          actor_id?: string | null
          client_id?: string | null
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_actor_id_fkey"
            columns: ["actor_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_org_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "audit_log_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      bounce_events: {
        Row: {
          created_at: string
          email: string
          id: string
          project_id: string | null
          raw_payload: Json | null
          reason: string | null
          resolved_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          project_id?: string | null
          raw_payload?: Json | null
          reason?: string | null
          resolved_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          project_id?: string | null
          raw_payload?: Json | null
          reason?: string | null
          resolved_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bounce_events_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      client_metrics_columns: {
        Row: {
          created_at: string
          data_type: string
          id: string
          name: string
          position: number
          table_id: string
        }
        Insert: {
          created_at?: string
          data_type: string
          id?: string
          name: string
          position?: number
          table_id: string
        }
        Update: {
          created_at?: string
          data_type?: string
          id?: string
          name?: string
          position?: number
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_metrics_columns_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "client_metrics_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      client_metrics_output_mappings: {
        Row: {
          created_at: string
          id: string
          output_column_id: string
          output_token: string
          table_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          output_column_id: string
          output_token: string
          table_id: string
        }
        Update: {
          created_at?: string
          id?: string
          output_column_id?: string
          output_token?: string
          table_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_metrics_output_mappings_output_column_id_fkey"
            columns: ["output_column_id"]
            isOneToOne: false
            referencedRelation: "client_metrics_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_metrics_output_mappings_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "client_metrics_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      client_metrics_rows: {
        Row: {
          created_at: string
          data: Json
          id: string
          table_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          data?: Json
          id?: string
          table_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: string
          table_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_metrics_rows_table_id_fkey"
            columns: ["table_id"]
            isOneToOne: false
            referencedRelation: "client_metrics_tables"
            referencedColumns: ["id"]
          },
        ]
      }
      client_metrics_tables: {
        Row: {
          autofill_enabled: boolean
          client_id: string
          created_at: string
          id: string
          match_column_id: string | null
          match_token: string | null
          name: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          autofill_enabled?: boolean
          client_id: string
          created_at?: string
          id?: string
          match_column_id?: string | null
          match_token?: string | null
          name: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          autofill_enabled?: boolean
          client_id?: string
          created_at?: string
          id?: string
          match_column_id?: string | null
          match_token?: string | null
          name?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "client_metrics_tables_client_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_metrics_tables_match_column_id_fkey"
            columns: ["match_column_id"]
            isOneToOne: false
            referencedRelation: "client_metrics_columns"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "client_metrics_tables_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      clients: {
        Row: {
          abandoned_draft_days: number
          accept_window_working_days: number
          client_config: Json
          created_at: string
          credit_balance: number
          credit_limit: number
          deferred_balance: number
          deleted_at: string | null
          delivery_working_days: number
          email_whitelist: string[]
          id: string
          is_frozen: boolean
          name: string
          payment_method: string
          revision_notes_required: boolean
          show_consultant_name: boolean
          slug: string
          state_territory: string | null
          updated_at: string
        }
        Insert: {
          abandoned_draft_days?: number
          accept_window_working_days?: number
          client_config?: Json
          created_at?: string
          credit_balance?: number
          credit_limit?: number
          deferred_balance?: number
          deleted_at?: string | null
          delivery_working_days?: number
          email_whitelist?: string[]
          id?: string
          is_frozen?: boolean
          name: string
          payment_method: string
          revision_notes_required?: boolean
          show_consultant_name?: boolean
          slug: string
          state_territory?: string | null
          updated_at?: string
        }
        Update: {
          abandoned_draft_days?: number
          accept_window_working_days?: number
          client_config?: Json
          created_at?: string
          credit_balance?: number
          credit_limit?: number
          deferred_balance?: number
          deleted_at?: string | null
          delivery_working_days?: number
          email_whitelist?: string[]
          id?: string
          is_frozen?: boolean
          name?: string
          payment_method?: string
          revision_notes_required?: boolean
          show_consultant_name?: boolean
          slug?: string
          state_territory?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      credit_ledger: {
        Row: {
          amount: number
          balance_after: number
          client_id: string
          created_at: string
          event_type: Database["public"]["Enums"]["credit_event_type"]
          id: string
          notes: string | null
          performed_by: string | null
          project_id: string | null
        }
        Insert: {
          amount: number
          balance_after: number
          client_id: string
          created_at?: string
          event_type: Database["public"]["Enums"]["credit_event_type"]
          id?: string
          notes?: string | null
          performed_by?: string | null
          project_id?: string | null
        }
        Update: {
          amount?: number
          balance_after?: number
          client_id?: string
          created_at?: string
          event_type?: Database["public"]["Enums"]["credit_event_type"]
          id?: string
          notes?: string | null
          performed_by?: string | null
          project_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "credit_ledger_org_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_performed_by_fkey"
            columns: ["performed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "credit_ledger_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      field_flags: {
        Row: {
          candidate_values: Json
          created_at: string
          current_value: string
          field_key: string
          id: string
          project_id: string
          resolution_method: string | null
          resolved_at: string | null
          resolved_by: string | null
          status: string
          type: string
        }
        Insert: {
          candidate_values?: Json
          created_at?: string
          current_value?: string
          field_key: string
          id?: string
          project_id: string
          resolution_method?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          type?: string
        }
        Update: {
          candidate_values?: Json
          created_at?: string
          current_value?: string
          field_key?: string
          id?: string
          project_id?: string
          resolution_method?: string | null
          resolved_at?: string | null
          resolved_by?: string | null
          status?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "field_flags_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "field_flags_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      file_requirements: {
        Row: {
          created_at: string
          extraction: boolean
          id: string
          max_count: number
          name: string
          no_duplicates: boolean
          required: boolean
          slug: string
          sort_order: number
          template_id: string
        }
        Insert: {
          created_at?: string
          extraction?: boolean
          id?: string
          max_count?: number
          name: string
          no_duplicates?: boolean
          required?: boolean
          slug: string
          sort_order?: number
          template_id: string
        }
        Update: {
          created_at?: string
          extraction?: boolean
          id?: string
          max_count?: number
          name?: string
          no_duplicates?: boolean
          required?: boolean
          slug?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "file_requirements_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          created_at: string
          id: string
          is_read: boolean
          message: string
          project_id: string | null
          recipient_id: string
          type: string
        }
        Insert: {
          created_at?: string
          id?: string
          is_read?: boolean
          message: string
          project_id?: string | null
          recipient_id: string
          type: string
        }
        Update: {
          created_at?: string
          id?: string
          is_read?: boolean
          message?: string
          project_id?: string | null
          recipient_id?: string
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "notifications_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notifications_recipient_id_fkey"
            columns: ["recipient_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      project_files: {
        Row: {
          created_at: string
          file_type: string
          id: string
          original_filename: string
          project_id: string
          reference: string | null
          review_cycle: number
          storage_path: string
          uploaded_by: string
          version: number
        }
        Insert: {
          created_at?: string
          file_type: string
          id?: string
          original_filename: string
          project_id: string
          reference?: string | null
          review_cycle?: number
          storage_path: string
          uploaded_by: string
          version?: number
        }
        Update: {
          created_at?: string
          file_type?: string
          id?: string
          original_filename?: string
          project_id?: string
          reference?: string | null
          review_cycle?: number
          storage_path?: string
          uploaded_by?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_files_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "project_files_uploaded_by_fkey"
            columns: ["uploaded_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          accept_overdue_alert_fired_at: string | null
          accepted_at: string | null
          assigned_consultant_id: string | null
          client_id: string
          created_at: string
          credit_deducted: boolean
          deleted_at: string | null
          delivered_at: string | null
          delivery_recipient_email: string | null
          expected_delivery_date: string | null
          extracted_fields: Json | null
          first_response_at: string | null
          id: string
          pause_reason: string | null
          paused_at: string | null
          paused_previous_status: string | null
          payment_override: boolean
          payment_override_at: string | null
          payment_override_by: string | null
          payment_override_reason: string | null
          pbdb_downloaded_at: string | null
          po_number: string | null
          project_number: string | null
          qa_completed_by: string | null
          review_buffer_fired_at: string | null
          review_cycle: number
          site_address: string | null
          source: string
          status: string
          strip_token_color: boolean
          submitted_by: string
          template_id: string | null
          updated_at: string
        }
        Insert: {
          accept_overdue_alert_fired_at?: string | null
          accepted_at?: string | null
          assigned_consultant_id?: string | null
          client_id: string
          created_at?: string
          credit_deducted?: boolean
          deleted_at?: string | null
          delivered_at?: string | null
          delivery_recipient_email?: string | null
          expected_delivery_date?: string | null
          extracted_fields?: Json | null
          first_response_at?: string | null
          id?: string
          pause_reason?: string | null
          paused_at?: string | null
          paused_previous_status?: string | null
          payment_override?: boolean
          payment_override_at?: string | null
          payment_override_by?: string | null
          payment_override_reason?: string | null
          pbdb_downloaded_at?: string | null
          po_number?: string | null
          project_number?: string | null
          qa_completed_by?: string | null
          review_buffer_fired_at?: string | null
          review_cycle?: number
          site_address?: string | null
          source?: string
          status?: string
          strip_token_color?: boolean
          submitted_by: string
          template_id?: string | null
          updated_at?: string
        }
        Update: {
          accept_overdue_alert_fired_at?: string | null
          accepted_at?: string | null
          assigned_consultant_id?: string | null
          client_id?: string
          created_at?: string
          credit_deducted?: boolean
          deleted_at?: string | null
          delivered_at?: string | null
          delivery_recipient_email?: string | null
          expected_delivery_date?: string | null
          extracted_fields?: Json | null
          first_response_at?: string | null
          id?: string
          pause_reason?: string | null
          paused_at?: string | null
          paused_previous_status?: string | null
          payment_override?: boolean
          payment_override_at?: string | null
          payment_override_by?: string | null
          payment_override_reason?: string | null
          pbdb_downloaded_at?: string | null
          po_number?: string | null
          project_number?: string | null
          qa_completed_by?: string | null
          review_buffer_fired_at?: string | null
          review_cycle?: number
          site_address?: string | null
          source?: string
          status?: string
          strip_token_color?: boolean
          submitted_by?: string
          template_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "projects_assigned_consultant_id_fkey"
            columns: ["assigned_consultant_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_org_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_payment_override_by_fkey"
            columns: ["payment_override_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_qa_completed_by_fkey"
            columns: ["qa_completed_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_submitted_by_fkey"
            columns: ["submitted_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "projects_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      public_holiday_cache: {
        Row: {
          fetched_at: string
          holidays: Json
          state_territory: string
          year: number
        }
        Insert: {
          fetched_at?: string
          holidays?: Json
          state_territory: string
          year: number
        }
        Update: {
          fetched_at?: string
          holidays?: Json
          state_territory?: string
          year?: number
        }
        Relationships: []
      }
      resolved_signals: {
        Row: {
          resolved_at: string
          resolved_by: string | null
          signal_id: string
        }
        Insert: {
          resolved_at?: string
          resolved_by?: string | null
          signal_id: string
        }
        Update: {
          resolved_at?: string
          resolved_by?: string | null
          signal_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "resolved_signals_resolved_by_fkey"
            columns: ["resolved_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      revision_notes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          note: string
          project_id: string
          review_cycle: number
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          note: string
          project_id: string
          review_cycle: number
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          note?: string
          project_id?: string
          review_cycle?: number
        }
        Relationships: [
          {
            foreignKeyName: "revision_notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "revision_notes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      stakeholder_reviews: {
        Row: {
          comments: string | null
          created_at: string
          dispatched_at: string
          expires_at: string
          fresh_token_sent_at: string | null
          id: string
          project_id: string
          responded_at: string | null
          review_cycle: number
          stakeholder_email: string
          stakeholder_name: string
          status: string
          token: string
          waive_reason: string | null
          waived_at: string | null
          waived_by: string | null
        }
        Insert: {
          comments?: string | null
          created_at?: string
          dispatched_at?: string
          expires_at: string
          fresh_token_sent_at?: string | null
          id?: string
          project_id: string
          responded_at?: string | null
          review_cycle?: number
          stakeholder_email: string
          stakeholder_name: string
          status?: string
          token: string
          waive_reason?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Update: {
          comments?: string | null
          created_at?: string
          dispatched_at?: string
          expires_at?: string
          fresh_token_sent_at?: string | null
          id?: string
          project_id?: string
          responded_at?: string | null
          review_cycle?: number
          stakeholder_email?: string
          stakeholder_name?: string
          status?: string
          token?: string
          waive_reason?: string | null
          waived_at?: string | null
          waived_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "stakeholder_reviews_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stakeholder_reviews_waived_by_fkey"
            columns: ["waived_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      stakeholders: {
        Row: {
          company: string | null
          created_at: string
          deleted_at: string | null
          email: string
          id: string
          is_active: boolean
          metadata: Json
          name: string
          scope: string
          scope_id: string
          sort_order: number
        }
        Insert: {
          company?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name: string
          scope: string
          scope_id: string
          sort_order?: number
        }
        Update: {
          company?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          id?: string
          is_active?: boolean
          metadata?: Json
          name?: string
          scope?: string
          scope_id?: string
          sort_order?: number
        }
        Relationships: []
      }
      template_field_mappings: {
        Row: {
          client_sort_order: number
          client_visible: boolean
          created_at: string
          display_label: string | null
          extraction_hint: string | null
          field_key: string | null
          id: string
          in_template: boolean
          is_mapped: boolean
          is_required: boolean
          placeholder_token: string
          sort_order: number
          template_id: string
        }
        Insert: {
          client_sort_order?: number
          client_visible?: boolean
          created_at?: string
          display_label?: string | null
          extraction_hint?: string | null
          field_key?: string | null
          id?: string
          in_template?: boolean
          is_mapped?: boolean
          is_required?: boolean
          placeholder_token: string
          sort_order?: number
          template_id: string
        }
        Update: {
          client_sort_order?: number
          client_visible?: boolean
          created_at?: string
          display_label?: string | null
          extraction_hint?: string | null
          field_key?: string | null
          id?: string
          in_template?: boolean
          is_mapped?: boolean
          is_required?: boolean
          placeholder_token?: string
          sort_order?: number
          template_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "template_field_mappings_template_id_fkey"
            columns: ["template_id"]
            isOneToOne: false
            referencedRelation: "templates"
            referencedColumns: ["id"]
          },
        ]
      }
      templates: {
        Row: {
          client_id: string
          created_at: string
          created_by: string
          deleted_at: string | null
          id: string
          name: string
          section_labels: Json
          status: string
          storage_path: string
        }
        Insert: {
          client_id: string
          created_at?: string
          created_by: string
          deleted_at?: string | null
          id?: string
          name: string
          section_labels?: Json
          status?: string
          storage_path: string
        }
        Update: {
          client_id?: string
          created_at?: string
          created_by?: string
          deleted_at?: string | null
          id?: string
          name?: string
          section_labels?: Json
          status?: string
          storage_path?: string
        }
        Relationships: [
          {
            foreignKeyName: "templates_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "templates_org_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          availability: Database["public"]["Enums"]["consultant_availability"]
          client_id: string | null
          company_role: string | null
          created_at: string
          deleted_at: string | null
          email: string
          failed_login_count: number
          first_name: string | null
          id: string
          invited_at: string | null
          is_active: boolean
          is_locked: boolean
          last_name: string | null
          phone: string | null
          profile_complete: boolean
          role: Database["public"]["Enums"]["user_role"]
          state_territory: string | null
          totp_enabled: boolean
        }
        Insert: {
          availability?: Database["public"]["Enums"]["consultant_availability"]
          client_id?: string | null
          company_role?: string | null
          created_at?: string
          deleted_at?: string | null
          email: string
          failed_login_count?: number
          first_name?: string | null
          id: string
          invited_at?: string | null
          is_active?: boolean
          is_locked?: boolean
          last_name?: string | null
          phone?: string | null
          profile_complete?: boolean
          role: Database["public"]["Enums"]["user_role"]
          state_territory?: string | null
          totp_enabled?: boolean
        }
        Update: {
          availability?: Database["public"]["Enums"]["consultant_availability"]
          client_id?: string | null
          company_role?: string | null
          created_at?: string
          deleted_at?: string | null
          email?: string
          failed_login_count?: number
          first_name?: string | null
          id?: string
          invited_at?: string | null
          is_active?: boolean
          is_locked?: boolean
          last_name?: string | null
          phone?: string | null
          profile_complete?: boolean
          role?: Database["public"]["Enums"]["user_role"]
          state_territory?: string | null
          totp_enabled?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "users_org_id_fkey"
            columns: ["client_id"]
            isOneToOne: false
            referencedRelation: "clients"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      admin_delete_client: { Args: { p_org_id: string }; Returns: undefined }
      admin_delete_user: { Args: { p_user_id: string }; Returns: undefined }
      get_failed_jobs: {
        Args: never
        Returns: {
          completed_on: string
          created_on: string
          data: Json
          id: string
          name: string
          output: Json
          retry_count: number
          retry_limit: number
        }[]
      }
      purge_project: { Args: { p_project_id: string }; Returns: undefined }
      restore_client: { Args: { p_client_id: string }; Returns: undefined }
      soft_delete_client: { Args: { p_client_id: string }; Returns: undefined }
    }
    Enums: {
      consultant_availability: "available" | "on_leave" | "at_capacity"
      credit_event_type:
        | "top_up"
        | "deduction"
        | "deferred_debit"
        | "upfront_log"
        | "override"
      user_role: "super_admin" | "admin" | "consultant" | "stakeholder"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      consultant_availability: ["available", "on_leave", "at_capacity"],
      credit_event_type: [
        "top_up",
        "deduction",
        "deferred_debit",
        "upfront_log",
        "override",
      ],
      user_role: ["super_admin", "admin", "consultant", "stakeholder"],
    },
  },
} as const
