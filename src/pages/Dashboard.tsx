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
import { formatCurrency, getCurrentPeriod } from '../lib/utils';
import { CardSkeleton } from '../components/Skeleton';

export default function Dashboard({ 
  user,
  onNavigateToHistory 
}: { 
  user: User;
  onNavigateToHistory?: () => void;
}) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [debts, setDebts] = useState<DebtInstallment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [savings, setSavings] = useState<SavingTransaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetType[]>([]);
  const [settlementConfig, setSettlementConfig] = useState<{ settlement_day: number; mode: 'fixed' | 'flexible' }>({ settlement_day: 1, mode: 'fixed' });
  const [customCycles, setCustomCycles] = useState<CustomCycle[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAmounts, setShowAmounts] = useState(false);

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

    // Safety fallback timer to prevent indefinite loading on network lag or new account setup
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

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
      if (s.type === 'deposit') return acc + s.amount;
      return acc - s.amount;
    }, 0);
  }, [savings]);

  // Calculate total transactions and cash balance (all time)
  const cashStats = useMemo(() => {
    let income = 0;
    let expense = 0;
    transactions.forEach(t => {
      if (t.is_split_pending) return;
      if (t.type === 'income') income += t.amount;
      else expense += t.amount;
    });
    return { income, expense, balance: income - expense };
  }, [transactions]);

  // Calculate outstanding loans and debts
  const debtStats = useMemo(() => {
    let outstandingLoans = 0;
    let outstandingDebts = 0;

    debts.forEach(d => {
      const debtTxs = transactions.filter(t => t.debt_id === d.id);
      const computedPaid = debtTxs.reduce((sum, t) => sum + t.amount, 0);
      const remaining = d.total_amount - computedPaid;
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
    
    // Filter this month's transactions
    const { start, end } = period;
    const monthExpenseTxs = transactions.filter(t => 
      t.type === 'expense' && 
      !t.is_split_pending && 
      isWithinInterval(new Date(t.date), { start, end })
    );

    // Sum expenses by category
    const totals: Record<string, number> = {};
    monthExpenseTxs.forEach(t => {
      totals[t.category_id] = (totals[t.category_id] || 0) + t.amount;
    });

    // Check for overruns
    const overruns: { categoryName: string; spent: number; limit: number; excess: number }[] = [];
    budgets.forEach(b => {
      const spent = totals[b.category_id || ''] || 0;
      if (b.limit_amount && spent > b.limit_amount) {
        const cat = categories.find(c => c.id === b.category_id);
        if (cat) {
          overruns.push({
            categoryName: cat.name,
            spent,
            limit: b.limit_amount,
            excess: spent - b.limit_amount
          });
        }
      }
    });

    return overruns;
  }, [budgets, transactions, categories, period]);

  const formatValue = (num: number) => {
    if (!showAmounts) return '••••••••';
    return formatCurrency(num);
  };

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
        
        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            onClick={() => setShowAmounts(!showAmounts)}
            className="flex items-center gap-2 bg-white hover:bg-amber-50 text-amber-950 border-2 border-amber-200 px-4 py-3 rounded-2xl text-xs font-black shadow-sm transition-all cursor-pointer"
            title={showAmounts ? "Ẩn số tiền" : "Hiện số tiền"}
          >
            {showAmounts ? <EyeOff className="w-4 h-4 text-amber-700" /> : <Eye className="w-4 h-4 text-amber-700" />}
            <span>{showAmounts ? "Ẩn số tiền" : "Hiện số tiền"}</span>
          </button>

          {onNavigateToHistory && (
            <button
              onClick={onNavigateToHistory}
              className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] text-amber-950 px-5 py-3 rounded-2xl text-xs font-black border-b-4 border-amber-600 shadow-md transition-all cursor-pointer"
            >
              <PlusCircle className="w-4 h-4" />
              <span>Ghi chép giao dịch mới 📝</span>
            </button>
          )}
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
              <div className="p-1 rounded-lg bg-amber-950/5 text-amber-700">
                <Wallet className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-slate-900 tabular-nums">
              {formatValue(debtStats.adjustedBalance)}
            </p>
          </div>
          <p className="text-[10px] text-amber-900/90 mt-3 flex items-center gap-1.5 leading-tight relative z-10 font-bold">
            <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
            <span>Đã khấu trừ khoản tiết kiệm & công nợ.</span>
          </p>
        </div>

        {/* Savings Balance Card */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FDF4FF] via-[#FAE8FF] to-[#F5D0FE] p-5 shadow-sm border-2 border-fuchsia-300/60 flex flex-col justify-between min-h-[120px] group transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-default">
          <div className="absolute -right-2 -bottom-2 opacity-[0.08] transform group-hover:scale-110 transition-transform duration-300">
            <PiggyBank className="w-24 h-24 text-fuchsia-950" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-fuchsia-800/95 flex items-center gap-1">Hũ tiết kiệm 🐷</span>
              <div className="p-1 rounded-lg bg-fuchsia-950/5 text-fuchsia-700">
                <PiggyBank className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-fuchsia-950 tabular-nums">
              {formatValue(totalSavingsBalance)}
            </p>
          </div>
          <p className="text-[10px] text-fuchsia-900/80 mt-3 font-bold leading-tight relative z-10">
            Số tiền trong các hũ tiết kiệm.
          </p>
        </div>

        {/* Outstanding Loans */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#F0FDF4] via-[#DCFCE7] to-[#BBF7D0] p-5 shadow-sm border-2 border-emerald-300/60 flex flex-col justify-between min-h-[120px] group transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-default">
          <div className="absolute -right-2 -bottom-2 opacity-[0.06] transform group-hover:scale-110 transition-transform duration-300">
            <ArrowUpRight className="w-24 h-24 text-emerald-950" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-emerald-800/95 flex items-center gap-1">Cho vay chưa thu 🍀</span>
              <div className="p-1 rounded-lg bg-emerald-950/5 text-emerald-700">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-emerald-900 tabular-nums">
              {formatValue(debtStats.outstandingLoans)}
            </p>
          </div>
          <p className="text-[10px] text-emerald-850/80 mt-3 font-bold leading-tight relative z-10">
            Sẽ cộng về ví khi nhận lại nha.
          </p>
        </div>

        {/* Outstanding Debts */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FFF5F5] via-[#FFE3E3] to-[#FFC9C9] p-5 shadow-sm border-2 border-rose-300/60 flex flex-col justify-between min-h-[120px] group transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-default">
          <div className="absolute -right-2 -bottom-2 opacity-[0.06] transform group-hover:scale-110 transition-transform duration-300">
            <ArrowDownLeft className="w-24 h-24 text-rose-950" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-black uppercase tracking-widest text-rose-800/95 flex items-center gap-1">Khoản nợ phải trả 🌸</span>
              <div className="p-1 rounded-lg bg-rose-950/5 text-rose-700">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-rose-900 tabular-nums">
              {formatValue(debtStats.outstandingDebts)}
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
                    <span className="font-extrabold">{formatValue(item.excess)}</span> (đã chi {formatValue(item.spent)} / {formatValue(item.limit)}).
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


