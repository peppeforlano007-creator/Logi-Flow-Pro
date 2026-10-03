export interface SupplierFile {
  id: string;
  file_name: string;
  original_format: 'csv' | 'xlsx';
  status: 'imported' | 'receiving' | 'received' | 'processing' | 'completed';
  column_headers: string[];
  extra_columns: string[];
  imported_at: string;
  received_at: string | null;
  completed_at: string | null;
  imported_by: string | null;
  notes: string | null;
}

export interface SupplierItem {
  id: string;
  file_id: string;
  row_index: number;
  item_code: string;
  original_data: Record<string, string>;
  extra_data: Record<string, string>;
  status: 'pending' | 'processing' | 'completed';
  processed_at: string | null;
  processed_by: string | null;
  created_at: string;
}

export interface ReceptionLog {
  id: string;
  file_id: string;
  boxes_received: number;
  received_at: string;
  received_by: string | null;
  notes: string | null;
}
