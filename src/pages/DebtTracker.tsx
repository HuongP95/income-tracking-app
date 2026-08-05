import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { 
  subscribeToDebts, 
  subscribeToTransactions, 
  subscribeToCategories, 
  addDebt, 
  updateDebt, 
  deleteDebt, 
  addTransaction, 
  updateTransaction, 
  addCategory 
} from '../lib/db';
import { DebtInstallment, Transaction, Category, CustomCycle } from '../types';
import { isWithinInterval, format } from 'date-fns';
import { Users, CreditCard, Calendar, Wallet, ArrowUpRight, ArrowDownLeft, Info, Pencil, Trash2, X, Check, Landmark, Plus, Loader2 } from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput, getCurrentPeriod } from '../lib/utils';
import { useFeedback } from '../context/FeedbackContext';
import { motion } from 'motion/react';
import { CardSkeleton } from '../components/Skeleton';

export default function DebtTracker({ 
  user, 
  settlementDay,
  settlementConfig = { settlement_day: 1, mode: 'fixed' },
  customCycles = []
}: { 
  user: User, 
  settlementDay: number,
  settlementConfig?: { settlement_day: number; mode: 'fixed' | 'flexible' },
  customCycles?: CustomCycle[]
}) {
  const { showToast, confirm } = useFeedback();

  const [debts, setDebts] = useState<DebtInstallment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [showNewDebt, setShowNewDebt] = useState(false);
  const [newDebt, setNewDebt] = useState<Partial<DebtInstallment>>({ type: 'debt' });
  const [splitCount, setSplitCount] = useState(2);

  const [newTotalAmount, setNewTotalAmount] = useState('');
  const [newMonthlyPayment, setNewMonthlyPayment] = useState('');

  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DebtInstallment>>({});
  const [editTotalAmount, setEditTotalAmount] = useState('');
  const [editMonthlyPayment, setEditMonthlyPayment] = useState('');
  
  const [isSaving, setIsSaving] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);

  useEffect(() => {
    let count = 0;
    const checkLoaded = () => {
      count++;
      if (count >= 3) setLoading(false);
    };

    const unsubD = subscribeToDebts(user.uid, (data) => { setDebts(data); checkLoaded(); });
    const unsubT = subscribeToTransactions(user.uid, (data) => { setTransactions(data); checkLoaded(); });
    const unsubC = subscribeToCategories(user.uid, (data) => { setCategories(data); checkLoaded(); });
    return () => { unsubD(); unsubT(); unsubC(); };
  }, [user.uid]);

  const startEdit = (debt: DebtInstallment) => {
    setEditingDebtId(debt.id || null);
    setEditForm({ ...debt });
    setEditTotalAmount(formatNumberInput(debt.total_amount));
    setEditMonthlyPayment(formatNumberInput(debt.monthly_payment || 0));
  };

  const handleUpdateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDebtId || !editForm.name || !editTotalAmount) return;
    setIsSaving(true);
    try {
      await updateDebt(user.uid, editingDebtId, {
        name: editForm.name,
        type: editForm.type as any,
        total_amount: parseNumberInput(editTotalAmount),
        monthly_payment: parseNumberInput(editMonthlyPayment),
        term_months: Number(editForm.term_months || 1)
      });
      setEditingDebtId(null);
      setEditTotalAmount('');
      setEditMonthlyPayment('');
      showToast('Đã lưu thay đổi khoản nợ!', 'success');
    } catch (err) {
      showToast('Không thể cập nhật thông tin.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteDebt = (id: string, name: string) => {
    confirm({
      title: 'Xóa khoản công nợ?',
      message: `Hành động này sẽ xóa vĩnh viễn khoản nợ "${name}" và không thể khôi phục tự động.`,
      confirmLabel: 'Xóa ngay',
      cancelLabel: 'Bỏ qua',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteDebt(user.uid, id);
          if (editingDebtId === id) {
            setEditingDebtId(null);
          }
          showToast('Đã xóa khoản công nợ thành công!', 'success');
        } catch (err) {
          showToast('Xảy ra lỗi khi xóa khoản nợ.', 'error');
        }
      }
    });
  };

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDebt.name || !newTotalAmount) return;
    setIsSaving(true);
    try {
      await addDebt(user.uid, {
        name: newDebt.name,
        total_amount: parseNumberInput(newTotalAmount),
        paid_amount: 0,
        monthly_payment: parseNumberInput(newMonthlyPayment),
        term_months: Number(newDebt.term_months || 1),
        start_date: new Date().getTime(),
        type: newDebt.type as any
      });
      setShowNewDebt(false);
      setNewDebt({ type: 'debt' });
      setNewTotalAmount('');
      setNewMonthlyPayment('');
      showToast('Đã thêm khoản công nợ mới thành công!', 'success');
    } catch (err) {
      showToast('Có lỗi xảy ra khi thêm.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const period = useMemo(() => {
    return getCurrentPeriod(settlementConfig, customCycles);
  }, [settlementConfig, customCycles]);

  const monthTxs = useMemo(() => {
    const { start, end } = period;
    return transactions.filter(t => isWithinInterval(new Date(t.date), { start, end }));
  }, [transactions, period]);

  // Find Grocery category ("Đi chợ" or similar)
  const groceryCat = categories.find(c => c.name.toLowerCase().includes('grocery') || c.name.toLowerCase().includes('chợ'));
  
  const groceryTxs = useMemo(() => {
    if (!groceryCat) return [];
    return monthTxs.filter(t => t.category_id === groceryCat.id && !t.is_split_pending);
  }, [monthTxs, groceryCat]);

  const totalGrocery = groceryTxs.reduce((sum, t) => sum + t.amount, 0);
  const myShare = splitCount > 0 ? totalGrocery / splitCount : totalGrocery;

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

  // Dynamically calculate paid_amount for each debt based on actual transactions
  const resolvedDebts = useMemo(() => {
    return debts.map(d => {
      const debtTxs = transactions.filter(t => t.debt_id === d.id);
      const computedPaid = debtTxs.reduce((sum, t) => sum + t.amount, 0);
      return {
        ...d,
        paid_amount: computedPaid
      };
    });
  }, [debts, transactions]);

  // Calculate outstanding loans and debts
  const debtStats = useMemo(() => {
    let outstandingLoans = 0;
    let outstandingDebts = 0;

    resolvedDebts.forEach(d => {
      const remaining = d.total_amount - d.paid_amount;
      if (d.type === 'loan') {
        outstandingLoans += Math.max(0, remaining);
      } else {
        outstandingDebts += Math.max(0, remaining);
      }
    });

    const adjustedBalance = cashStats.balance - outstandingDebts;

    return {
      outstandingLoans,
      outstandingDebts,
      adjustedBalance
    };
  }, [resolvedDebts, cashStats]);

  const handleSettle = async () => {
    if (groceryTxs.length === 0 || !groceryCat) return;
    setIsSplitting(true);
    try {
      // Mark old as split and create new transaction for just my share
      for (const t of groceryTxs) {
        await updateTransaction(user.uid, t.id!, { is_split_pending: true });
      }

      await addTransaction(user.uid, {
        category_id: groceryCat.id!,
        amount: myShare,
        type: 'expense',
        date: new Date().getTime(),
        note: 'Tiền đi chợ (Đã chia)',
        is_split_pending: false
      });

      // We can also create a 'debt' for the remainder to collect from roommates
      await addDebt(user.uid, {
        name: `Tiền đi chợ cần thu (Bạn cùng phòng)`,
        total_amount: totalGrocery - myShare,
        paid_amount: 0,
        monthly_payment: totalGrocery - myShare,
        term_months: 1,
        start_date: new Date().getTime(),
        type: 'loan'
      });

      showToast('Quyết toán chia tiền đi chợ hoàn tất!', 'success');
    } catch (err) {
      showToast('Có lỗi phát sinh khi chia tiền.', 'error');
    } finally {
      setIsSplitting(false);
    }
  };

  const handleRecordPayment = async (debt: DebtInstallment) => {
    const paymentAmount = Math.min(debt.total_amount - debt.paid_amount, debt.monthly_payment || (debt.total_amount - debt.paid_amount));
    if (paymentAmount <= 0) return;

    const catName = debt.type === 'loan' ? 'Thu hồi nợ' : 'Trả nợ & Trả góp';
    const catType = debt.type === 'loan' ? 'income' : 'expense';
    const catColor = debt.type === 'loan' ? '#17B978' : '#F0426B';
    const catIcon = debt.type === 'loan' ? 'DollarSign' : 'CreditCard';

    try {
      let cat = categories.find(c => c.name.toLowerCase() === catName.toLowerCase() && c.type === catType);
      let catId = cat?.id;

      if (!catId) {
        const newCat = await addCategory(user.uid, {
          name: catName,
          type: catType,
          color: catColor,
          icon: catIcon
        });
        catId = newCat.id;
      }

      await addTransaction(user.uid, {
        category_id: catId,
        amount: paymentAmount,
        type: catType,
        date: new Date().getTime(),
        note: debt.type === 'loan' ? `Thu hồi nợ: ${debt.name}` : `Trả nợ/trả góp: ${debt.name}`,
        is_split_pending: false,
        debt_id: debt.id
      });

      await updateDebt(user.uid, debt.id!, {
        paid_amount: debt.paid_amount + paymentAmount
      });

      showToast(`Ghi nhận thanh toán ${formatCurrency(paymentAmount)} thành công!`, 'success');
    } catch (err) {
      showToast('Không thể ghi nhận thanh toán.', 'error');
    }
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-44 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <CardSkeleton />
          <CardSkeleton />
          <CardSkeleton />
        </div>
        <div className="h-56 bg-slate-100 rounded-2xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight text-amber-950 leading-none flex items-center gap-2">
          Nợ & Chia tiền <span className="text-2xl">🧺</span>
        </h1>
        <p className="text-xs sm:text-sm text-amber-800/80 font-bold mt-1.5">
          Kiểm soát các khoản công nợ, trả góp và chia sẻ tiền đi chợ nhóm cùng bé Coin nha! ✨
        </p>
      </div>

      {/* THREE-CARD HERO WALLET OVERVIEWS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#FEFCE8] via-[#FEF9C3] to-[#FEF08A] p-6 shadow-md border-4 border-[#FFF2D8] flex flex-col justify-between min-h-[120px] group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-default">
          <div className="absolute inset-0 bg-gradient-radial from-amber-500/5 to-transparent opacity-60 pointer-events-none" />
          <div className="absolute -right-2 -bottom-2 opacity-[0.12] transform group-hover:scale-110 transition-transform duration-300">
            <Wallet className="w-28 h-28 text-amber-950" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-900/90">Số dư ví khả dụng 👛</span>
              <div className="p-1 rounded-lg bg-amber-950/5 text-amber-700">
                <Wallet className="w-4 h-4 stroke-[2.5]" />
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-amber-950 tabular-nums">
              {formatCurrency(debtStats.adjustedBalance)}
            </p>
          </div>
          <p className="text-[10px] text-amber-900/80 mt-3 flex items-center gap-1.5 leading-tight relative z-10 font-bold">
            <Info className="w-3.5 h-3.5 shrink-0 text-amber-600" />
            <span>Đã khấu trừ các khoản công nợ.</span>
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-md border-4 border-[#FFF2D8] flex flex-col justify-between min-h-[120px] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-default">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800/80">Cho vay chưa thu 💸</span>
              <div className="p-1 rounded-lg bg-emerald-50 text-emerald-600">
                <ArrowUpRight className="w-4 h-4 stroke-[2.5]" />
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-emerald-600 tabular-nums">
              {formatCurrency(debtStats.outstandingLoans)}
            </p>
          </div>
          <p className="text-[10px] text-amber-800/60 mt-3 font-bold leading-tight">
            Sẽ tự động cộng về ví khi nhận lại.
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-md border-4 border-[#FFF2D8] flex flex-col justify-between min-h-[120px] transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-default">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800/80">Nợ & Trả góp còn lại 💳</span>
              <div className="p-1 rounded-lg bg-rose-50 text-rose-500">
                <ArrowDownLeft className="w-4 h-4 stroke-[2.5]" />
              </div>
            </div>
            <p className="text-2xl font-black font-mono tracking-tight text-rose-500 tabular-nums">
              {formatCurrency(debtStats.outstandingDebts)}
            </p>
          </div>
          <p className="text-[10px] text-amber-800/60 mt-3 font-bold leading-tight">
            Sẽ khấu trừ dứt điểm khi tất toán.
          </p>
        </div>
      </div>

      {/* SECTION B: Shared Grocery Splitter (Premium warm wood gradient container) */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-amber-900 to-amber-950 p-6 text-white shadow-xl border-4 border-[#FFF2D8]">
        <div className="absolute inset-0 bg-gradient-radial from-[#FFB700]/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between mb-5 gap-3.5 border-b border-white/10 pb-4">
          <h2 className="text-base font-black flex items-center gap-2 text-amber-50">
            <span className="text-xl leading-none">🧺</span>
            Quyết toán chia hóa đơn đi chợ nhóm
          </h2>
          <div className="bg-white/10 text-amber-100 text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-bold">
            <Calendar className="w-3.5 h-3.5 text-amber-400" />
            <span>Chu kỳ: {format(period.start, 'dd/MM')} - {format(period.end, 'dd/MM')}</span>
          </div>
        </div>

        {!groceryCat ? (
          <p className="text-xs text-amber-200/80 font-bold">Lưu ý: Bạn cần khởi tạo một danh mục chi phí có tên chứa chữ "Đi chợ" hoặc "Grocery" để kích hoạt quyết toán nhóm nha.</p>
        ) : (
          <div className="relative z-10 flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div className="bg-white/5 rounded-2xl p-4.5 border border-white/10">
                <p className="text-xs text-amber-200/70 font-black uppercase tracking-widest mb-1.5">Tổng tiền đi chợ chưa chia</p>
                <p className="text-2xl font-black font-mono tracking-tight text-emerald-400">{formatCurrency(totalGrocery)}</p>
                <p className="text-xs text-amber-100/70 mt-2 font-semibold">Thống kê từ {groceryTxs.length} giao dịch chưa quyết toán trong chu kỳ.</p>
              </div>
            </div>
            <div className="flex-1 space-y-4 flex flex-col justify-between">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-black text-amber-200 mb-1.5 ml-1">Chia đều cho (Số người)</label>
                <input
                  type="number"
                  min="1"
                  value={splitCount}
                  onChange={(e) => setSplitCount(Math.max(1, Number(e.target.value)))}
                  className="block w-full rounded-2xl border-none outline-none py-2.5 px-3.5 text-slate-900 text-sm font-black bg-[#FFFDF9] cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between py-2 border-t border-white/10">
                <span className="text-xs font-black uppercase tracking-widest text-amber-200">Phần tiền bạn chi trả:</span>
                <span className="text-xl font-black text-emerald-400 font-mono tracking-tight">{formatCurrency(myShare)}</span>
              </div>
              <button
                onClick={handleSettle}
                disabled={totalGrocery === 0 || isSplitting}
                className={`w-full flex items-center justify-center gap-2 rounded-2xl px-4 py-3 text-sm font-black text-amber-950 transition-all border-b-4 ${
                  totalGrocery === 0 || isSplitting
                    ? 'bg-amber-800 text-amber-900 border-amber-900 cursor-not-allowed'
                    : 'bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] border-amber-600 hover:scale-[1.01] cursor-pointer shadow-md shadow-amber-950/25'
                }`}
              >
                {isSplitting ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Đang chia tiền...</span>
                  </>
                ) : (
                  <span>Xác nhận chia tiền & Khấu trừ</span>
                )}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* SECTION A: Debt & Installment list */}
      <section>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-sm font-black text-amber-950 flex items-center uppercase tracking-widest">
            <CreditCard className="w-5 h-5 mr-2 text-[#FFB700]" />
            Hợp đồng Nợ & Trả góp đang chạy 📜
          </h2>
          <button 
            onClick={() => setShowNewDebt(!showNewDebt)} 
            className="text-xs font-black text-amber-950 hover:bg-amber-200 flex items-center gap-1 cursor-pointer bg-amber-100 px-3.5 py-2.5 rounded-2xl transition-all border-b-2 border-amber-300"
          >
            {showNewDebt ? (
              <>
                <X className="w-3.5 h-3.5 stroke-[3]" /> Hủy bỏ
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5 stroke-[3]" /> Thêm khoản mới
              </>
            )}
          </button>
        </div>

        {showNewDebt && (
          <form onSubmit={handleAddDebt} className="bg-white p-6 rounded-3xl shadow-lg border-4 border-[#FFF2D8] mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Tên hợp đồng / Ghi chú</label>
              <input required type="text" placeholder="Ví dụ: Vay mua Mac, Nợ anh Nam..." value={newDebt.name || ''} onChange={e => setNewDebt({...newDebt, name: e.target.value})} className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold" />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Phân nhóm</label>
              <select value={newDebt.type} onChange={e => setNewDebt({...newDebt, type: e.target.value as any})} className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold cursor-pointer">
                <option value="debt">💸 Khoản Nợ (Mình đi mượn người khác)</option>
                <option value="loan">💰 Cho vay (Mình cho người khác mượn)</option>
                <option value="installment">💳 Trả góp (Mua trước trả sau)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Tổng giá trị nợ</label>
              <input
                required
                type="text"
                placeholder="Ví dụ: 10,000,000"
                value={newTotalAmount}
                onChange={e => setNewTotalAmount(formatNumberInput(e.target.value))}
                className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Đóng trả định kỳ hàng tháng</label>
              <input
                type="text"
                placeholder="Ví dụ: 500,000"
                value={newMonthlyPayment}
                onChange={e => setNewMonthlyPayment(formatNumberInput(e.target.value))}
                className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <button 
                type="submit" 
                disabled={isSaving}
                className="w-full bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] text-amber-950 py-3 rounded-2xl font-black text-sm border-b-4 border-amber-600 hover:scale-[1.01] transition-all shadow-md shadow-amber-100 cursor-pointer"
              >
                {isSaving ? 'Bé Coin đang tạo...' : 'Lưu thông tin công nợ! ✨'}
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {resolvedDebts.map(debt => {
            const progress = (debt.paid_amount / debt.total_amount) * 100;
            
            if (editingDebtId === debt.id) {
              return (
                <form key={debt.id} onSubmit={handleUpdateDebt} className="bg-white p-6 rounded-3xl shadow-lg border-4 border-[#FFC300] space-y-4 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex justify-between items-center pb-2 border-b border-amber-100/50">
                    <h3 className="font-black text-amber-950 text-sm">Sửa khoản nợ này ✏️</h3>
                    <button
                      type="button"
                      onClick={() => setEditingDebtId(null)}
                      className="p-1 rounded-full text-amber-700 hover:bg-amber-50 hover:text-amber-900 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1.5 ml-1">Tên / Ghi chú</label>
                      <input
                        required
                        type="text"
                        value={editForm.name || ''}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1.5 ml-1">Loại</label>
                        <select
                          value={editForm.type}
                          onChange={e => setEditForm({ ...editForm, type: e.target.value as any })}
                          className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold cursor-pointer"
                        >
                          <option value="debt">Phải trả</option>
                          <option value="loan">Cho vay</option>
                          <option value="installment">Trả góp</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1.5 ml-1">Tổng tiền</label>
                        <input
                          required
                          type="text"
                          value={editTotalAmount}
                          onChange={e => setEditTotalAmount(formatNumberInput(e.target.value))}
                          className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-amber-800 uppercase tracking-widest mb-1.5 ml-1">Thanh toán mỗi tháng</label>
                      <input
                        type="text"
                        value={editMonthlyPayment}
                        onChange={e => setEditMonthlyPayment(formatNumberInput(e.target.value))}
                        className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-amber-100/50">
                    <button
                      type="button"
                      onClick={() => setEditingDebtId(null)}
                      className="px-3.5 py-2 rounded-xl bg-amber-50 text-amber-800 text-xs font-bold hover:bg-amber-100 transition-colors cursor-pointer"
                    >
                      Bỏ qua nha
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] text-amber-950 text-xs font-black transition-colors shadow-sm flex items-center gap-1 cursor-pointer"
                    >
                      {isSaving ? 'Đợi tí...' : 'Lưu thay đổi ✨'}
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div key={debt.id} className="bg-white p-6 rounded-3xl shadow-md border-4 border-[#FFF2D8] flex flex-col justify-between hover:shadow-xl transition-all duration-300">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest mb-2.5 ${
                        debt.type === 'loan' ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : debt.type === 'debt' ? 'bg-orange-50 text-orange-600 border border-orange-200' : 'bg-amber-50 text-amber-800 border border-amber-200'
                      }`}>
                        {debt.type === 'loan' ? '💸 Cho vay' : debt.type === 'debt' ? '🔒 Phải Trả' : '💳 Trả góp'}
                      </span>
                      <h3 className="font-black text-amber-950 tracking-tight leading-snug">{debt.name}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-base sm:text-lg font-black text-amber-950 font-mono tracking-tight">{formatCurrency(debt.total_amount)}</p>
                      <p className="text-xs text-amber-850/60 font-bold mt-0.5">{formatCurrency(debt.monthly_payment)} / tháng</p>
                    </div>
                  </div>
                  
                  <div className="mb-2 flex justify-between text-xs font-bold text-amber-800/80">
                    <span>Đã trả: <span className="font-mono text-amber-950 font-black">{formatCurrency(debt.paid_amount)}</span></span>
                    <span>Còn lại: <span className="font-mono text-amber-950 font-black">{formatCurrency(Math.max(0, debt.total_amount - debt.paid_amount))}</span></span>
                  </div>
                  
                  {/* Rounded Progress Track */}
                  <div className="w-full bg-amber-50/50 border border-amber-100/50 rounded-full h-3 overflow-hidden shadow-inner mb-4 relative p-[1px]">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, progress)}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={`h-full rounded-full ${debt.type === 'loan' ? 'bg-emerald-500' : 'bg-amber-500'}`} 
                    />
                  </div>
                </div>

                <div className="mt-2 flex justify-between items-center border-t border-amber-100/40 pt-3.5">
                  <div className="flex gap-3">
                    <button
                      onClick={() => startEdit(debt)}
                      className="text-xs text-amber-800/60 hover:text-amber-900 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Chỉnh sửa thông tin"
                    >
                      <Pencil className="w-3.5 h-3.5 stroke-[2.5]" />
                      Sửa
                    </button>
                    
                    <button
                      onClick={() => handleDeleteDebt(debt.id!, debt.name)}
                      className="text-xs text-rose-400 hover:text-rose-700 font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Xóa khoản nợ"
                    >
                      <Trash2 className="w-3.5 h-3.5 stroke-[2.5]" />
                      Xóa
                    </button>
                  </div>

                  <button 
                    onClick={() => handleRecordPayment(debt)}
                    className="text-xs font-black text-amber-950 hover:bg-amber-200 bg-amber-100 px-3.5 py-2 rounded-2xl transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer border-b border-amber-300"
                    disabled={debt.paid_amount >= debt.total_amount}
                  >
                    + Ghi nhận đã trả
                  </button>
                </div>
              </div>
            );
          })}
          {resolvedDebts.length === 0 && !showNewDebt && (
            <div className="col-span-2 text-center text-amber-800 py-14 bg-white rounded-3xl border-4 border-[#FFF2D8] flex flex-col items-center justify-center gap-2 shadow">
              <span className="text-4xl">🐾</span>
              <div>
                <p className="font-black text-amber-950">Chưa có khoản công nợ nào hết á</p>
                <p className="text-xs text-amber-700/70 mt-1">Sử dụng nút "Thêm khoản mới" phía trên để theo dõi tín dụng/cho vay nha.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
