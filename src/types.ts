export type TransactionType = 'income' | 'expense';

export interface Category {
  id?: string;
  name: string;
  type: TransactionType;
  icon: string;
  color: string;
}

export interface Transaction {
  id?: string;
  category_id: string;
  amount: number;
  type: TransactionType;
  date: number;
  note: string;
  is_split_pending?: boolean;
  split_with_people_count?: number;
  final_my_share?: number;
  debt_id?: string;
}

export interface Budget {
  category_id?: string;
  percentage: number;
  limit_amount: number;
}

export interface DebtInstallment {
  id?: string;
  name: string;
  total_amount: number;
  paid_amount: number;
  monthly_payment: number;
  term_months: number;
  start_date: number;
  type: 'debt' | 'loan' | 'installment';
}
