import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { 
  subscribeToSavings, 
  addSavingTransaction, 
  updateSavingTransaction, 
  deleteSavingTransaction,
  subscribeToDebts,
  addDebt,
  updateDebt,
  deleteDebt,
  subscribeToTransactions,
  addTransaction,
  subscribeToCategories,
  subscribeToSettlementConfig,
  subscribeToCustomCycles
} from '../lib/db';
import { SavingTransaction, DebtInstallment, Transaction, Category, CustomCycle } from '../types';
import { format, isWithinInterval } from 'date-fns';
import { 
  PiggyBank, 
  CreditCard, 
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
  Plus,
  Loader2,
  Check,
  Landmark
} from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput, getCurrentPeriod } from '../lib/utils';
import { useFeedback } from '../context/FeedbackContext';
import { CardSkeleton, ListSkeleton } from '../components/Skeleton';

export default function SavingsAndDebts({ user }: { user: User }) {
  const { showToast, confirm } = useFeedback();

  // Active sub-tab state ('savings' | 'debts')
  const [activeTab, setActiveTab] = useState<'savings' | 'debts'>('savings');

  // Savings states
  const [savings, setSavings] = useState<SavingTransaction[]>([]);
  const [savingAmount, setSavingAmount] = useState('');
  const [savingType, setSavingType] = useState<'deposit' | 'withdraw'>('deposit');
  const [savingDate, setSavingDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [savingNote, setSavingNote] = useState('');
  const [isSubmittingSaving, setIsSubmittingSaving] = useState(false);
  const [editingSaving, setEditingSaving] = useState<SavingTransaction | null>(null);
  const [editSavingAmount, setEditSavingAmount] = useState('');

  // Debt & Loan states
  const [debts, setDebts] = useState<DebtInstallment[]>([]);
  const [showNewDebt, setShowNewDebt] = useState(false);
  const [newDebt, setNewDebt] = useState<Partial<DebtInstallment>>({ type: 'debt' });
  const [newTotalAmount, setNewTotalAmount] = useState('');
  const [newMonthlyPayment, setNewMonthlyPayment] = useState('');
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [editDebtForm, setEditDebtForm] = useState<Partial<DebtInstallment>>({});
  const [editTotalAmount, setEditTotalAmount] = useState('');
  const [editMonthlyPayment, setEditMonthlyPayment] = useState('');
  const [isSavingDebt, setIsSavingDebt] = useState(false);

  // Common states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settlementConfig, setSettlementConfig] = useState<{ settlement_day: number; mode: 'fixed' | 'flexible' }>({ settlement_day: 1, mode: 'fixed' });
  const [customCycles, setCustomCycles] = useState<CustomCycle[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let loadedS = false, loadedD = false, loadedT = false, loadedC = false, loadedSc = false;
    const checkLoaded = () => {
      if (loadedS && loadedD && loadedT && loadedC && loadedSc) setLoading(false);
    };

    const unsubS = subscribeToSavings(user.uid, (data) => { setSavings(data); loadedS = true; checkLoaded(); });
    const unsubD = subscribeToDebts(user.uid, (data) => { setDebts(data); loadedD = true; checkLoaded(); });
    const unsubT = subscribeToTransactions(user.uid, (data) => { setTransactions(data); loadedT = true; checkLoaded(); });
    const unsubC = subscribeToCategories(user.uid, (data) => { setCategories(data); loadedC = true; checkLoaded(); });
    const unsubSc = subscribeToSettlementConfig(user.uid, (data) => { setSettlementConfig(data); loadedSc = true; checkLoaded(); });
    const unsubCy = subscribeToCustomCycles(user.uid, (data) => { setCustomCycles(data); });

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => {
      unsubS();
      unsubD();
      unsubT();
      unsubC();
      unsubSc();
      unsubCy();
      clearTimeout(safetyTimer);
    };
  }, [user.uid]);

  // Total Savings Balance
  const totalSavingsBalance = useMemo(() => {
    return savings.reduce((acc, s) => {
      const amt = Number(s.amount) || 0;
      if (s.type === 'deposit') return acc + amt;
      return acc - amt;
    }, 0);
  }, [savings]);

  // Debt Stats
  const debtStats = useMemo(() => {
    let totalLoans = 0;
    let totalDebts = 0;
    debts.forEach(d => {
      const debtTxs = transactions.filter(t => t.debt_id === d.id);
      const computedPaid = debtTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
      const totalAmt = Number(d.total_amount) || 0;
      const remaining = totalAmt - computedPaid;
      if (d.type === 'loan') totalLoans += Math.max(0, remaining);
      else totalDebts += Math.max(0, remaining);
    });
    return { totalLoans, totalDebts };
  }, [debts, transactions]);

  // Submit Savings deposit/withdraw
  const handleAddSavings = async (e: React.FormEvent) => {
    e.preventDefault();
    const amt = parseNumberInput(savingAmount);
    if (amt <= 0) {
      showToast('Số tiền không hợp lệ. Vui lòng nhập số lớn hơn 0.', 'error');
      return;
    }

    if (savingType === 'withdraw' && amt > totalSavingsBalance) {
      showToast('Số tiền rút lớn hơn số dư heo tiết kiệm hiện tại!', 'error');
      return;
    }

    setIsSubmittingSaving(true);
    try {
      await addSavingTransaction(user.uid, {
        amount: amt,
        type: savingType,
        date: new Date(savingDate).getTime(),
        note: savingNote
      });

      setSavingAmount('');
      setSavingNote('');
      showToast(savingType === 'deposit' ? 'Đã bỏ heo tiết kiệm thành công! 🐷' : 'Đã rút tiền từ hũ tiết kiệm!', 'success');
    } catch (err) {
      showToast('Đã xảy ra lỗi.', 'error');
    } finally {
      setIsSubmittingSaving(false);
    }
  };

  const handleDeleteSaving = (s: SavingTransaction) => {
    confirm({
      title: 'Xóa lịch sử tiết kiệm này?',
      message: 'Hành động này sẽ cập nhật lại số dư hũ tiết kiệm của bạn.',
      confirmLabel: 'Xóa ngay',
      cancelLabel: 'Bỏ qua',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteSavingTransaction(user.uid, s.id!);
          showToast('Đã xóa lịch sử tiết kiệm.', 'success');
        } catch (err) {
          showToast('Không thể xóa.', 'error');
        }
      }
    });
  };

  // Debt Handlers
  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const totAmount = parseNumberInput(newTotalAmount);
    const mPayment = parseNumberInput(newMonthlyPayment);

    if (!newDebt.name || totAmount <= 0) {
      showToast('Vui lòng nhập tên và số tiền hợp lệ.', 'error');
      return;
    }

    setIsSavingDebt(true);
    try {
      await addDebt(user.uid, {
        name: newDebt.name,
        type: newDebt.type || 'debt',
        total_amount: totAmount,
        paid_amount: 0,
        start_date: Date.now(),
        monthly_payment: mPayment,
        term_months: Number(newDebt.term_months || 1)
      });

      setShowNewDebt(false);
      setNewDebt({ type: 'debt' });
      setNewTotalAmount('');
      setNewMonthlyPayment('');
      showToast('Đã thêm khoản nợ/cho vay thành công!', 'success');
    } catch (err) {
      showToast('Không thể thêm khoản mới.', 'error');
    } finally {
      setIsSavingDebt(false);
    }
  };

  const handlePayDebt = async (debt: DebtInstallment, amountToPay: number) => {
    let targetCat = categories.find(c => 
      debt.type === 'debt' 
        ? c.type === 'expense' && c.name.toLowerCase().includes('trả nợ')
        : c.type === 'income' && (c.name.toLowerCase().includes('thu') || c.name.toLowerCase().includes('nợ'))
    );

    if (!targetCat) {
      targetCat = categories.find(c => c.type === (debt.type === 'debt' ? 'expense' : 'income'));
    }

    if (!targetCat) {
      showToast('Không tìm thấy danh mục phù hợp để ghi nhận.', 'error');
      return;
    }

    try {
      await addTransaction(user.uid, {
        amount: amountToPay,
        type: debt.type === 'debt' ? 'expense' : 'income',
        category_id: targetCat.id!,
        date: Date.now(),
        note: `${debt.type === 'debt' ? 'Thanh toán khoản' : 'Thu hồi khoản'} ${debt.name}`,
        debt_id: debt.id
      });
      showToast('Đã ghi nhận thanh toán thành công!', 'success');
    } catch (err) {
      showToast('Không thể lưu thanh toán.', 'error');
    }
  };

  const handleDeleteDebtItem = (id: string, name: string) => {
    confirm({
      title: 'Xóa khoản công nợ?',
      message: `Bạn có chắc muốn xóa "${name}" không?`,
      confirmLabel: 'Xóa ngay',
      cancelLabel: 'Hủy',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDebt(user.uid, id);
          showToast('Đã xóa thành công!', 'success');
        } catch (err) {
          showToast('Lỗi khi xóa.', 'error');
        }
      }
    });
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <CardSkeleton />
        <ListSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* HEADER & TOP TAB SELECTOR */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-amber-950 leading-none flex items-center gap-2">
            Tiết kiệm & Quản lý Nợ <span className="text-2xl">🐷</span>
          </h1>
          <p className="text-xs sm:text-sm text-amber-800/80 font-bold mt-1.5">
            Tích lũy tiền tiết kiệm thông minh và theo dõi chặt chẽ các khoản vay nợ nhé! ✨
          </p>
        </div>

        {/* Tab switch */}
        <div className="flex bg-amber-100/70 p-1.5 rounded-2xl border border-amber-200 self-start sm:self-auto">
          <button
            onClick={() => setActiveTab('savings')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
              activeTab === 'savings'
                ? 'bg-white shadow-sm text-amber-950 border border-amber-200/60'
                : 'text-amber-800 hover:text-amber-950'
            }`}
          >
            <PiggyBank className="w-4 h-4 text-amber-600" />
            <span>Quỹ Tiết Kiệm</span>
          </button>
          <button
            onClick={() => setActiveTab('debts')}
            className={`flex items-center gap-2 px-4 py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
              activeTab === 'debts'
                ? 'bg-white shadow-sm text-amber-950 border border-amber-200/60'
                : 'text-amber-800 hover:text-amber-950'
            }`}
          >
            <CreditCard className="w-4 h-4 text-amber-600" />
            <span>Sổ Nợ & Trả Góp</span>
          </button>
        </div>
      </div>

      {/* TAB 1: SAVINGS (QUỸ TIẾT KIỆM) */}
      {activeTab === 'savings' && (
        <div className="space-y-6">
          {/* BANNER TOTAL SAVINGS */}
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FEFCE8] via-[#FEF9C3] to-[#FEF08A] p-6 sm:p-8 shadow-md border-4 border-yellow-300/80 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="relative z-10">
              <span className="text-xs font-black uppercase tracking-widest text-amber-800/90 flex items-center gap-1.5">
                <PiggyBank className="w-4 h-4 text-amber-600" />
                Tổng số dư hũ tiết kiệm 🐷
              </span>
              <p className="text-3xl sm:text-4xl font-black font-mono tracking-tight text-amber-950 tabular-nums mt-1">
                {formatCurrency(totalSavingsBalance)}
              </p>
              <p className="text-xs text-amber-800/80 font-bold mt-2">
                Đã có <span className="font-extrabold">{savings.length}</span> lượt giao dịch tích lũy/rút tiền.
              </p>
            </div>
            <div className="hidden sm:block opacity-20">
              <PiggyBank className="w-32 h-32 text-amber-950" />
            </div>
          </div>

          {/* FORM LOG SAVING */}
          <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-lg shadow-amber-150/10 border-4 border-[#FFF2D8]">
            <h2 className="text-lg font-black text-amber-950 mb-4 flex items-center gap-1.5">
              Ghi nhận giao dịch tiết kiệm 📝
            </h2>
            <form onSubmit={handleAddSavings} className="space-y-4">
              <div className="flex bg-amber-50/50 p-1 rounded-xl border border-amber-100 max-w-sm">
                <button
                  type="button"
                  onClick={() => setSavingType('deposit')}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    savingType === 'deposit'
                      ? 'bg-emerald-100/90 text-emerald-800 border border-emerald-200/50 shadow-sm'
                      : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  🐷 Nạp thêm vào hũ
                </button>
                <button
                  type="button"
                  onClick={() => setSavingType('withdraw')}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    savingType === 'withdraw'
                      ? 'bg-rose-100/90 text-rose-800 border border-rose-200/50 shadow-sm'
                      : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  💸 Rút tiền ra
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1 ml-1">
                    Số tiền (VND) 💰
                  </label>
                  <input
                    type="text"
                    required
                    value={savingAmount}
                    onChange={(e) => setSavingAmount(formatNumberInput(e.target.value))}
                    className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-900 font-mono font-bold text-sm focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                    placeholder="Ví dụ: 500,000"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1 ml-1">
                    Ngày thực hiện 📅
                  </label>
                  <input
                    type="date"
                    required
                    value={savingDate}
                    onChange={(e) => setSavingDate(e.target.value)}
                    className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-800 font-semibold text-sm focus:border-[#FFC300] focus:ring-0 focus:outline-none cursor-pointer"
                  />
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1 ml-1">
                    Ghi chú thêm ✍️
                  </label>
                  <input
                    type="text"
                    value={savingNote}
                    onChange={(e) => setSavingNote(e.target.value)}
                    className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-800 font-semibold text-sm focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                    placeholder="Mục tiêu tích lũy..."
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmittingSaving}
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] text-amber-950 font-black text-sm border-b-4 border-amber-600 shadow-md cursor-pointer disabled:opacity-70 transition-all"
              >
                {isSubmittingSaving ? 'Đang lưu...' : '+ Lưu giao dịch tiết kiệm'}
              </button>
            </form>
          </div>

          {/* HISTORY SAVINGS LIST */}
          <div className="bg-white rounded-3xl shadow-lg shadow-amber-150/5 border-4 border-[#FFF2D8] overflow-hidden">
            <div className="p-5 border-b border-amber-100/60 font-black text-amber-950 flex items-center justify-between">
              <span className="flex items-center gap-2">
                Lịch sử nạp / rút tiết kiệm 📜
              </span>
              <span className="text-xs bg-amber-100 text-amber-900 font-bold px-2.5 py-1 rounded-full">
                {savings.length} giao dịch
              </span>
            </div>

            <div className="divide-y divide-amber-100/50">
              {savings.length === 0 ? (
                <div className="p-10 text-center text-amber-800 text-xs font-bold">
                  Chưa có lịch sử tiết kiệm nào. Bắt đầu tích lũy từ hôm nay nhé! 🐷
                </div>
              ) : (
                savings.map((s) => (
                  <div key={s.id} className="p-4 sm:p-5 flex items-center justify-between hover:bg-[#FFFDF9] transition-colors group">
                    <div className="flex items-center gap-3">
                      <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-sm ${
                        s.type === 'deposit' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                      }`}>
                        {s.type === 'deposit' ? '🐷' : '💸'}
                      </div>
                      <div>
                        <p className="font-black text-amber-950 text-sm">
                          {s.type === 'deposit' ? 'Gửi tiết kiệm' : 'Rút tiết kiệm'}
                        </p>
                        <p className="text-[11px] text-amber-800/60 font-semibold">
                          {format(new Date(s.date), 'dd/MM/yyyy')} {s.note ? `• ${s.note}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`font-mono font-black text-sm sm:text-base tabular-nums ${
                        s.type === 'deposit' ? 'text-emerald-600' : 'text-rose-600'
                      }`}>
                        {s.type === 'deposit' ? '+' : '-'}{formatCurrency(s.amount)}
                      </span>
                      <button
                        onClick={() => handleDeleteSaving(s)}
                        className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg sm:opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        title="Xóa"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DEBTS & LOANS (SỔ NỢ & TRẢ GÓP) */}
      {activeTab === 'debts' && (
        <div className="space-y-6">
          {/* STATS OVERVIEW CARDS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#F0FDF4] to-[#BBF7D0] border-4 border-emerald-200/80 shadow-md flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-emerald-800 block">
                  Cho vay chưa thu hồi 🍀
                </span>
                <p className="text-3xl font-black font-mono text-emerald-950 tabular-nums mt-1">
                  {formatCurrency(debtStats.totalLoans)}
                </p>
              </div>
              <ArrowUpRight className="w-12 h-12 text-emerald-700 opacity-60" />
            </div>

            <div className="p-6 rounded-3xl bg-gradient-to-br from-[#FFF5F5] to-[#FFC9C9] border-4 border-rose-200/80 shadow-md flex items-center justify-between">
              <div>
                <span className="text-xs font-black uppercase tracking-widest text-rose-800 block">
                  Khoản nợ / Trả góp phải trả 🌸
                </span>
                <p className="text-3xl font-black font-mono text-rose-950 tabular-nums mt-1">
                  {formatCurrency(debtStats.totalDebts)}
                </p>
              </div>
              <ArrowDownLeft className="w-12 h-12 text-rose-700 opacity-60" />
            </div>
          </div>

          {/* ADD NEW DEBT BUTTON & MODAL */}
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-black text-amber-950">
              Danh sách công nợ & Trả góp 📜
            </h2>
            <button
              onClick={() => setShowNewDebt(true)}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] text-amber-950 font-black text-xs border-b-4 border-amber-600 shadow-sm cursor-pointer"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Thêm khoản mới</span>
            </button>
          </div>

          {/* DEBTS LIST */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {debts.length === 0 ? (
              <div className="md:col-span-2 bg-white p-12 rounded-3xl border-4 border-[#FFF2D8] text-center text-amber-800 text-xs font-bold">
                Chưa có khoản nợ hoặc cho vay nào. Nhấn "Thêm khoản mới" để bắt đầu theo dõi nha! 🍀
              </div>
            ) : (
              debts.map((debt) => {
                const debtTxs = transactions.filter(t => t.debt_id === debt.id);
                const computedPaid = debtTxs.reduce((sum, t) => sum + t.amount, 0);
                const remaining = debt.total_amount - computedPaid;
                const progressPct = Math.min(100, Math.round((computedPaid / debt.total_amount) * 100));

                return (
                  <div key={debt.id} className="bg-white p-5 rounded-3xl shadow-md border-4 border-[#FFF2D8] space-y-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className={`text-[10px] font-black uppercase px-2 py-0.5 rounded-md ${
                          debt.type === 'loan' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}>
                          {debt.type === 'loan' ? 'Cho vay' : 'Khoản nợ / Trả góp'}
                        </span>
                        <h3 className="font-extrabold text-amber-950 text-base mt-1">{debt.name}</h3>
                      </div>
                      <button
                        onClick={() => handleDeleteDebtItem(debt.id!, debt.name)}
                        className="text-rose-400 hover:text-rose-600 p-1 cursor-pointer"
                        title="Xóa khoản này"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                      <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-100/60">
                        <span className="text-[10px] text-amber-800/60 uppercase block">Tổng số tiền</span>
                        <span className="font-mono text-amber-950 text-sm font-black">{formatCurrency(debt.total_amount)}</span>
                      </div>
                      <div className="bg-amber-50/50 p-2.5 rounded-xl border border-amber-100/60">
                        <span className="text-[10px] text-amber-800/60 uppercase block">Còn lại</span>
                        <span className={`font-mono text-sm font-black ${remaining <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {remaining <= 0 ? 'Đã xong ✨' : formatCurrency(remaining)}
                        </span>
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="space-y-1">
                      <div className="flex justify-between text-[10px] font-bold text-amber-800/70">
                        <span>Đã trả ({progressPct}%)</span>
                        <span>{formatCurrency(computedPaid)} / {formatCurrency(debt.total_amount)}</span>
                      </div>
                      <div className="w-full h-2 bg-amber-100 rounded-full overflow-hidden">
                        <div 
                          className="h-full bg-emerald-500 rounded-full transition-all duration-300"
                          style={{ width: `${progressPct}%` }}
                        />
                      </div>
                    </div>

                    {/* Quick payment button */}
                    {remaining > 0 && (
                      <button
                        onClick={() => handlePayDebt(debt, debt.monthly_payment || remaining)}
                        className="w-full py-2.5 px-4 rounded-xl bg-amber-100 hover:bg-amber-200/80 text-amber-950 font-black text-xs cursor-pointer transition-all border border-amber-200"
                      >
                        + Ghi nhận trả {debt.monthly_payment ? formatCurrency(debt.monthly_payment) : formatCurrency(remaining)}
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* NEW DEBT MODAL */}
      {showNewDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#3A2A1A]/40 backdrop-blur-sm" onClick={() => setShowNewDebt(false)} />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-4 border-[#FFF2D8] space-y-4">
            <h3 className="text-lg font-black text-amber-950">Thêm khoản nợ / cho vay mới 📜</h3>
            <form onSubmit={handleAddDebt} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase text-amber-800/80 mb-1">Loại công nợ</label>
                <select
                  value={newDebt.type}
                  onChange={(e) => setNewDebt({ ...newDebt, type: e.target.value as any })}
                  className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-2.5 text-xs font-bold"
                >
                  <option value="debt">💸 Khoản nợ / Trả góp (Tôi phải trả)</option>
                  <option value="loan">🍀 Cho vay (Tôi sẽ thu về)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-amber-800/80 mb-1">Tên tên khoản nợ / đối tác</label>
                <input
                  type="text"
                  required
                  value={newDebt.name || ''}
                  onChange={(e) => setNewDebt({ ...newDebt, name: e.target.value })}
                  className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-2.5 text-xs font-bold"
                  placeholder="Ví dụ: Nợ thẻ tín dụng, Cho Nam vay..."
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-amber-800/80 mb-1">Tổng số tiền (VND)</label>
                <input
                  type="text"
                  required
                  value={newTotalAmount}
                  onChange={(e) => setNewTotalAmount(formatNumberInput(e.target.value))}
                  className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-2.5 text-xs font-mono font-bold"
                  placeholder="Ví dụ: 10,000,000"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase text-amber-800/80 mb-1">Số tiền trả mỗi kỳ (Tùy chọn)</label>
                <input
                  type="text"
                  value={newMonthlyPayment}
                  onChange={(e) => setNewMonthlyPayment(formatNumberInput(e.target.value))}
                  className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-2.5 text-xs font-mono font-bold"
                  placeholder="Ví dụ: 1,000,000"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowNewDebt(false)}
                  className="px-4 py-2 text-xs font-bold text-amber-800 hover:bg-amber-50 rounded-xl"
                >
                  Hủy nè
                </button>
                <button
                  type="submit"
                  disabled={isSavingDebt}
                  className="px-5 py-2.5 text-xs font-black text-amber-950 bg-gradient-to-r from-[#FFD000] to-[#FFB700] rounded-xl border-b-2 border-amber-600 shadow-sm"
                >
                  {isSavingDebt ? 'Đang lưu...' : 'Thêm luôn! ✨'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
