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
  Search, 
  Calendar, 
  Coins, 
  Sparkles, 
  Info, 
  CheckCircle,
  Plus,
  Loader2,
  Check,
  Landmark,
  ShoppingBag,
  DollarSign
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
  const [editSavingType, setEditSavingType] = useState<'deposit' | 'withdraw'>('deposit');
  const [editSavingDate, setEditSavingDate] = useState('');
  const [editSavingNote, setEditSavingNote] = useState('');
  const [isSavingEditSaving, setIsSavingEditSaving] = useState(false);

  // Debt & Loan states
  const [debts, setDebts] = useState<DebtInstallment[]>([]);
  const [showNewDebt, setShowNewDebt] = useState(false);
  const [newDebtType, setNewDebtType] = useState<'debt' | 'loan' | 'installment'>('debt');
  const [newDebtName, setNewDebtName] = useState('');
  const [newTotalAmount, setNewTotalAmount] = useState('');
  const [newMonthlyPayment, setNewMonthlyPayment] = useState('');
  const [newTermMonths, setNewTermMonths] = useState('1');
  const [newStartDate, setNewStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [isSavingDebt, setIsSavingDebt] = useState(false);

  // Edit Debt states
  const [editingDebt, setEditingDebt] = useState<DebtInstallment | null>(null);
  const [editDebtType, setEditDebtType] = useState<'debt' | 'loan' | 'installment'>('debt');
  const [editDebtName, setEditDebtName] = useState('');
  const [editTotalAmount, setEditTotalAmount] = useState('');
  const [editMonthlyPayment, setEditMonthlyPayment] = useState('');
  const [editTermMonths, setEditTermMonths] = useState('1');
  const [editStartDate, setEditStartDate] = useState('');
  const [isUpdatingDebt, setIsUpdatingDebt] = useState(false);

  // Quick Pay Modal states
  const [payingDebt, setPayingDebt] = useState<DebtInstallment | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [payNote, setPayNote] = useState('');
  const [isLoggingPayment, setIsLoggingPayment] = useState(false);

  // Search/Filter states
  const [searchDebt, setSearchDebt] = useState('');
  const [filterDebtType, setFilterDebtType] = useState<'all' | 'debt' | 'loan' | 'installment'>('all');

  // Common states
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [settlementConfig, setSettlementConfig] = useState<{ settlement_day: number; mode: 'fixed' | 'flexible' }>({ settlement_day: 1, mode: 'fixed' });
  const [customCycles, setCustomCycles] = useState<CustomCycle[]>([]);
  const [loading, setLoading] = useState(true);

  // Listen for tab switch events from external components (like Dashboard cards)
  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab?: string; subTab?: string }>;
      if (customEvent.detail?.subTab === 'debts' || customEvent.detail?.tab === 'debts') {
        setActiveTab('debts');
      } else if (customEvent.detail?.subTab === 'savings' || customEvent.detail?.tab === 'savings') {
        setActiveTab('savings');
      }
    };
    window.addEventListener('finly_change_tab', handleTabChange);
    return () => window.removeEventListener('finly_change_tab', handleTabChange);
  }, []);

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

  // Filtered Debts
  const filteredDebts = useMemo(() => {
    return debts.filter(d => {
      if (filterDebtType !== 'all' && d.type !== filterDebtType) return false;
      if (searchDebt.trim()) {
        const q = searchDebt.toLowerCase();
        return d.name.toLowerCase().includes(q) || d.total_amount.toString().includes(q);
      }
      return true;
    });
  }, [debts, filterDebtType, searchDebt]);

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
        note: savingNote.trim() || (savingType === 'deposit' ? 'Gửi tiết kiệm' : 'Rút tiết kiệm')
      });

      setSavingAmount('');
      setSavingNote('');
      showToast(savingType === 'deposit' ? 'Đã bỏ heo tiết kiệm thành công! 🐷' : 'Đã rút tiền từ hũ tiết kiệm!', 'success');
    } catch (err) {
      console.error('Error saving:', err);
      showToast('Đã xảy ra lỗi khi lưu.', 'error');
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

  const handleStartEditSaving = (s: SavingTransaction) => {
    setEditingSaving(s);
    setEditSavingAmount(formatNumberInput(s.amount));
    setEditSavingType(s.type);
    setEditSavingDate(format(new Date(s.date), 'yyyy-MM-dd'));
    setEditSavingNote(s.note || '');
  };

  const handleSaveEditSaving = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingSaving || !editingSaving.id) return;
    const amt = parseNumberInput(editSavingAmount);
    if (amt <= 0) {
      showToast('Số tiền không hợp lệ.', 'error');
      return;
    }

    setIsSavingEditSaving(true);
    try {
      await updateSavingTransaction(user.uid, editingSaving.id, {
        amount: amt,
        type: editSavingType,
        date: new Date(editSavingDate).getTime(),
        note: editSavingNote.trim()
      });
      setEditingSaving(null);
      showToast('Đã cập nhật giao dịch tiết kiệm thành công!', 'success');
    } catch (err) {
      showToast('Lỗi khi lưu thay đổi.', 'error');
    } finally {
      setIsSavingEditSaving(false);
    }
  };

  // Debt Handlers: Add Debt
  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    const totAmount = parseNumberInput(newTotalAmount);
    const mPayment = parseNumberInput(newMonthlyPayment);
    const term = parseInt(newTermMonths, 10) || 1;

    if (!newDebtName.trim()) {
      showToast('Vui lòng nhập tên khoản nợ hoặc người vay/đối tác.', 'error');
      return;
    }

    if (totAmount <= 0) {
      showToast('Vui lòng nhập tổng số tiền lớn hơn 0.', 'error');
      return;
    }

    setIsSavingDebt(true);
    try {
      const startDateTs = newStartDate ? new Date(newStartDate).getTime() : Date.now();
      await addDebt(user.uid, {
        name: newDebtName.trim(),
        type: newDebtType,
        total_amount: totAmount,
        paid_amount: 0,
        start_date: isNaN(startDateTs) ? Date.now() : startDateTs,
        monthly_payment: mPayment,
        term_months: term
      });

      setShowNewDebt(false);
      setNewDebtName('');
      setNewTotalAmount('');
      setNewMonthlyPayment('');
      setNewTermMonths('1');
      setNewDebtType('debt');
      setNewStartDate(format(new Date(), 'yyyy-MM-dd'));
      showToast('Đã thêm khoản nợ / cho vay thành công! ✨', 'success');
    } catch (err) {
      console.error('Error adding debt:', err);
      showToast('Có lỗi xảy ra khi thêm khoản nợ. Vui lòng thử lại!', 'error');
    } finally {
      setIsSavingDebt(false);
    }
  };

  // Start Edit Debt
  const handleStartEditDebt = (debt: DebtInstallment) => {
    setEditingDebt(debt);
    setEditDebtName(debt.name);
    setEditDebtType(debt.type || 'debt');
    setEditTotalAmount(formatNumberInput(debt.total_amount));
    setEditMonthlyPayment(formatNumberInput(debt.monthly_payment || 0));
    setEditTermMonths(debt.term_months ? String(debt.term_months) : '1');
    setEditStartDate(debt.start_date ? format(new Date(debt.start_date), 'yyyy-MM-dd') : format(new Date(), 'yyyy-MM-dd'));
  };

  // Save Edit Debt
  const handleSaveEditDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDebt || !editingDebt.id) return;
    const totAmount = parseNumberInput(editTotalAmount);
    const mPayment = parseNumberInput(editMonthlyPayment);
    const term = parseInt(editTermMonths, 10) || 1;

    if (!editDebtName.trim() || totAmount <= 0) {
      showToast('Vui lòng nhập tên và tổng số tiền hợp lệ.', 'error');
      return;
    }

    setIsUpdatingDebt(true);
    try {
      const startDateTs = editStartDate ? new Date(editStartDate).getTime() : Date.now();
      await updateDebt(user.uid, editingDebt.id, {
        name: editDebtName.trim(),
        type: editDebtType,
        total_amount: totAmount,
        monthly_payment: mPayment,
        term_months: term,
        start_date: isNaN(startDateTs) ? Date.now() : startDateTs
      });

      setEditingDebt(null);
      showToast('Đã lưu thay đổi thông tin khoản nợ thành công! ✨', 'success');
    } catch (err) {
      console.error('Error updating debt:', err);
      showToast('Có lỗi xảy ra khi cập nhật.', 'error');
    } finally {
      setIsUpdatingDebt(false);
    }
  };

  // Open Quick Pay Modal
  const handleOpenPayModal = (debt: DebtInstallment, defaultAmount?: number) => {
    const debtTxs = transactions.filter(t => t.debt_id === debt.id);
    const computedPaid = debtTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
    const remaining = Math.max(0, debt.total_amount - computedPaid);
    
    const suggested = defaultAmount !== undefined ? defaultAmount : (debt.monthly_payment && debt.monthly_payment > 0 ? Math.min(debt.monthly_payment, remaining) : remaining);
    
    setPayingDebt(debt);
    setPayAmount(formatNumberInput(suggested));
    setPayDate(format(new Date(), 'yyyy-MM-dd'));
    setPayNote(`${debt.type === 'loan' ? 'Thu hồi nợ' : 'Thanh toán nợ'}: ${debt.name}`);
  };

  // Submit Repayment Transaction
  const handleSubmitRepayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingDebt || !payingDebt.id) return;
    const amountToPay = parseNumberInput(payAmount);
    if (amountToPay <= 0) {
      showToast('Vui lòng nhập số tiền thanh toán lớn hơn 0.', 'error');
      return;
    }

    let targetCat = categories.find(c => 
      payingDebt.type === 'debt' || payingDebt.type === 'installment'
        ? c.type === 'expense' && (c.name.toLowerCase().includes('trả nợ') || c.name.toLowerCase().includes('trả góp') || c.name.toLowerCase().includes('nợ'))
        : c.type === 'income' && (c.name.toLowerCase().includes('thu') || c.name.toLowerCase().includes('nợ') || c.name.toLowerCase().includes('khác'))
    );

    if (!targetCat) {
      targetCat = categories.find(c => c.type === (payingDebt.type === 'loan' ? 'income' : 'expense'));
    }

    if (!targetCat) {
      showToast('Không tìm thấy danh mục phù hợp để ghi nhận. Vui lòng tạo danh mục trước!', 'error');
      return;
    }

    setIsLoggingPayment(true);
    try {
      const payDateTs = payDate ? new Date(payDate).getTime() : Date.now();
      await addTransaction(user.uid, {
        amount: amountToPay,
        type: payingDebt.type === 'loan' ? 'income' : 'expense',
        category_id: targetCat.id!,
        date: isNaN(payDateTs) ? Date.now() : payDateTs,
        note: payNote.trim() || `${payingDebt.type === 'loan' ? 'Thu hồi khoản' : 'Thanh toán khoản'} ${payingDebt.name}`,
        debt_id: payingDebt.id
      });

      setPayingDebt(null);
      showToast('Đã ghi nhận thanh toán thành công vào Sổ giao dịch! ✨', 'success');
    } catch (err) {
      console.error('Error recording payment:', err);
      showToast('Không thể lưu thanh toán.', 'error');
    } finally {
      setIsLoggingPayment(false);
    }
  };

  const handleDeleteDebtItem = (id: string, name: string) => {
    confirm({
      title: 'Xóa khoản công nợ?',
      message: `Bạn có chắc muốn xóa vĩnh viễn "${name}" không? Các giao dịch lịch sử trước đó vẫn được giữ nguyên.`,
      confirmLabel: 'Xóa ngay',
      cancelLabel: 'Hủy',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDebt(user.uid, id);
          showToast('Đã xóa khoản công nợ thành công!', 'success');
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
        <div className="flex bg-amber-100/70 p-1.5 rounded-2xl border border-amber-200 self-start sm:self-auto shadow-sm">
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
                className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] text-amber-950 font-black text-sm border-b-4 border-amber-600 shadow-md cursor-pointer disabled:opacity-70 transition-all flex items-center justify-center gap-2"
              >
                {isSubmittingSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4 stroke-[3]" />}
                <span>{isSubmittingSaving ? 'Đang lưu...' : 'Lưu giao dịch tiết kiệm'}</span>
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
                      <div className="flex items-center gap-1 sm:opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          onClick={() => handleStartEditSaving(s)}
                          className="p-1.5 text-amber-700 hover:text-amber-950 rounded-lg hover:bg-amber-50 cursor-pointer"
                          title="Chỉnh sửa"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteSaving(s)}
                          className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg hover:bg-rose-50 cursor-pointer"
                          title="Xóa"
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
                <p className="text-[11px] text-emerald-800/80 font-bold mt-2">
                  Tiền người khác đang mượn bạn, sẽ thu về ví sau nha!
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
                <p className="text-[11px] text-rose-800/80 font-bold mt-2">
                  Tổng các khoản nợ hoặc đơn mua hàng trả góp cần thanh toán.
                </p>
              </div>
              <ArrowDownLeft className="w-12 h-12 text-rose-700 opacity-60" />
            </div>
          </div>

          {/* SEARCH, FILTER & ADD NEW DEBT BUTTON */}
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-amber-700/60" />
                <input
                  type="text"
                  value={searchDebt}
                  onChange={(e) => setSearchDebt(e.target.value)}
                  placeholder="Tìm khoản nợ, đối tác..."
                  className="w-full pl-9 pr-3.5 py-2 text-xs font-bold rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                />
              </div>

              {/* Type Filter Buttons */}
              <div className="flex bg-amber-50 p-1 rounded-2xl border border-amber-100">
                <button
                  type="button"
                  onClick={() => setFilterDebtType('all')}
                  className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                    filterDebtType === 'all' ? 'bg-white text-amber-950 shadow-xs border border-amber-200' : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  Tất cả
                </button>
                <button
                  type="button"
                  onClick={() => setFilterDebtType('loan')}
                  className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                    filterDebtType === 'loan' ? 'bg-emerald-100 text-emerald-800 shadow-xs border border-emerald-200' : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  🍀 Cho vay
                </button>
                <button
                  type="button"
                  onClick={() => setFilterDebtType('debt')}
                  className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                    filterDebtType === 'debt' ? 'bg-rose-100 text-rose-800 shadow-xs border border-rose-200' : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  💸 Khoản nợ
                </button>
                <button
                  type="button"
                  onClick={() => setFilterDebtType('installment')}
                  className={`px-3 py-1.5 text-xs font-black rounded-xl transition-all cursor-pointer ${
                    filterDebtType === 'installment' ? 'bg-indigo-100 text-indigo-800 shadow-xs border border-indigo-200' : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  🛍️ Trả góp
                </button>
              </div>
            </div>

            <button
              onClick={() => {
                setNewDebtType('debt');
                setNewDebtName('');
                setNewTotalAmount('');
                setNewMonthlyPayment('');
                setNewTermMonths('1');
                setNewStartDate(format(new Date(), 'yyyy-MM-dd'));
                setShowNewDebt(true);
              }}
              className="flex items-center justify-center gap-1.5 px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] text-amber-950 font-black text-xs border-b-4 border-amber-600 shadow-sm cursor-pointer shrink-0 transition-transform active:scale-95"
            >
              <Plus className="w-4 h-4 stroke-[3]" />
              <span>Thêm khoản nợ / cho vay mới</span>
            </button>
          </div>

          {/* DEBTS LIST */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {filteredDebts.length === 0 ? (
              <div className="md:col-span-2 bg-white p-12 rounded-3xl border-4 border-[#FFF2D8] text-center text-amber-800 text-xs font-bold space-y-2">
                <p className="text-2xl">🍀</p>
                <p className="text-sm font-black text-amber-950">Chưa có khoản nợ hoặc cho vay nào phù hợp.</p>
                <p className="text-amber-700/80">Nhấn nút <strong>"Thêm khoản nợ / cho vay mới"</strong> ở trên để bắt đầu theo dõi nha!</p>
              </div>
            ) : (
              filteredDebts.map((debt) => {
                const debtTxs = transactions.filter(t => t.debt_id === debt.id);
                const computedPaid = debtTxs.reduce((sum, t) => sum + (Number(t.amount) || 0), 0);
                const remaining = Math.max(0, debt.total_amount - computedPaid);
                const progressPct = debt.total_amount > 0 ? Math.min(100, Math.round((computedPaid / debt.total_amount) * 100)) : 0;

                const isLoan = debt.type === 'loan';
                const isInstallment = debt.type === 'installment';

                return (
                  <div key={debt.id} className="bg-white p-5 sm:p-6 rounded-3xl shadow-md border-4 border-[#FFF2D8] space-y-4 hover:border-amber-300 transition-all flex flex-col justify-between">
                    <div>
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className={`text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full border ${
                              isLoan 
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-200' 
                                : isInstallment 
                                  ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                                  : 'bg-rose-50 text-rose-800 border-rose-200'
                            }`}>
                              {isLoan ? '🍀 Cho vay (Thu về)' : isInstallment ? '🛍️ Mua trả góp' : '💸 Khoản nợ (Phải trả)'}
                            </span>
                            {debt.start_date && (
                              <span className="text-[10px] text-amber-800/60 font-bold flex items-center gap-1">
                                <Calendar className="w-3 h-3" />
                                {format(new Date(debt.start_date), 'dd/MM/yyyy')}
                              </span>
                            )}
                          </div>
                          <h3 className="font-black text-amber-950 text-base sm:text-lg mt-1.5 truncate" title={debt.name}>
                            {debt.name}
                          </h3>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => handleStartEditDebt(debt)}
                            className="p-1.5 text-amber-700 hover:text-amber-950 hover:bg-amber-50 rounded-xl transition-all cursor-pointer"
                            title="Chỉnh sửa thông tin"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteDebtItem(debt.id!, debt.name)}
                            className="p-1.5 text-rose-400 hover:text-rose-600 hover:bg-rose-50 rounded-xl transition-all cursor-pointer"
                            title="Xóa khoản này"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-2.5 text-xs font-bold mt-4">
                        <div className="bg-amber-50/60 p-3 rounded-2xl border border-amber-100">
                          <span className="text-[10px] text-amber-800/70 uppercase font-black block">Tổng số tiền</span>
                          <span className="font-mono text-amber-950 text-sm sm:text-base font-black tabular-nums">{formatCurrency(debt.total_amount)}</span>
                        </div>
                        <div className="bg-amber-50/60 p-3 rounded-2xl border border-amber-100">
                          <span className="text-[10px] text-amber-800/70 uppercase font-black block">Còn lại</span>
                          <span className={`font-mono text-sm sm:text-base font-black tabular-nums ${remaining <= 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                            {remaining <= 0 ? 'Đã hoàn tất ✨' : formatCurrency(remaining)}
                          </span>
                        </div>
                      </div>

                      {/* Progress Bar */}
                      <div className="space-y-1.5 mt-3">
                        <div className="flex justify-between text-[11px] font-bold text-amber-800/80">
                          <span>Đã {isLoan ? 'thu hồi' : 'thanh toán'} ({progressPct}%)</span>
                          <span className="font-mono">{formatCurrency(computedPaid)} / {formatCurrency(debt.total_amount)}</span>
                        </div>
                        <div className="w-full h-2.5 bg-amber-100/70 rounded-full overflow-hidden p-0.5 border border-amber-200/50">
                          <div 
                            className={`h-full rounded-full transition-all duration-300 ${
                              progressPct >= 100 ? 'bg-emerald-500' : isLoan ? 'bg-emerald-400' : 'bg-amber-500'
                            }`}
                            style={{ width: `${progressPct}%` }}
                          />
                        </div>
                      </div>

                      {debt.monthly_payment ? (
                        <p className="text-[11px] text-amber-800/70 font-semibold mt-2">
                          Trả định kỳ: <strong className="font-mono text-amber-950">{formatCurrency(debt.monthly_payment)}</strong>/kỳ {debt.term_months ? `(${debt.term_months} tháng)` : ''}
                        </p>
                      ) : null}
                    </div>

                    {/* Quick payment / record buttons */}
                    <div className="pt-2 border-t border-amber-100/60 flex items-center gap-2">
                      {remaining > 0 ? (
                        <>
                          <button
                            onClick={() => handleOpenPayModal(debt)}
                            className="flex-1 py-2.5 px-3 rounded-xl bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] text-amber-950 font-black text-xs cursor-pointer transition-all border-b-2 border-amber-600 shadow-xs text-center flex items-center justify-center gap-1"
                          >
                            <Plus className="w-3.5 h-3.5 stroke-[3]" />
                            <span>{isLoan ? 'Ghi nhận thu tiền' : 'Ghi nhận trả tiền'}</span>
                          </button>

                          {debt.monthly_payment && debt.monthly_payment > 0 && debt.monthly_payment < remaining && (
                            <button
                              onClick={() => handleOpenPayModal(debt, debt.monthly_payment)}
                              className="py-2.5 px-3 rounded-xl bg-amber-100 hover:bg-amber-200/80 text-amber-950 font-black text-[11px] cursor-pointer transition-all border border-amber-200 shrink-0"
                              title={`Trả 1 kỳ ${formatCurrency(debt.monthly_payment)}`}
                            >
                              Trả 1 kỳ ({formatCurrency(debt.monthly_payment).replace(' VND', '')})
                            </button>
                          )}
                        </>
                      ) : (
                        <div className="w-full py-2 bg-emerald-50 rounded-xl border border-emerald-200 text-center text-xs font-black text-emerald-800 flex items-center justify-center gap-1">
                          <CheckCircle className="w-4 h-4 text-emerald-600" />
                          <span>Khoản nợ này đã được thanh toán xong!</span>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* EDIT SAVING MODAL */}
      {editingSaving && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-3xl border-4 border-[#FFF2D8] w-full max-w-md p-6 shadow-xl relative animate-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-amber-950 mb-4 flex items-center gap-2">
              <Edit2 className="w-5 h-5 text-[#FFC300]" />
              Sửa giao dịch tích lũy
            </h3>

            <form onSubmit={handleSaveEditSaving} className="space-y-4">
              <div>
                <label className="block text-xs font-black text-amber-800 uppercase mb-1">Loại</label>
                <div className="grid grid-cols-2 gap-2 bg-amber-50/50 p-1 rounded-2xl border border-amber-100">
                  <button
                    type="button"
                    onClick={() => setEditSavingType('deposit')}
                    className={`py-2 px-3 text-xs font-black rounded-xl transition-all cursor-pointer ${
                      editSavingType === 'deposit'
                        ? 'bg-white text-emerald-700 border border-emerald-100 shadow-sm'
                        : 'text-amber-800 hover:text-amber-950'
                    }`}
                  >
                    🪙 Gửi tiền vào
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditSavingType('withdraw')}
                    className={`py-2 px-3 text-xs font-black rounded-xl transition-all cursor-pointer ${
                      editSavingType === 'withdraw'
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
                    value={editSavingAmount}
                    onChange={(e) => setEditSavingAmount(formatNumberInput(e.target.value))}
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
                  value={editSavingDate}
                  onChange={(e) => setEditSavingDate(e.target.value)}
                />
              </div>

              <div>
                <label className="block text-xs font-black text-amber-800 uppercase mb-1">Ghi chú</label>
                <input
                  type="text"
                  className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-4 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold"
                  value={editSavingNote}
                  onChange={(e) => setEditSavingNote(e.target.value)}
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
                  disabled={isSavingEditSaving}
                  className="flex-1 py-2.5 rounded-2xl font-black text-xs text-amber-950 bg-amber-400 hover:bg-amber-500 transition-all cursor-pointer shadow-sm border border-amber-300"
                >
                  {isSavingEditSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* NEW DEBT MODAL */}
      {showNewDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#3A2A1A]/40 backdrop-blur-xs" onClick={() => setShowNewDebt(false)} />
          <div className="relative bg-white rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl border-4 border-[#FFF2D8] space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-amber-100">
              <h3 className="text-lg font-black text-amber-950 flex items-center gap-2">
                Thêm khoản nợ / cho vay mới 📜
              </h3>
              <button
                type="button"
                onClick={() => setShowNewDebt(false)}
                className="p-1 rounded-xl text-amber-800/60 hover:text-amber-950 hover:bg-amber-50 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddDebt} className="space-y-4">
              {/* Type Selection */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1.5">
                  Loại công nợ <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-3 gap-2 bg-amber-50/60 p-1.5 rounded-2xl border border-amber-100">
                  <button
                    type="button"
                    onClick={() => setNewDebtType('debt')}
                    className={`py-2 px-2 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                      newDebtType === 'debt'
                        ? 'bg-white text-rose-700 border border-rose-200 shadow-xs'
                        : 'text-amber-800/70 hover:text-amber-950'
                    }`}
                  >
                    💸 Khoản nợ
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewDebtType('loan')}
                    className={`py-2 px-2 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                      newDebtType === 'loan'
                        ? 'bg-white text-emerald-700 border border-emerald-200 shadow-xs'
                        : 'text-amber-800/70 hover:text-amber-950'
                    }`}
                  >
                    🍀 Cho vay
                  </button>
                  <button
                    type="button"
                    onClick={() => setNewDebtType('installment')}
                    className={`py-2 px-2 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                      newDebtType === 'installment'
                        ? 'bg-white text-indigo-700 border border-indigo-200 shadow-xs'
                        : 'text-amber-800/70 hover:text-amber-950'
                    }`}
                  >
                    🛍️ Trả góp
                  </button>
                </div>
              </div>

              {/* Name */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                  Tên khoản nợ / Đối tác / Mục đích <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={newDebtName}
                  onChange={(e) => setNewDebtName(e.target.value)}
                  className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-3 text-sm font-bold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none placeholder:text-amber-900/30"
                  placeholder={
                    newDebtType === 'loan'
                      ? "Ví dụ: Cho Nam vay tiền nhà, Cho bạn An mượn..."
                      : newDebtType === 'installment'
                        ? "Ví dụ: Mua iPhone trả góp, Mua tủ lạnh..."
                        : "Ví dụ: Nợ thẻ tín dụng, Vay ngân hàng, Mượn tiền mẹ..."
                  }
                />
              </div>

              {/* Total Amount */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                  Tổng số tiền (VND) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={newTotalAmount}
                    onChange={(e) => setNewTotalAmount(formatNumberInput(e.target.value))}
                    className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-3 pl-3.5 pr-14 text-sm sm:text-base font-mono font-black text-slate-900 focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                    placeholder="Ví dụ: 10,000,000"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700/70">
                    VND
                  </span>
                </div>
              </div>

              {/* Monthly payment and Term months */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                    Số tiền trả mỗi kỳ (Tùy chọn)
                  </label>
                  <input
                    type="text"
                    value={newMonthlyPayment}
                    onChange={(e) => setNewMonthlyPayment(formatNumberInput(e.target.value))}
                    className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-3 text-xs sm:text-sm font-mono font-bold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                    placeholder="Ví dụ: 1,000,000"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                    Số kỳ / Thời hạn (Tháng)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={newTermMonths}
                    onChange={(e) => setNewTermMonths(e.target.value)}
                    className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-3 text-xs sm:text-sm font-mono font-bold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                    placeholder="Ví dụ: 6 hoặc 12"
                  />
                </div>
              </div>

              {/* Start Date */}
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                  Ngày bắt đầu vay / ghi nợ 📅
                </label>
                <input
                  type="date"
                  required
                  value={newStartDate}
                  onChange={(e) => setNewStartDate(e.target.value)}
                  className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-3 text-xs sm:text-sm font-bold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-amber-100">
                <button
                  type="button"
                  onClick={() => setShowNewDebt(false)}
                  className="px-5 py-2.5 text-xs font-black text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-2xl transition-all cursor-pointer border border-amber-100"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSavingDebt}
                  className="px-6 py-2.5 text-xs sm:text-sm font-black text-amber-950 bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] rounded-2xl border-b-4 border-amber-600 shadow-sm transition-transform active:scale-95 cursor-pointer disabled:opacity-70 flex items-center gap-1.5"
                >
                  {isSavingDebt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  <span>{isSavingDebt ? 'Đang lưu...' : 'Thêm khoản mới! ✨'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* EDIT DEBT MODAL */}
      {editingDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#3A2A1A]/40 backdrop-blur-xs" onClick={() => setEditingDebt(null)} />
          <div className="relative bg-white rounded-3xl p-6 sm:p-7 w-full max-w-lg shadow-2xl border-4 border-[#FFF2D8] space-y-5 animate-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-amber-100">
              <h3 className="text-lg font-black text-amber-950 flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-500" />
                Sửa thông tin khoản công nợ
              </h3>
              <button
                type="button"
                onClick={() => setEditingDebt(null)}
                className="p-1 rounded-xl text-amber-800/60 hover:text-amber-950 hover:bg-amber-50 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEditDebt} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1.5">
                  Loại công nợ
                </label>
                <div className="grid grid-cols-3 gap-2 bg-amber-50/60 p-1.5 rounded-2xl border border-amber-100">
                  <button
                    type="button"
                    onClick={() => setEditDebtType('debt')}
                    className={`py-2 px-2 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                      editDebtType === 'debt'
                        ? 'bg-white text-rose-700 border border-rose-200 shadow-xs'
                        : 'text-amber-800/70 hover:text-amber-950'
                    }`}
                  >
                    💸 Khoản nợ
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditDebtType('loan')}
                    className={`py-2 px-2 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                      editDebtType === 'loan'
                        ? 'bg-white text-emerald-700 border border-emerald-200 shadow-xs'
                        : 'text-amber-800/70 hover:text-amber-950'
                    }`}
                  >
                    🍀 Cho vay
                  </button>
                  <button
                    type="button"
                    onClick={() => setEditDebtType('installment')}
                    className={`py-2 px-2 text-xs font-black rounded-xl transition-all cursor-pointer text-center ${
                      editDebtType === 'installment'
                        ? 'bg-white text-indigo-700 border border-indigo-200 shadow-xs'
                        : 'text-amber-800/70 hover:text-amber-950'
                    }`}
                  >
                    🛍️ Trả góp
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                  Tên khoản nợ / Đối tác
                </label>
                <input
                  type="text"
                  required
                  value={editDebtName}
                  onChange={(e) => setEditDebtName(e.target.value)}
                  className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-3 text-sm font-bold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                  Tổng số tiền (VND)
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={editTotalAmount}
                    onChange={(e) => setEditTotalAmount(formatNumberInput(e.target.value))}
                    className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-3 pl-3.5 pr-14 text-sm sm:text-base font-mono font-black text-slate-900 focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700/70">
                    VND
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                    Trả mỗi kỳ (VND)
                  </label>
                  <input
                    type="text"
                    value={editMonthlyPayment}
                    onChange={(e) => setEditMonthlyPayment(formatNumberInput(e.target.value))}
                    className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-3 text-xs sm:text-sm font-mono font-bold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                    Số kỳ (Tháng)
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={editTermMonths}
                    onChange={(e) => setEditTermMonths(e.target.value)}
                    className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-3 text-xs sm:text-sm font-mono font-bold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                  Ngày bắt đầu 📅
                </label>
                <input
                  type="date"
                  required
                  value={editStartDate}
                  onChange={(e) => setEditStartDate(e.target.value)}
                  className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-3 text-xs sm:text-sm font-bold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none cursor-pointer"
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-amber-100">
                <button
                  type="button"
                  onClick={() => setEditingDebt(null)}
                  className="px-5 py-2.5 text-xs font-black text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-2xl transition-all cursor-pointer border border-amber-100"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isUpdatingDebt}
                  className="px-6 py-2.5 text-xs sm:text-sm font-black text-amber-950 bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] rounded-2xl border-b-4 border-amber-600 shadow-sm transition-transform active:scale-95 cursor-pointer disabled:opacity-70 flex items-center gap-1.5"
                >
                  {isUpdatingDebt ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                  <span>{isUpdatingDebt ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* QUICK PAYMENT / SETTLEMENT MODAL */}
      {payingDebt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#3A2A1A]/40 backdrop-blur-xs" onClick={() => setPayingDebt(null)} />
          <div className="relative bg-white rounded-3xl p-6 sm:p-7 w-full max-w-md shadow-2xl border-4 border-[#FFF2D8] space-y-4 animate-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-amber-100">
              <div>
                <h3 className="text-lg font-black text-amber-950 flex items-center gap-2">
                  {payingDebt.type === 'loan' ? 'Thu hồi nợ 🍀' : 'Thanh toán nợ 💸'}
                </h3>
                <p className="text-xs text-amber-800/70 font-bold mt-0.5">{payingDebt.name}</p>
              </div>
              <button
                type="button"
                onClick={() => setPayingDebt(null)}
                className="p-1 rounded-xl text-amber-800/60 hover:text-amber-950 hover:bg-amber-50 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmitRepayment} className="space-y-4">
              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                  Số tiền ghi nhận (VND) <span className="text-rose-500">*</span>
                </label>
                <div className="relative">
                  <input
                    type="text"
                    required
                    value={payAmount}
                    onChange={(e) => setPayAmount(formatNumberInput(e.target.value))}
                    className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-3 pl-3.5 pr-14 text-base font-mono font-black text-slate-900 focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                    placeholder="0"
                  />
                  <span className="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-black text-amber-700/70">
                    VND
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                  Ngày giao dịch 📅
                </label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-3 text-xs sm:text-sm font-bold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none cursor-pointer"
                />
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-wider text-amber-800/90 mb-1">
                  Ghi chú
                </label>
                <input
                  type="text"
                  value={payNote}
                  onChange={(e) => setPayNote(e.target.value)}
                  className="w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] p-3 text-xs sm:text-sm font-bold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none"
                  placeholder="Ghi chú giao dịch..."
                />
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-amber-100">
                <button
                  type="button"
                  onClick={() => setPayingDebt(null)}
                  className="px-5 py-2.5 text-xs font-black text-amber-900 bg-amber-50 hover:bg-amber-100 rounded-2xl transition-all cursor-pointer border border-amber-100"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isLoggingPayment}
                  className="px-6 py-2.5 text-xs sm:text-sm font-black text-amber-950 bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] rounded-2xl border-b-4 border-amber-600 shadow-sm transition-transform active:scale-95 cursor-pointer disabled:opacity-70 flex items-center gap-1.5"
                >
                  {isLoggingPayment ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4 stroke-[3]" />}
                  <span>{isLoggingPayment ? 'Đang lưu...' : 'Xác nhận ghi nhận'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
