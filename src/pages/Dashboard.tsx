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
        <h1 className="text-3xl font-black tracking-tight text-amber-950 leading-none flex items-center gap-2">
          Tổng quan <span className="text-2xl">🐾</span>
        </h1>
        <p className="text-xs sm:text-sm text-amber-800/80 font-bold mt-1.5">
          Hãy cùng bé Coin ghi chép chi tiêu siêu kute và theo dõi hạn mức thông minh nha! ✨
        </p>
      </div>

      {/* SECTION: WALLET & CO-DEBT OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 max-w-xl">
        {/* Adjusted Balance Card with Premium pastel yellow backdrop */}
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
            <p className="text-xl font-bold font-mono tracking-tight text-slate-900 tabular-nums">
              {formatCurrency(debtStats.adjustedBalance)}
            </p>
          </div>
          <p className="text-[10px] text-amber-900/90 mt-3 flex items-center gap-1.5 leading-tight relative z-10 font-bold">
            <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
            <span>Đã khấu trừ các khoản công nợ.</span>
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
            <p className="text-xl font-bold font-mono tracking-tight text-emerald-900 tabular-nums">
              {formatCurrency(debtStats.outstandingLoans)}
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
            <p className="text-xl font-bold font-mono tracking-tight text-rose-900 tabular-nums">
              {formatCurrency(debtStats.outstandingDebts)}
            </p>
          </div>
          <p className="text-[10px] text-rose-850/80 mt-3 font-bold leading-tight relative z-10">
            Sẽ khấu trừ dứt điểm khi trả xong.
          </p>
        </div>
      </div>

      {/* Soft Warnings Banner for Budget Overruns */}
      {budgetOverruns.length > 0 && (
        <div className="max-w-xl p-4.5 rounded-2xl bg-rose-50 border-2 border-rose-100 text-rose-950 text-sm font-bold flex flex-col gap-2 shadow-sm animate-bounce-subtle">
          <div className="flex items-start gap-2.5">
            <span className="text-lg">😿</span>
            <div className="flex-1">
              <p className="font-extrabold text-rose-900">Hự! Chi vượt ngân sách mất tiêu rồi...</p>
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

      {/* CORE LOGGING FORM CONTAINER */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-lg shadow-amber-150/10 border-4 border-[#FFF2D8] max-w-xl transition-all duration-300 hover:shadow-xl">
        <h2 className="text-lg font-black text-amber-950 mb-4 flex items-center gap-1.5">
          Ghi chép giao dịch mới 📝
        </h2>
        <form onSubmit={handleSubmit} className="space-y-5">
          
          {/* Tab Selector for Income/Expense */}
          <div className="flex bg-amber-50/50 p-1 rounded-xl border border-amber-100">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                type === 'expense' 
                  ? 'bg-rose-100/90 shadow-sm text-rose-700 border border-rose-200/50' 
                  : 'text-amber-800/70 hover:text-amber-950'
              }`}
            >
              💸 Chi phí
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                type === 'income' 
                  ? 'bg-emerald-100/90 shadow-sm text-emerald-700 border border-emerald-200/50' 
                  : 'text-amber-800/70 hover:text-amber-950'
              }`}
            >
              💰 Thu nhập
            </button>
          </div>

          {/* Amount Field */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">
              Số tiền giao dịch 💰
            </label>
            <div className="relative">
              <input
                type="text"
                required
                value={amount}
                onChange={handleAmountChange}
                onBlur={() => setAmountTouched(true)}
                className={`block w-full rounded-2xl border-2 py-3 px-4 text-slate-900 bg-[#FFFDF9] placeholder:text-amber-600/30 focus:border-[#FFC300] focus:ring-0 focus:outline-none sm:text-lg font-mono font-semibold tabular-nums transition-all ${
                  isAmountInvalid 
                    ? 'border-rose-300' 
                    : 'border-amber-100'
                }`}
                placeholder="Ví dụ: 50,000"
              />
              {isAmountInvalid && (
                <p className="text-xs font-bold text-rose-600 mt-1.5 flex items-center gap-1 animate-pulse ml-1">
                  <span>😿</span>
                  <span>Số tiền phải lớn hơn 0 VND nha bạn ơi!</span>
                </p>
              )}
            </div>
          </div>

          {/* Grid fields for Category & Date */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <div className="flex justify-between items-center mb-1.5">
                <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 ml-1">
                  Danh mục 🐾
                </label>
                <button 
                  type="button" 
                  onClick={() => {
                    setNewCatType(type);
                    setShowCategoryModal(true);
                  }} 
                  className="text-xs font-extrabold text-amber-700 hover:text-amber-900 flex items-center cursor-pointer transition-colors"
                >
                  <Plus className="w-3.5 h-3.5 mr-0.5 stroke-[3]" /> Thêm mới
                </button>
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-3 px-3.5 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold transition-all cursor-pointer"
              >
                <option value="" disabled>Chọn danh mục nè</option>
                {filteredCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">
                Ngày ghi nhận 📅
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold transition-all cursor-pointer"
              />
            </div>
          </div>

          {/* Note Field */}
          <div>
            <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">
              Ghi chú thêm ✍️
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-3 px-3.5 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold transition-all"
              placeholder="Khoản này cho việc gì thế nhỉ?"
            />
          </div>

          {/* Submit button with double-submit prevent layout */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full flex items-center justify-center gap-2 rounded-2xl py-3.5 px-4 text-sm font-black transition-all border-b-4 border-amber-600 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed ${
                isSubmitting 
                  ? 'bg-slate-300 border-slate-400 text-slate-600' 
                  : 'bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] text-amber-950 shadow-md shadow-amber-200/50 hover:shadow-lg'
              }`}
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Đợi bé lưu giao dịch nha...</span>
                </>
              ) : (
                <>
                  <span>Lưu giao dịch ngay! ✨</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>

      {/* GORGEOUS MODAL FOR NEW CATEGORY */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#3A2A1A]/40 backdrop-blur-sm" onClick={() => setShowCategoryModal(false)} />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-sm shadow-2xl border-4 border-[#FFF2D8] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-amber-950 tracking-tight leading-none mb-4 flex items-center gap-1.5">Danh mục mới 🐾</h3>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1 ml-1">Phân nhóm</label>
                <select 
                  value={newCatType}
                  onChange={(e) => setNewCatType(e.target.value as TransactionType)}
                  className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold cursor-pointer"
                >
                  <option value="expense">💸 Chi phí</option>
                  <option value="income">💰 Thu nhập</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1 ml-1">Tên danh mục</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold"
                  placeholder="Ví dụ: Ăn uống, Tiền lương..."
                />
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1 ml-1">Biểu tượng đại diện</label>
                <select 
                  value={newCatIcon}
                  onChange={(e) => setNewCatIcon(e.target.value)}
                  className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold cursor-pointer"
                >
                  <option value="ShoppingCart">🛒 Giỏ hàng</option>
                  <option value="Home">🏠 Nhà cửa</option>
                  <option value="Car">🚗 Xe cộ</option>
                  <option value="DollarSign">💵 Tiền bạc</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1 ml-1">Mã màu</label>
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  className="block h-11 w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-1 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none cursor-pointer"
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button 
                  type="button" 
                  onClick={() => setShowCategoryModal(false)} 
                  className="px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-50 rounded-2xl transition-all cursor-pointer"
                >
                  Hủy nè
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 text-sm font-black text-amber-950 bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] rounded-2xl shadow-sm border-b-2 border-amber-600 hover:scale-[1.02] transition-all cursor-pointer"
                >
                  Thêm luôn! ✨
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
