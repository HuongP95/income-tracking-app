import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { 
  subscribeToCategories, 
  addCategory, 
  addTransaction, 
  subscribeToDebts, 
  subscribeToTransactions,
  subscribeToBudgets,
  subscribeToSettlementConfig,
  subscribeToCustomCycles
} from '../lib/db';
import { Category, TransactionType, DebtInstallment, Transaction, Budget as BudgetType, CustomCycle } from '../types';
import { 
  PlusCircle, 
  ShoppingCart, 
  Home, 
  Car, 
  DollarSign, 
  Plus, 
  Wallet, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Info, 
  Loader2, 
  AlertTriangle 
} from 'lucide-react';
import { format, isWithinInterval } from 'date-fns';
import { formatNumberInput, parseNumberInput, formatCurrency, getCurrentPeriod } from '../lib/utils';
import { useFeedback } from '../context/FeedbackContext';
import { CardSkeleton, ListSkeleton } from '../components/Skeleton';

const ICONS: Record<string, any> = {
  ShoppingCart,
  Home,
  Car,
  DollarSign
};

export default function Dashboard({ user }: { user: User }) {
  const { showToast } = useFeedback();
  
  const [categories, setCategories] = useState<Category[]>([]);
  const [debts, setDebts] = useState<DebtInstallment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetType[]>([]);
  const [settlementConfig, setSettlementConfig] = useState<{ settlement_day: number; mode: 'fixed' | 'flexible' }>({ settlement_day: 1, mode: 'fixed' });
  const [customCycles, setCustomCycles] = useState<CustomCycle[]>([]);
  
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<TransactionType>('expense');
  const [newCatIcon, setNewCatIcon] = useState('ShoppingCart');
  const [newCatColor, setNewCatColor] = useState('#4F6EF7');

  useEffect(() => {
    let count = 0;
    const checkLoaded = () => {
      count++;
      if (count >= 5) {
        setLoading(false);
      }
    };

    const unsubC = subscribeToCategories(user.uid, (data) => { setCategories(data); checkLoaded(); });
    const unsubD = subscribeToDebts(user.uid, (data) => { setDebts(data); checkLoaded(); });
    const unsubT = subscribeToTransactions(user.uid, (data) => { setTransactions(data); checkLoaded(); });
    const unsubB = subscribeToBudgets(user.uid, (data) => { setBudgets(data); checkLoaded(); });
    const unsubS = subscribeToSettlementConfig(user.uid, (data) => { setSettlementConfig(data); checkLoaded(); });
    const unsubCy = subscribeToCustomCycles(user.uid, (data) => { setCustomCycles(data); checkLoaded(); });

    return () => {
      unsubC();
      unsubD();
      unsubT();
      unsubB();
      unsubS();
      unsubCy();
    };
  }, [user.uid]);

  // Current Settlement Period
  const period = useMemo(() => {
    return getCurrentPeriod(settlementConfig, customCycles);
  }, [settlementConfig, customCycles]);

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

    const adjustedBalance = cashStats.balance - outstandingLoans - outstandingDebts;

    return {
      outstandingLoans,
      outstandingDebts,
      adjustedBalance
    };
  }, [debts, transactions, cashStats]);

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

  const filteredCategories = categories.filter(c => c.type === type);

  // Sync categoryId when type or categories change
  useEffect(() => {
    if (filteredCategories.length > 0) {
      const exists = filteredCategories.some(c => c.id === categoryId);
      if (!exists) {
        setCategoryId(filteredCategories[0].id!);
      }
    } else {
      setCategoryId('');
    }
  }, [type, categories]);

  // Input Real-time validation
  const parsedAmount = useMemo(() => parseNumberInput(amount), [amount]);
  const isAmountInvalid = useMemo(() => {
    return amountTouched && (parsedAmount <= 0 || isNaN(parsedAmount));
  }, [amountTouched, parsedAmount]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAmountTouched(true);
    
    if (parsedAmount <= 0 || !categoryId) {
      showToast('Số tiền không hợp lệ. Vui lòng nhập số lớn hơn 0.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await addTransaction(user.uid, {
        amount: parsedAmount,
        type,
        category_id: categoryId,
        date: new Date(date).getTime(),
        note
      });

      setAmount('');
      setNote('');
      setAmountTouched(false);
      showToast('Ghi nhận giao dịch thành công!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Đã xảy ra lỗi khi lưu giao dịch.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return;
    try {
      await addCategory(user.uid, {
        name: newCatName,
        type: newCatType,
        icon: newCatIcon,
        color: newCatColor
      });
      setShowCategoryModal(false);
      setNewCatName('');
      showToast('Đã thêm danh mục mới!', 'success');
    } catch (err) {
      showToast('Lỗi khi thêm danh mục.', 'error');
    }
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(formatNumberInput(e.target.value));
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div>
          <div className="h-8 w-32 bg-slate-200 rounded animate-pulse" />
          <div className="h-4 w-64 bg-slate-100 rounded animate-pulse mt-2" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="max-w-xl h-64 bg-white rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight">Tổng quan</h1>
        <p className="text-sm text-slate-500 font-medium">Ghi chép giao dịch tức thì và theo dõi hạn mức chi tiêu thông minh.</p>
      </div>

      {/* SECTION: WALLET & CO-DEBT OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-xl">
        {/* Adjusted Balance Card with Premium pastel yellow backdrop */}
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FEFCE8] via-[#FEF9C3] to-[#FEF08A] p-5 shadow-sm border border-yellow-200/70 flex flex-col justify-between min-h-[120px] group transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-default">
          <div className="absolute inset-0 bg-gradient-radial from-amber-500/5 to-transparent opacity-60 pointer-events-none" />
          <div className="absolute -right-2 -bottom-2 opacity-[0.08] transform group-hover:scale-110 transition-transform duration-300">
            <Wallet className="w-24 h-24 text-amber-950" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-800/90">Số dư khả dụng</span>
              <div className="p-1 rounded-lg bg-amber-950/5 text-amber-700">
                <Wallet className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
              {formatCurrency(debtStats.adjustedBalance)}
            </p>
          </div>
          <p className="text-[10px] text-amber-900/80 mt-3 flex items-center gap-1.5 leading-tight relative z-10 font-semibold">
            <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
            <span>Đã khấu trừ các khoản công nợ.</span>
          </p>
        </div>

        {/* Outstanding Loans */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/60 flex flex-col justify-between min-h-[120px] transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-default">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Cho vay chưa thu</span>
              <div className="p-1 rounded-lg bg-emerald-50 text-[#17B978]">
                <ArrowUpRight className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold font-mono tracking-tight text-[#17B978] tabular-nums">
              {formatCurrency(debtStats.outstandingLoans)}
            </p>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 font-medium leading-tight">
            Sẽ tự động cộng về ví khi nhận lại.
          </p>
        </div>

        {/* Outstanding Debts */}
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-100/60 flex flex-col justify-between min-h-[120px] transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-default">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Nợ phải trả</span>
              <div className="p-1 rounded-lg bg-rose-50 text-[#F0426B]">
                <ArrowDownLeft className="w-3.5 h-3.5" />
              </div>
            </div>
            <p className="text-xl font-bold font-mono tracking-tight text-[#F0426B] tabular-nums">
              {formatCurrency(debtStats.outstandingDebts)}
            </p>
          </div>
          <p className="text-[10px] text-slate-400 mt-3 font-medium leading-tight">
            Sẽ khấu trừ dứt điểm khi tất toán.
          </p>
        </div>
      </div>

      {/* Soft Warnings Banner for Budget Overruns */}
      {budgetOverruns.length > 0 && (
        <div className="max-w-xl p-4.5 rounded-2xl bg-amber-50 border border-amber-200/50 text-amber-900 text-sm font-medium flex flex-col gap-2 shadow-sm">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="flex-1">
              <p className="font-bold text-amber-950">Phát hiện chi tiêu vượt ngân sách!</p>
              <div className="mt-1 space-y-1 text-xs text-amber-800">
                {budgetOverruns.map((item, idx) => (
                  <p key={idx}>
                    • Danh mục <span className="font-semibold">{item.categoryName}</span> vượt ngưỡng hạn mức{' '}
                    <span className="font-semibold">{formatCurrency(item.excess)}</span> (đã chi {formatCurrency(item.spent)} / {formatCurrency(item.limit)}).
                  </p>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CORE LOGGING FORM CONTAINER */}
      <div className="bg-white p-6 md:p-8 rounded-2xl shadow-sm border border-slate-100/50 max-w-xl transition-all duration-300 hover:shadow-md">
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* Tab Selector for Income/Expense */}
          <div className="flex bg-slate-100 p-1 rounded-xl">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                type === 'expense' 
                  ? 'bg-white shadow text-[#F0426B]' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Chi phí
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 py-2.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                type === 'income' 
                  ? 'bg-white shadow text-[#17B978]' 
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              Thu nhập
            </button>
          </div>

          {/* Amount Field */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Số tiền (VND)
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={amount}
                onChange={handleAmountChange}
                onBlur={() => setAmountTouched(true)}
                className={`block w-full rounded-xl border-0 py-3 px-4 text-slate-900 ring-1 ring-inset placeholder:text-slate-400 focus:ring-2 focus:ring-inset sm:text-lg sm:leading-6 font-mono font-semibold tabular-nums transition-all ${
                  isAmountInvalid 
                    ? 'ring-rose-500 focus:ring-rose-600' 
                    : 'ring-slate-200 focus:ring-[#4F6EF7]'
                }`}
                placeholder="Ví dụ: 50,000"
              />
              {isAmountInvalid && (
                <p className="text-xs font-semibold text-[#F0426B] mt-1.5 flex items-center gap-1 animate-pulse">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span>Số tiền phải lớn hơn 0 VND</span>
                </p>
              )}
            </div>
          </div>

          {/* Grid fields for Category & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">
                  Danh mục
                </label>
                <button 
                  type="button" 
                  onClick={() => {
                    setNewCatType(type);
                    setShowCategoryModal(true);
                  }} 
                  className="text-xs font-bold text-[#4F6EF7] hover:text-[#4F6EF7]/80 flex items-center cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5 mr-0.5 stroke-[2.5]" /> Thêm mới
                </button>
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="block w-full rounded-xl border-0 py-3 px-3.5 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-semibold transition-all bg-white cursor-pointer"
              >
                <option value="" disabled>Chọn danh mục</option>
                {filteredCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
                Ngày ghi nhận
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full rounded-xl border-0 py-2.5 px-3.5 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-semibold transition-all bg-white cursor-pointer"
              />
            </div>
          </div>

          {/* Note Field */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1.5">
              Ghi chú thêm
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="block w-full rounded-xl border-0 py-3 px-3.5 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-medium transition-all"
              placeholder="Bạn đã chi/thu khoản này cho việc gì?"
            />
          </div>

          {/* Submit button with double-submit prevent layout */}
          <button
            type="submit"
            disabled={isSubmitting}
            className={`w-full flex items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-sm font-bold text-white shadow-md shadow-[#4F6EF7]/10 transition-all hover:scale-[1.01] cursor-pointer ${
              isSubmitting 
                ? 'bg-slate-400 cursor-not-allowed shadow-none' 
                : 'bg-[#4F6EF7] hover:bg-[#4F6EF7]/90 hover:shadow-[#4F6EF7]/20'
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Đang xử lý giao dịch...</span>
              </>
            ) : (
              <span>Lưu giao dịch</span>
            )}
          </button>
        </form>
      </div>

      {/* GORGEOUS MODAL FOR NEW CATEGORY */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowCategoryModal(false)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 tracking-tight leading-none mb-4">Danh mục mới</h3>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Phân nhóm</label>
                <select 
                  value={newCatType}
                  onChange={(e) => setNewCatType(e.target.value as TransactionType)}
                  className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-semibold bg-white cursor-pointer"
                >
                  <option value="expense">Chi phí</option>
                  <option value="income">Thu nhập</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Tên danh mục</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-semibold"
                  placeholder="Ví dụ: Ăn uống, Thu tiền nhà..."
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Biểu tượng đại diện</label>
                <select 
                  value={newCatIcon}
                  onChange={(e) => setNewCatIcon(e.target.value)}
                  className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-semibold bg-white cursor-pointer"
                >
                  <option value="ShoppingCart">Giỏ hàng</option>
                  <option value="Home">Nhà cửa</option>
                  <option value="Car">Xe cộ</option>
                  <option value="DollarSign">Tiền bạc</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Mã màu</label>
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  className="block h-11 w-full rounded-xl border-0 p-1 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] bg-white cursor-pointer"
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowCategoryModal(false)} 
                  className="px-4.5 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  className="px-4.5 py-2 text-sm font-semibold text-white bg-[#4F6EF7] hover:bg-[#4F6EF7]/90 rounded-xl shadow-md shadow-indigo-100 hover:scale-[1.02] transition-all cursor-pointer"
                >
                  Lưu danh mục
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
