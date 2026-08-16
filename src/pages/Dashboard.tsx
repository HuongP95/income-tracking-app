import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { 
  subscribeToCategories, 
  subscribeToDebts, 
  subscribeToTransactions,
  subscribeToBudgets,
  subscribeToSettlementConfig,
  subscribeToCustomCycles,
  subscribeToSavings
} from '../lib/db';
import { Category, DebtInstallment, Transaction, Budget as BudgetType, CustomCycle, SavingTransaction } from '../types';
import { 
  PlusCircle, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Info, 
  PiggyBank,
  Eye,
  EyeOff
} from 'lucide-react';
import { isWithinInterval } from 'date-fns';
import { formatCurrency, getCurrentPeriod, isDateWithinIntervalSafely } from '../lib/utils';
import { CardSkeleton } from '../components/Skeleton';

export default function Dashboard({ 
  user,
  settlementConfigProp,
  customCyclesProp,
  transactionsProp,
  budgetsProp
}: { 
  user: User;
  settlementConfigProp?: { settlement_day: number; mode: 'fixed' | 'flexible' };
  customCyclesProp?: CustomCycle[];
  transactionsProp?: Transaction[];
  budgetsProp?: BudgetType[];
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [debts, setDebts] = useState<DebtInstallment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>(transactionsProp || []);
  const [savings, setSavings] = useState<SavingTransaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetType[]>(budgetsProp || []);
  const [settlementConfig, setSettlementConfig] = useState<{ settlement_day: number; mode: 'fixed' | 'flexible' }>(
    settlementConfigProp || { settlement_day: 1, mode: 'fixed' }
  );
  const [customCycles, setCustomCycles] = useState<CustomCycle[]>(customCyclesProp || []);
  const [loading, setLoading] = useState(true);

  // Per-card visibility state (persisted to localStorage)
  const [cardVisibility, setCardVisibility] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('finly_dashboard_card_visibility');
      if (saved) return JSON.parse(saved);
    } catch {}
    return {
      balance: true,
      savings: true,
      loans: true,
      debts: true,
    };
  });

  const toggleCardVisibility = (key: string) => {
    setCardVisibility(prev => {
      const next = { ...prev, [key]: !prev[key] };
      try {
        localStorage.setItem('finly_dashboard_card_visibility', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  useEffect(() => {
    if (settlementConfigProp) setSettlementConfig(settlementConfigProp);
  }, [settlementConfigProp]);

  useEffect(() => {
    if (customCyclesProp) setCustomCycles(customCyclesProp);
  }, [customCyclesProp]);

  useEffect(() => {
    if (transactionsProp) setTransactions(transactionsProp);
  }, [transactionsProp]);

  useEffect(() => {
    if (budgetsProp) setBudgets(budgetsProp);
  }, [budgetsProp]);

  useEffect(() => {
    let loadedC = false, loadedD = false, loadedT = false, loadedB = false, loadedS = false, loadedCy = false, loadedSav = false;
    const checkLoaded = () => {
      if (loadedC && loadedD && loadedT && loadedB && loadedS && loadedCy && loadedSav) {
        setLoading(false);
      }
    };

    const unsubC = subscribeToCategories(user.uid, (data) => { setCategories(data); loadedC = true; checkLoaded(); });
    const unsubD = subscribeToDebts(user.uid, (data) => { setDebts(data); loadedD = true; checkLoaded(); });
    const unsubT = subscribeToTransactions(user.uid, (data) => { setTransactions(data); loadedT = true; checkLoaded(); });
    const unsubB = subscribeToBudgets(user.uid, (data) => { setBudgets(data); loadedB = true; checkLoaded(); });
    const unsubS = subscribeToSettlementConfig(user.uid, (data) => { setSettlementConfig(data); loadedS = true; checkLoaded(); });
    const unsubCy = subscribeToCustomCycles(user.uid, (data) => { setCustomCycles(data); loadedCy = true; checkLoaded(); });
    const unsubSav = subscribeToSavings(user.uid, (data) => { setSavings(data); loadedSav = true; checkLoaded(); });

    // Safety fallback timer to prevent indefinite loading
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => {
      unsubC();
      unsubD();
      unsubT();
      unsubB();
      unsubS();
      unsubCy();
      unsubSav();
      clearTimeout(safetyTimer);
    };
  }, [user.uid]);

  // Current Settlement Period
  const period = useMemo(() => {
    return getCurrentPeriod(settlementConfig, customCycles);
  }, [settlementConfig, customCycles]);

  // Total savings balance
  const totalSavingsBalance = useMemo(() => {
    return savings.reduce((acc, s) => {
      const amt = Number(s.amount) || 0;
      if (s.type === 'deposit') return acc + amt;
      return acc - amt;
    }, 0);
  }, [savings]);

  // Calculate total transactions and cash balance (all time)
  const cashStats = useMemo(() => {
    let income = 0;
    let expense = 0;
    transactions.forEach(t => {
      if (t.is_split_pending) return;
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') income += amt;
      else expense += amt;
    });
    return { income, expense, balance: income - expense };
  }, [transactions]);

  // Calculate outstanding loans and debts
  const debtStats = useMemo(() => {
    let outstandingLoans = 0;
    let outstandingDebts = 0;

    debts.forEach(d => {
      const debtTxs = transactions.filter(t => t.debt_id === d.id);
      const computedPaid = debtTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const totalAmt = Number(d.total_amount) || 0;
      const remaining = totalAmt - computedPaid;
      if (d.type === 'loan') {
        outstandingLoans += Math.max(0, remaining);
      } else {
        outstandingDebts += Math.max(0, remaining);
      }
    });

    const adjustedBalance = cashStats.balance - totalSavingsBalance - outstandingDebts;

    return {
      outstandingLoans,
      outstandingDebts,
      adjustedBalance
    };
  }, [debts, transactions, cashStats, totalSavingsBalance]);

  // Budget Overruns calculation
  const budgetOverruns = useMemo(() => {
    if (budgets.length === 0) return [];
    
    // Filter this month's transactions safely
    const { start, end } = period;
    const monthExpenseTxs = transactions.filter(t => 
      t.type === 'expense' && 
      !t.is_split_pending && 
      isDateWithinIntervalSafely(t.date, start, end)
    );

    // Sum expenses by category
    const totals: Record<string, number> = {};
    monthExpenseTxs.forEach(t => {
      const amt = Number(t.amount) || 0;
      totals[t.category_id] = (totals[t.category_id] || 0) + amt;
    });

    // Check for overruns
    const overruns: { categoryName: string; spent: number; limit: number; excess: number }[] = [];
    budgets.forEach(b => {
      const limitAmt = Number(b.limit_amount) || 0;
      const spent = totals[b.category_id || ''] || 0;
      if (limitAmt > 0 && spent > limitAmt) {
        const cat = categories.find(c => c.id === b.category_id);
        if (cat) {
          overruns.push({
            categoryName: cat.name,
            spent,
            limit: limitAmt,
            excess: spent - limitAmt
          });
        }
      }
    });

    return overruns;
  }, [budgets, transactions, categories, period]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-slate-100 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-amber-950 leading-none flex items-center gap-2">
            Tổng quan <span className="text-2xl">🐾</span>
          </h1>
          <p className="text-xs sm:text-sm text-amber-800/80 font-bold mt-1.5">
            Xem nhanh tình hình tài chính tổng thể cùng bé Coin nha! ✨
          </p>
        </div>
      </div>

      {/* SECTION: OVERVIEW CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Adjusted Balance Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FEFCE8] via-[#FEF9C3] to-[#FEF08A] p-5 shadow-sm border-2 border-yellow-300/80 flex flex-col justify-between min-h-[120px] group transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-default">
          <div className="absolute inset-0 bg-gradient-radial from-amber-500/5 to-transparent opacity-60 pointer-events-none" />
          <div className="absolute -right-2 -bottom-2 opacity-[0.08] transform group-hover:scale-110 transition-transform duration-300">
            <Wallet className="w-24 h-24 text-amber-950" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-amber-800/95 flex items-center gap-1">Số dư khả dụng 🪙</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleCardVisibility('balance'); }}
                  className="p-1 rounded-lg hover:bg-amber-950/10 text-amber-800 transition-colors cursor-pointer"
                  title={cardVisibility.balance ? "Ẩn số tiền này" : "Hiện số tiền này"}
                >
                  {cardVisibility.balance ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <div className="p-1 rounded-lg bg-amber-950/5 text-amber-700">
                  <Wallet className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-slate-900 tabular-nums">
              {cardVisibility.balance ? formatCurrency(debtStats.adjustedBalance) : '••••••••'}
            </p>
          </div>
          <p className="text-[10px] text-amber-900/90 mt-3 flex items-center gap-1.5 leading-tight relative z-10 font-bold">
            <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
            <span>Đã khấu trừ khoản tiết kiệm & công nợ.</span>
          </p>
        </div>

        {/* Savings Balance Card */}
        <div 
          onClick={() => window.dispatchEvent(new CustomEvent('finly_change_tab', { detail: { tab: 'savings_debts', subTab: 'savings' } }))}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FDF4FF] via-[#FAE8FF] to-[#F5D0FE] p-5 shadow-sm border-2 border-fuchsia-300/60 flex flex-col justify-between min-h-[120px] group transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-pointer"
        >
          <div className="absolute -right-2 -bottom-2 opacity-[0.08] transform group-hover:scale-110 transition-transform duration-300">
            <PiggyBank className="w-24 h-24 text-fuchsia-950" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-fuchsia-800/95 flex items-center gap-1">Hũ tiết kiệm 🐷</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleCardVisibility('savings'); }}
                  className="p-1 rounded-lg hover:bg-fuchsia-950/10 text-fuchsia-800 transition-colors cursor-pointer"
                  title={cardVisibility.savings ? "Ẩn số tiền này" : "Hiện số tiền này"}
                >
                  {cardVisibility.savings ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <div className="p-1 rounded-lg bg-fuchsia-950/5 text-fuchsia-700">
                  <PiggyBank className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-fuchsia-950 tabular-nums">
              {cardVisibility.savings ? formatCurrency(totalSavingsBalance) : '••••••••'}
            </p>
          </div>
          <p className="text-[10px] text-fuchsia-900/80 mt-3 font-bold leading-tight relative z-10">
            Số tiền trong các hũ tiết kiệm.
          </p>
        </div>

        {/* Outstanding Loans */}
        <div 
          onClick={() => window.dispatchEvent(new CustomEvent('finly_change_tab', { detail: { tab: 'savings_debts', subTab: 'debts' } }))}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#F0FDF4] via-[#DCFCE7] to-[#BBF7D0] p-5 shadow-sm border-2 border-emerald-300/60 flex flex-col justify-between min-h-[120px] group transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-pointer"
        >
          <div className="absolute -right-2 -bottom-2 opacity-[0.06] transform group-hover:scale-110 transition-transform duration-300">
            <ArrowUpRight className="w-24 h-24 text-emerald-950" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-800/95 flex items-center gap-1">Cho vay chưa thu 🍀</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleCardVisibility('loans'); }}
                  className="p-1 rounded-lg hover:bg-emerald-950/10 text-emerald-800 transition-colors cursor-pointer"
                  title={cardVisibility.loans ? "Ẩn số tiền này" : "Hiện số tiền này"}
                >
                  {cardVisibility.loans ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <div className="p-1 rounded-lg bg-emerald-950/5 text-emerald-700">
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-emerald-900 tabular-nums">
              {cardVisibility.loans ? formatCurrency(debtStats.outstandingLoans) : '••••••••'}
            </p>
          </div>
          <p className="text-[10px] text-emerald-850/80 mt-3 font-bold leading-tight relative z-10">
            Sẽ cộng về ví khi nhận lại nha.
          </p>
        </div>

        {/* Outstanding Debts */}
        <div 
          onClick={() => window.dispatchEvent(new CustomEvent('finly_change_tab', { detail: { tab: 'savings_debts', subTab: 'debts' } }))}
          className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FFF5F5] via-[#FFE3E3] to-[#FFC9C9] p-5 shadow-sm border-2 border-rose-300/60 flex flex-col justify-between min-h-[120px] group transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-pointer"
        >
          <div className="absolute -right-2 -bottom-2 opacity-[0.06] transform group-hover:scale-110 transition-transform duration-300">
            <ArrowDownLeft className="w-24 h-24 text-rose-950" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-rose-800/95 flex items-center gap-1">Khoản nợ phải trả 🌸</span>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => { e.stopPropagation(); toggleCardVisibility('debts'); }}
                  className="p-1 rounded-lg hover:bg-rose-950/10 text-rose-800 transition-colors cursor-pointer"
                  title={cardVisibility.debts ? "Ẩn số tiền này" : "Hiện số tiền này"}
                >
                  {cardVisibility.debts ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
                </button>
                <div className="p-1 rounded-lg bg-rose-950/5 text-rose-700">
                  <ArrowDownLeft className="w-3.5 h-3.5" />
                </div>
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-rose-900 tabular-nums">
              {cardVisibility.debts ? formatCurrency(debtStats.outstandingDebts) : '••••••••'}
            </p>
          </div>
          <p className="text-[10px] text-rose-850/80 mt-3 font-bold leading-tight relative z-10">
            Sẽ khấu trừ dứt điểm khi trả xong.
          </p>
        </div>
      </div>

      {/* Warnings Banner for Budget Overruns */}
      {budgetOverruns.length > 0 && (
        <div className="p-5 rounded-3xl bg-rose-50 border-4 border-rose-100 text-rose-950 text-sm font-bold flex flex-col gap-2 shadow-sm">
          <div className="flex items-start gap-3">
            <span className="text-2xl">😿</span>
            <div className="flex-1">
              <p className="font-extrabold text-rose-900 text-base">Cảnh báo: Chi vượt ngân sách trong chu kỳ này!</p>
              <div className="mt-1 space-y-1 text-xs text-rose-800">
                {budgetOverruns.map((item, idx) => (
                  <p key={idx}>
                    • Danh mục <span className="font-extrabold">{item.categoryName}</span> vượt ngưỡng hạn mức{' '}
                    <span className="font-extrabold">{formatCurrency(item.excess)}</span> (đã chi {formatCurrency(item.spent)} / {formatCurrency(item.limit)}).
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


