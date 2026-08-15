import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { 
  subscribeToSavings, 
  addSavingTransaction, 
  updateSavingTransaction, 
  deleteSavingTransaction,
  subscribeToTransactions,
  subscribeToCategories,
  subscribeToSettlementConfig,
  subscribeToCustomCycles
} from '../lib/db';
import { SavingTransaction, Transaction, Category, CustomCycle } from '../types';
import { format, isWithinInterval, startOfMonth, endOfMonth } from 'date-fns';
import { 
  PiggyBank, 
  TrendingUp, 
  ArrowUpRight, 
  ArrowDownLeft, 
  Trash2, 
  Edit2, 
  PlusCircle, 
  Search, 
  Calendar, 
  Coins, 
  Sparkles, 
  Info, 
  CheckCircle,
  HelpCircle,
  AlertTriangle
} from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput, getCurrentPeriod } from '../lib/utils';
import { useFeedback } from '../context/FeedbackContext';
import { ListSkeleton } from '../components/Skeleton';

export default function Savings({ user }: { user: User }) {
  const { showToast, confirm } = useFeedback();

  // Data states
  const [savings, setSavings] = useState<SavingTransaction[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settlementConfig, setSettlementConfig] = useState<{ settlement_day: number; mode: 'fixed' | 'flexible' }>({ settlement_day: 1, mode: 'fixed' });
  const [customCycles, setCustomCycles] = useState<CustomCycle[]>([]);
  const [loading, setLoading] = useState(true);

  // Form states
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'deposit' | 'withdraw'>('deposit');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Edit states
  const [editingSaving, setEditingSaving] = useState<SavingTransaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<'deposit' | 'withdraw'>('deposit');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Search/Filter state
  const [searchTerm, setSearchTerm] = useState('');

  useEffect(() => {
    let count = 0;
    const checkLoaded = () => {
      count++;
      if (count >= 5) {
        setLoading(false);
      }
    };

    const unsubS = subscribeToSavings(user.uid, (data) => { setSavings(data); checkLoaded(); });
    const unsubT = subscribeToTransactions(user.uid, (data) => { setTransactions(data); checkLoaded(); });
    const unsubC = subscribeToCategories(user.uid, (data) => { setCategories(data); checkLoaded(); });
    const unsubSc = subscribeToSettlementConfig(user.uid, (data) => { setSettlementConfig(data); checkLoaded(); });
    const unsubCc = subscribeToCustomCycles(user.uid, (data) => { setCustomCycles(data); checkLoaded(); });

    return () => {
      unsubS();
      unsubT();
      unsubC();
      unsubSc();
      unsubCc();
    };
  }, [user.uid]);

  // Current cycle details
  const period = useMemo(() => {
    return getCurrentPeriod(settlementConfig, customCycles);
  }, [settlementConfig, customCycles]);

  // Map category IDs
  const catMap = useMemo(() => {
    return categories.reduce((acc, cat) => {
      acc[cat.id!] = cat;
      return acc;
    }, {} as Record<string, Category>);
  }, [categories]);

  // Stats computation for CURRENT cycle
  const currentCycleStats = useMemo(() => {
    const { start, end } = period;

    // Filter transactions in this cycle
    const cycleTxs = transactions.filter(t => 
      !t.is_split_pending && 
      isWithinInterval(new Date(t.date), { start, end })
    );

    // Sum income & expense, factoring in net debt/loan flow matching Reports.tsx calculation
    let regularIncome = 0;
    let regularExpense = 0;
    let loanRecoveries = 0;
    let debtPayments = 0;

    cycleTxs.forEach(t => {
      const cat = catMap[t.category_id];
      const catName = cat?.name?.toLowerCase() || '';
      const tNote = t.note?.toLowerCase() || '';
      
      const isDebtPayment = t.type === 'expense' && (catName.includes('trả nợ') || catName.includes('trả góp') || tNote.includes('trả nợ') || tNote.includes('trả góp'));
      const isLoanRecovery = t.type === 'income' && (catName.includes('thu hồi nợ') || catName.includes('thu nợ') || tNote.includes('thu hồi nợ') || tNote.includes('thu nợ'));

      if (isDebtPayment) {
        debtPayments += t.amount;
      } else if (isLoanRecovery) {
        loanRecoveries += t.amount;
      } else {
        if (t.type === 'income') {
          regularIncome += t.amount;
        } else {
          regularExpense += t.amount;
        }
      }
    });

    const totalIncome = regularIncome + loanRecoveries;
    const totalExpense = regularExpense + debtPayments;

    // Savings deposited within this cycle
    const cycleSavings = savings.filter(s => 
      isWithinInterval(new Date(s.date), { start, end })
    );
    
    let totalCycleSavingsDeposit = 0;
    let totalCycleSavingsWithdraw = 0;
    
    cycleSavings.forEach(s => {
      if (s.type === 'deposit') {
        totalCycleSavingsDeposit += s.amount;
      } else {
        totalCycleSavingsWithdraw += s.amount;
      }
    });

    const netCycleSavings = totalCycleSavingsDeposit - totalCycleSavingsWithdraw;
    const remainingEstimatedSurplus = Math.max(0, totalIncome - totalExpense - netCycleSavings);

    return {
      totalIncome,
      totalExpense,
      netSavings: netCycleSavings,
      remainingEstimatedSurplus,
      rawSurplus: totalIncome - totalExpense // actual surplus before saving
    };
  }, [transactions, savings, period, catMap]);

  // Overall/All-time Savings Stats
  const overallSavingsStats = useMemo(() => {
    let totalDeposits = 0;
    let totalWithdrawals = 0;

    savings.forEach(s => {
      if (s.type === 'deposit') {
        totalDeposits += s.amount;
      } else {
        totalWithdrawals += s.amount;
      }
    });

    return {
      totalDeposits,
      totalWithdrawals,
      balance: totalDeposits - totalWithdrawals
    };
  }, [savings]);

  // Handle saving addition
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseNumberInput(amount);
    if (parsedAmount <= 0) {
      showToast('Vui lòng nhập số tiền lớn hơn 0.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await addSavingTransaction(user.uid, {
        amount: parsedAmount,
        type,
        date: new Date(date).getTime(),
        note: note.trim() || (type === 'deposit' ? 'Gửi tiết kiệm' : 'Rút tiết kiệm'),
        cycleId: period.isCustom ? period.cycleId : format(new Date(date), 'yyyy-MM')
      });

      setAmount('');
      setNote('');
      setDate(format(new Date(), 'yyyy-MM-dd'));
      showToast(type === 'deposit' ? 'Đã gửi tiết kiệm thành công! 🪙' : 'Đã rút tiết kiệm thành công! 💸', 'success');
    } catch (err) {
      console.error(err);
      showToast('Không thể thực hiện giao dịch tiết kiệm.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Quick transfer remaining surplus of this month/cycle to savings
  const handleQuickTransferSurplus = async () => {
    const surplus = currentCycleStats.remainingEstimatedSurplus;
    if (surplus <= 0) {
      showToast('Bạn đã tiết kiệm hết số tiền thừa hoặc hiện tại không có dư thừa đâu á! 🥰', 'info');
      return;
    }

    const cycleLabel = period.isCustom ? period.cycleName : `Tháng ${format(period.start, 'MM/yyyy')}`;

    confirm({
      title: 'Gửi tiết kiệm tiền thừa?',
      message: `Bé Coin sẽ giúp bạn kết chuyển toàn bộ số tiền dư thừa hiện tại của ${cycleLabel} là ${formatCurrency(surplus)} vào quỹ Tiết kiệm nha! ✨`,
      confirmLabel: 'Gửi ngay thôi!',
      cancelLabel: 'Để sau nha',
      type: 'info',
      onConfirm: async () => {
        try {
          await addSavingTransaction(user.uid, {
            amount: surplus,
            type: 'deposit',
            date: new Date().getTime(),
            note: `Gửi tiết kiệm tiền dư cuối ${cycleLabel}`,
            cycleId: period.isCustom ? period.cycleId : format(new Date(), 'yyyy-MM')
          });
          showToast(`Đã gửi tiết kiệm thành công ${formatCurrency(surplus)}! 🎉`, 'success');
        } catch (err) {
          console.error(err);
          showToast('Lỗi kết chuyển tiết kiệm.', 'error');
        }
      }
    });
  };

  // Delete transaction
  const handleDelete = (s: SavingTransaction) => {
    confirm({
      title: 'Xóa giao dịch tiết kiệm?',
      message: `Hành động này sẽ thay đổi số dư quỹ Tiết kiệm của bạn bớt đi/thêm lại ${formatCurrency(s.amount)}.`,
      confirmLabel: 'Xóa ngay',
      cancelLabel: 'Bỏ qua',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteSavingTransaction(user.uid, s.id!);
          showToast('Đã xóa giao dịch tiết kiệm thành công!', 'success');
        } catch (err) {
          showToast('Không thể xóa giao dịch này.', 'error');
        }
      }
    });
  };

  // Start editing
  const handleStartEdit = (s: SavingTransaction) => {
    setEditingSaving(s);
    setEditAmount(formatNumberInput(s.amount));
    setEditType(s.type);
    setEditDate(format(new Date(s.date), 'yyyy-MM-dd'));
    setEditNote(s.note || '');
  };

  // Save edit
  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSaving || !editingSaving.id) return;
    const parsedAmount = parseNumberInput(editAmount);
    if (parsedAmount <= 0) {
      showToast('Số tiền không hợp lệ.', 'error');
      return;
    }

    setIsSavingEdit(true);
    try {
      await updateSavingTransaction(user.uid, editingSaving.id, {
        amount: parsedAmount,
        type: editType,
        date: new Date(editDate).getTime(),
        note: editNote.trim()
      });
      setEditingSaving(null);
      showToast('Cập nhật giao dịch tiết kiệm thành công!', 'success');
    } catch (err) {
      showToast('Lỗi khi lưu thay đổi.', 'error');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Filter savings records
  const filteredSavings = useMemo(() => {
    return savings.filter(s => {
      if (!searchTerm) return true;
      const query = searchTerm.toLowerCase();
      return s.note?.toLowerCase().includes(query) || s.amount.toString().includes(query);
    });
  }, [savings, searchTerm]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-36 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-60 bg-slate-100 rounded animate-pulse" />
          </div>
        </div>
        <ListSkeleton />
      </div>
    );
  }

  const cycleName = period.isCustom ? period.cycleName : `Tháng ${format(period.start, 'MM/yyyy')}`;

  return (
    <div className="space-y-6">
      {/* HEADER SECTION */}
      <div>
        <h1 className="text-3xl font-black tracking-tight text-amber-950 leading-none flex items-center gap-2.5">
          Tiết kiệm <span className="text-2xl">🐷</span>
        </h1>
        <p className="text-xs sm:text-sm text-amber-800/80 font-bold mt-1.5">
          Tích lũy tiền thừa hàng tháng để xây dựng tương lai vững chắc cùng bé Coin nha! ✨
        </p>
      </div>

      {/* STATS OVERVIEW BENTO GRID */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
        {/* Total Savings Card */}
        <div className="bg-gradient-to-br from-amber-400 via-amber-300 to-[#FFC300] p-6 rounded-3xl border-4 border-[#FFF2D8] shadow-md relative overflow-hidden flex flex-col justify-between">
          <div className="absolute right-0 bottom-0 translate-y-3 translate-x-3 opacity-20 text-white">
            <PiggyBank className="w-36 h-36 stroke-[1.5]" />
          </div>
          <div>
            <div className="flex items-center gap-2 text-amber-950/80 font-black text-xs uppercase tracking-wider">
              <span>Tổng quỹ tiết kiệm</span>
              <Sparkles className="w-3.5 h-3.5 text-amber-950" />
            </div>
            <div className="text-2xl sm:text-3xl font-black text-amber-950 mt-1.5 tracking-tight break-all">
              {formatCurrency(overallSavingsStats.balance)}
            </div>
          </div>
          <div className="mt-4 flex gap-4 text-amber-950/90 text-xs font-bold bg-white/30 backdrop-blur-xs p-2.5 rounded-2xl">
            <div>
              <span className="block text-[10px] text-amber-900/70 font-extrabold uppercase">Đã gửi</span>
              <span className="font-black text-amber-950">+{formatCurrency(overallSavingsStats.totalDeposits).replace(' VND', '')}</span>
            </div>
            <div className="border-l border-amber-950/20" />
            <div>
              <span className="block text-[10px] text-amber-900/70 font-extrabold uppercase">Đã rút</span>
              <span className="font-black text-amber-950">-{formatCurrency(overallSavingsStats.totalWithdrawals).replace(' VND', '')}</span>
            </div>
          </div>
        </div>

        {/* Current Cycle Remaining Surplus Card */}
        <div className="bg-white p-6 rounded-3xl border-4 border-[#FFF2D8] shadow-md flex flex-col justify-between relative">
          <div>
            <span className="text-xs font-black text-amber-800/80 uppercase tracking-widest block">
              Dự kiến dư {cycleName}
            </span>
            <div className="text-xl sm:text-2xl font-black text-emerald-700 mt-1">
              {formatCurrency(currentCycleStats.remainingEstimatedSurplus)}
            </div>
            <p className="text-[10px] text-amber-700/80 font-bold mt-1.5 leading-normal">
              Bằng: Thu nhập ({formatCurrency(currentCycleStats.totalIncome).replace(' VND', '')}) - Chi tiêu ({formatCurrency(currentCycleStats.totalExpense).replace(' VND', '')}) - Tiết kiệm chu kỳ ({formatCurrency(currentCycleStats.netSavings).replace(' VND', '')})
            </p>
          </div>
          
          <button
            onClick={handleQuickTransferSurplus}
            disabled={currentCycleStats.remainingEstimatedSurplus <= 0}
            className={`mt-4 w-full py-2.5 px-4 rounded-2xl text-xs font-black transition-all cursor-pointer flex items-center justify-center gap-1.5 shadow-xs ${
              currentCycleStats.remainingEstimatedSurplus > 0
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                : 'bg-slate-100 text-slate-400 cursor-not-allowed'
            }`}
          >
            <Coins className="w-4 h-4" />
            <span>Kết chuyển tiền dư vào tiết kiệm</span>
          </button>
        </div>

        {/* Current Cycle Remaining Income Card */}
        <div className="bg-white p-6 rounded-3xl border-4 border-[#FFF2D8] shadow-md flex flex-col justify-between">
          <div>
            <span className="text-xs font-black text-amber-800/80 uppercase tracking-widest block">
              Thu nhập còn lại ({cycleName})
            </span>
            <div className="text-xl sm:text-2xl font-black text-amber-950 mt-1">
              {formatCurrency(currentCycleStats.totalIncome - currentCycleStats.totalExpense - currentCycleStats.netSavings)}
            </div>
            <p className="text-[11px] text-slate-500 font-medium mt-2 leading-relaxed">
              Số tiền còn lại thực tế trong tài khoản sau khi trừ chi tiêu và các khoản đã chuyển vào heo đất tiết kiệm.
            </p>
          </div>
          
          <div className="mt-3 flex items-center gap-1.5 text-[11px] text-amber-800 font-bold bg-amber-50/50 p-2 rounded-xl">
            <Info className="w-3.5 h-3.5 text-amber-600 shrink-0" />
            <span>Công thức: TN còn lại = Thu nhập - Chi - Tiết kiệm</span>
          </div>
        </div>
      </div>

      {/* QUICK GUIDE ALERT */}
      <div className="bg-amber-50/40 rounded-3xl border-2 border-dashed border-amber-200/60 p-4 flex items-start gap-3">
        <Sparkles className="w-5 h-5 text-amber-500 shrink-0 mt-0.5 animate-pulse" />
        <div className="text-xs text-amber-950 leading-relaxed font-bold">
          <span className="text-amber-800 uppercase block tracking-wider mb-0.5">🌟 Bé Coin mách nước:</span>
          Cuối tháng hoặc cuối chu kỳ lương, nếu ví bạn vẫn còn dư dả, hãy nhấn nút <strong className="text-emerald-700">"Kết chuyển tiền dư"</strong> ở trên để cất toàn bộ tiền dư vào heo tiết kiệm nha. Bé Coin sẽ tự động cập nhật báo cáo và trừ vào phần thu nhập khả dụng còn lại của bạn!
        </div>
      </div>

      {/* MAIN SAVINGS OPERATIONS VIEW */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Deposit/Withdraw Form */}
        <div className="lg:col-span-5 bg-white p-6 rounded-3xl border-4 border-[#FFF2D8] shadow-lg">
          <h2 className="text-lg font-black text-amber-950 flex items-center gap-2 mb-4">
            {type === 'deposit' ? <ArrowUpRight className="w-5 h-5 text-emerald-600" /> : <ArrowDownLeft className="w-5 h-5 text-rose-500" />}
            {type === 'deposit' ? 'Gửi tiết kiệm 🪙' : 'Rút tiết kiệm 💸'}
          </h2>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Type selector toggle */}
            <div>
              <label className="block text-xs font-black text-amber-800 uppercase mb-1.5">Loại giao dịch</label>
              <div className="grid grid-cols-2 gap-2 bg-amber-50/50 p-1 rounded-2xl border border-amber-100">
                <button
                  type="button"
                  onClick={() => setType('deposit')}
                  className={`py-2 px-3 text-xs font-black rounded-xl transition-all cursor-pointer ${
                    type === 'deposit'
                      ? 'bg-white text-emerald-700 border border-emerald-100 shadow-sm'
                      : 'text-amber-800 hover:text-amber-950'
                  }`}
                >
                  🪙 Gửi tiền vào
                </button>
                <button
                  type="button"
                  onClick={() => setType('withdraw')}
                  className={`py-2 px-3 text-xs font-black rounded-xl transition-all cursor-pointer ${
                    type === 'withdraw'
                      ? 'bg-white text-rose-600 border border-rose-100 shadow-sm'
                      : 'text-amber-800 hover:text-amber-950'
                  }`}
                >
                  💸 Rút tiền ra
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-black text-amber-800 uppercase mb-1">Số tiền (VND)</label>
              <div className="relative">
                <input
                  type="text"
                  required
                  className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-4 pr-12 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-base font-extrabold transition-all"
                  placeholder="0"
                  value={amount}
                  onChange={(e) => setAmount(formatNumberInput(e.target.value))}
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700/60">VND</span>
              </div>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-black text-amber-800 uppercase mb-1">Ngày giao dịch</label>
              <input
                type="date"
                required
                className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-4 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold transition-all"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
            </div>

            {/* Note */}
            <div>
              <label className="block text-xs font-black text-amber-800 uppercase mb-1">Ghi chú</label>
              <input
                type="text"
                className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-4 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold transition-all"
                placeholder={type === 'deposit' ? 'Ví dụ: Tích lũy heo đất tháng này' : 'Ví dụ: Rút chi mua sắm đột xuất'}
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className={`w-full py-3 px-4 rounded-2xl font-black text-xs sm:text-sm shadow-md flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                type === 'deposit'
                  ? 'bg-amber-400 hover:bg-amber-500 text-amber-950 border-2 border-amber-300'
                  : 'bg-rose-500 hover:bg-rose-600 text-white'
              }`}
            >
              {isSubmitting ? 'Đang thực hiện...' : type === 'deposit' ? 'Gửi Tiết Kiệm Ngay 🪙' : 'Xác Nhận Rút Tiết Kiệm 💸'}
            </button>
          </form>
        </div>

        {/* Savings Records List */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <h2 className="text-lg font-black text-amber-950">Lịch sử tích lũy 📜</h2>
            
            <div className="relative max-w-xs w-full">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <Search className="h-4 w-4 text-amber-600/60" />
              </div>
              <input
                type="text"
                className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-1.5 pl-9 pr-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-xs font-semibold transition-all"
                placeholder="Tìm giao dịch..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          <div className="bg-white rounded-3xl border-4 border-[#FFF2D8] shadow-lg overflow-hidden">
            <div className="divide-y divide-amber-100/60">
              {filteredSavings.length === 0 ? (
                <div className="p-10 text-center flex flex-col items-center justify-center gap-2">
                  <span className="text-3xl">🐷</span>
                  <p className="font-black text-amber-950 text-sm">Chưa ghi nhận giao dịch tích lũy nào!</p>
                  <p className="text-xs text-amber-700/60">Hãy bắt đầu gửi những đồng tiền thừa đầu tiên nha.</p>
                </div>
              ) : (
                filteredSavings.map((s) => (
                  <div key={s.id} className="p-4 hover:bg-amber-50/20 transition-all flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
                        s.type === 'deposit' 
                          ? 'bg-emerald-50 text-emerald-600 border border-emerald-100' 
                          : 'bg-rose-50 text-rose-500 border border-rose-100'
                      }`}>
                        {s.type === 'deposit' ? <ArrowUpRight className="w-5 h-5" /> : <ArrowDownLeft className="w-5 h-5" />}
                      </div>
                      <div>
                        <div className="font-black text-amber-950 text-sm leading-tight">{s.note}</div>
                        <div className="text-[11px] text-amber-700/60 font-bold mt-1 flex items-center gap-1.5">
                          <Calendar className="w-3.5 h-3.5" />
                          <span>{format(new Date(s.date), 'dd/MM/yyyy')}</span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3.5">
                      <div className={`text-sm font-extrabold text-right ${
                        s.type === 'deposit' ? 'text-emerald-600' : 'text-rose-500'
                      }`}>
                        {s.type === 'deposit' ? '+' : '-'}{formatCurrency(s.amount)}
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleStartEdit(s)}
                          className="p-1.5 text-amber-700/70 hover:text-amber-950 hover:bg-amber-50 rounded-xl transition-all cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDelete(s)}
                          className="p-1.5 text-amber-700/70 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      </div>

      {/* EDIT MODAL DIALOG */}
      {editingSaving && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border-4 border-[#FFF2D8] w-full max-w-md p-6 shadow-xl relative animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-amber-950 mb-4 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-[#FFC300]" />
              Sửa giao dịch tích lũy
            </h3>

            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-amber-800 uppercase mb-1">Loại</label>
                <div className="grid grid-cols-2 gap-2 bg-amber-50/50 p-1 rounded-2xl border border-amber-100">
                  <button
                    type="button"
                    onClick={() => setEditType('deposit')}
                    className={`py-2 px-3 text-xs font-black rounded-xl transition-all cursor-pointer ${
                      editType === 'deposit'
                        ? 'bg-white text-emerald-700 border border-emerald-100 shadow-sm'
                        : 'text-amber-800 hover:text-amber-950'
                    }`}
                  >
                    🪙 Gửi tiền vào
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditType('withdraw')}
                    className={`py-2 px-3 text-xs font-black rounded-xl transition-all cursor-pointer ${
                      editType === 'withdraw'
                        ? 'bg-white text-rose-600 border border-rose-100 shadow-sm'
                        : 'text-amber-800 hover:text-amber-950'
                    }`}
                  >
                    💸 Rút tiền ra
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-amber-800 uppercase mb-1">Số tiền (VND)</label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-4 pr-12 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-base font-extrabold"
                    value={editAmount}
                    onChange={(e) => setEditAmount(formatNumberInput(e.target.value))}
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700/60">VND</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black text-amber-800 uppercase mb-1">Ngày giao dịch</label>
                <input
                  type="date"
                  required
                  className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-4 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-amber-800 uppercase mb-1">Ghi chú</label>
                <input
                  type="text"
                  className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-4 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingSaving(null)}
                  className="flex-1 py-2.5 rounded-2xl font-black text-xs text-amber-900 bg-amber-50 hover:bg-amber-100/80 transition-all cursor-pointer border border-amber-100"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSavingEdit}
                  className="flex-1 py-2.5 rounded-2xl font-black text-xs text-amber-950 bg-amber-400 hover:bg-amber-500 transition-all cursor-pointer shadow-sm border border-amber-300"
                >
                  {isSavingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
