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

    const adjustedBalance = cashStats.balance - outstandingLoans - outstandingDebts;

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
        <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-none">Nợ & Chia tiền</h1>
        <p className="text-sm text-slate-500 font-medium mt-1.5">Kiểm soát các khoản công nợ, quản lý trả góp mua trước trả sau, chia sẻ tiền đi chợ thông minh.</p>
      </div>

      {/* THREE-CARD HERO WALLET OVERVIEWS */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#FEFCE8] via-[#FEF9C3] to-[#FEF08A] p-6 shadow-sm border border-yellow-200/70 flex flex-col justify-between min-h-[120px] group transition-all duration-300 hover:-translate-y-1 hover:shadow-lg cursor-default">
          <div className="absolute inset-0 bg-gradient-radial from-amber-500/5 to-transparent opacity-60 pointer-events-none" />
          <div className="absolute -right-2 -bottom-2 opacity-[0.08] transform group-hover:scale-110 transition-transform duration-300">
            <Wallet className="w-28 h-28 text-amber-950" />
          </div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-amber-800/90">Số dư ví khả dụng</span>
              <div className="p-1 rounded-lg bg-amber-950/5 text-amber-700">
                <Wallet className="w-4 h-4" />
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

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/60 flex flex-col justify-between min-h-[120px] transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-default">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Tiền cho vay chưa thu</span>
              <div className="p-1 rounded-lg bg-emerald-50 text-[#17B978]">
                <ArrowUpRight className="w-4 h-4" />
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

        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-100/60 flex flex-col justify-between min-h-[120px] transition-all duration-300 hover:-translate-y-1 hover:shadow-md cursor-default">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">Nợ & Trả góp còn lại</span>
              <div className="p-1 rounded-lg bg-rose-50 text-[#F0426B]">
                <ArrowDownLeft className="w-4 h-4" />
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

      {/* SECTION B: Shared Grocery Splitter (Premium deep Navy gradient container) */}
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-[#0B0F19] to-[#0F172A] p-6 text-white shadow-xl border border-slate-800/20">
        <div className="absolute inset-0 bg-gradient-radial from-[#4F6EF7]/5 to-transparent pointer-events-none" />
        <div className="relative z-10 flex flex-col xl:flex-row xl:items-center justify-between mb-5 gap-3.5 border-b border-white/5 pb-4">
          <h2 className="text-base font-bold flex items-center gap-2">
            <span className="text-xl leading-none">🧺</span>
            Quyết toán chia hóa đơn đi chợ nhóm
          </h2>
          <div className="bg-white/5 text-slate-300 text-xs px-3.5 py-1.5 rounded-xl flex items-center gap-1.5 font-semibold">
            <Calendar className="w-3.5 h-3.5 text-[#4F6EF7]" />
            <span>Chu kỳ: {format(period.start, 'dd/MM')} - {format(period.end, 'dd/MM')}</span>
          </div>
        </div>

        {!groceryCat ? (
          <p className="text-xs text-slate-400 font-medium">Lưu ý: Bạn cần khởi tạo một danh mục chi phí có tên chứa chữ "Đi chợ" hoặc "Grocery" để kích hoạt quyết toán nhóm.</p>
        ) : (
          <div className="relative z-10 flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div className="bg-white/5 rounded-xl p-4.5 border border-white/5">
                <p className="text-xs text-slate-400 font-bold uppercase tracking-wider mb-1.5">Tổng tiền đi chợ chưa chia</p>
                <p className="text-2xl font-bold font-mono tracking-tight text-[#17B978]">{formatCurrency(totalGrocery)}</p>
                <p className="text-xs text-slate-400 mt-2 font-medium">Thống kê từ {groceryTxs.length} giao dịch chưa quyết toán trong chu kỳ.</p>
              </div>
            </div>
            <div className="flex-1 space-y-4 flex flex-col justify-between">
              <div>
                <label className="block text-[10px] uppercase tracking-widest font-bold text-slate-400 mb-1.5">Chia đều cho (Số người)</label>
                <input
                  type="number"
                  min="1"
                  value={splitCount}
                  onChange={(e) => setSplitCount(Math.max(1, Number(e.target.value)))}
                  className="block w-full rounded-xl border-0 py-2.5 px-3.5 text-slate-900 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-[#4F6EF7] text-sm font-semibold bg-white cursor-pointer"
                />
              </div>
              <div className="flex items-center justify-between py-2 border-t border-white/5">
                <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Phần tiền bạn chi trả:</span>
                <span className="text-xl font-bold text-emerald-400 font-mono tracking-tight">{formatCurrency(myShare)}</span>
              </div>
              <button
                onClick={handleSettle}
                disabled={totalGrocery === 0 || isSplitting}
                className={`w-full flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-bold text-slate-950 transition-all ${
                  totalGrocery === 0 || isSplitting
                    ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                    : 'bg-[#17B978] hover:bg-[#17B978]/90 hover:scale-[1.01] cursor-pointer'
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
          <h2 className="text-base font-bold text-slate-900 flex items-center uppercase tracking-wider">
            <CreditCard className="w-5 h-5 mr-2 text-[#4F6EF7]" />
            Hợp đồng Nợ & Trả góp đang chạy
          </h2>
          <button 
            onClick={() => setShowNewDebt(!showNewDebt)} 
            className="text-xs font-bold text-[#4F6EF7] hover:text-[#4F6EF7]/80 flex items-center gap-1 cursor-pointer bg-indigo-50 px-3 py-2 rounded-xl transition-colors"
          >
            {showNewDebt ? (
              <>
                <X className="w-3.5 h-3.5" /> Hủy bỏ
              </>
            ) : (
              <>
                <Plus className="w-3.5 h-3.5" /> Thêm khoản mới
              </>
            )}
          </button>
        </div>

        {showNewDebt && (
          <form onSubmit={handleAddDebt} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4 animate-in fade-in zoom-in-95 duration-150">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Tên hợp đồng / Mô tả</label>
              <input required type="text" placeholder="Ví dụ: Vay mua Mac, Nợ anh Nam..." value={newDebt.name || ''} onChange={e => setNewDebt({...newDebt, name: e.target.value})} className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-[#4F6EF7] text-sm font-semibold" />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Phân nhóm</label>
              <select value={newDebt.type} onChange={e => setNewDebt({...newDebt, type: e.target.value as any})} className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-[#4F6EF7] text-sm font-semibold bg-white cursor-pointer">
                <option value="debt">Khoản Nợ (Mình đi mượn người khác)</option>
                <option value="loan">Cho vay (Mình cho người khác mượn)</option>
                <option value="installment">Trả góp (Mua trả trước hàng tháng)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Tổng giá trị nợ</label>
              <input
                required
                type="text"
                placeholder="Ví dụ: 10,000,000"
                value={newTotalAmount}
                onChange={e => setNewTotalAmount(formatNumberInput(e.target.value))}
                className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-[#4F6EF7] text-sm font-semibold font-mono"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Đóng trả định kỳ hàng tháng</label>
              <input
                type="text"
                placeholder="Ví dụ: 500,000"
                value={newMonthlyPayment}
                onChange={e => setNewMonthlyPayment(formatNumberInput(e.target.value))}
                className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-[#4F6EF7] text-sm font-semibold font-mono"
              />
            </div>
            <div className="sm:col-span-2">
              <button 
                type="submit" 
                disabled={isSaving}
                className="w-full bg-[#4F6EF7] text-white py-3 rounded-xl font-bold text-sm hover:bg-[#4F6EF7]/90 hover:scale-[1.01] transition-all shadow-md shadow-indigo-100 cursor-pointer"
              >
                {isSaving ? 'Đang tạo...' : 'Lưu thông tin công nợ'}
              </button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {resolvedDebts.map(debt => {
            const progress = (debt.paid_amount / debt.total_amount) * 100;
            
            if (editingDebtId === debt.id) {
              return (
                <form key={debt.id} onSubmit={handleUpdateDebt} className="bg-white p-6 rounded-2xl shadow-md border-2 border-[#4F6EF7] space-y-4 animate-in fade-in zoom-in-95 duration-150">
                  <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                    <h3 className="font-bold text-slate-900 text-sm">Chỉnh sửa khoản công nợ</h3>
                    <button
                      type="button"
                      onClick={() => setEditingDebtId(null)}
                      className="p-1 rounded-full text-slate-400 hover:bg-slate-50 hover:text-slate-600 transition-colors cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tên / Ghi chú</label>
                      <input
                        required
                        type="text"
                        value={editForm.name || ''}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="block w-full rounded-xl border-0 py-2 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-semibold"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Loại</label>
                        <select
                          value={editForm.type}
                          onChange={e => setEditForm({ ...editForm, type: e.target.value as any })}
                          className="block w-full rounded-xl border-0 py-2 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-semibold bg-white cursor-pointer"
                        >
                          <option value="debt">Nợ</option>
                          <option value="loan">Cho vay</option>
                          <option value="installment">Trả góp</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Tổng tiền</label>
                        <input
                          required
                          type="text"
                          value={editTotalAmount}
                          onChange={e => setEditTotalAmount(formatNumberInput(e.target.value))}
                          className="block w-full rounded-xl border-0 py-2 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-semibold font-mono"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1">Thanh toán mỗi tháng</label>
                      <input
                        type="text"
                        value={editMonthlyPayment}
                        onChange={e => setEditMonthlyPayment(formatNumberInput(e.target.value))}
                        className="block w-full rounded-xl border-0 py-2 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-semibold font-mono"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                    <button
                      type="button"
                      onClick={() => setEditingDebtId(null)}
                      className="px-3.5 py-1.5 rounded-lg bg-slate-50 text-slate-600 text-xs font-bold hover:bg-slate-100 transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      disabled={isSaving}
                      className="px-3.5 py-1.5 rounded-lg bg-[#4F6EF7] text-white text-xs font-bold hover:bg-[#4F6EF7]/90 transition-colors shadow-sm flex items-center gap-1 cursor-pointer"
                    >
                      {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div key={debt.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 flex flex-col justify-between hover:shadow-md transition-all duration-300">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className={`inline-block px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-widest mb-2.5 ${
                        debt.type === 'loan' ? 'bg-emerald-50 text-[#17B978]' : debt.type === 'debt' ? 'bg-orange-50 text-orange-600' : 'bg-indigo-50 text-[#4F6EF7]'
                      }`}>
                        {debt.type === 'loan' ? 'Cho vay' : debt.type === 'debt' ? 'Phải Trả' : 'Trả góp'}
                      </span>
                      <h3 className="font-bold text-slate-900 tracking-tight leading-snug">{debt.name}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-slate-950 font-mono tracking-tight">{formatCurrency(debt.total_amount)}</p>
                      <p className="text-xs text-slate-400 font-semibold mt-0.5">{formatCurrency(debt.monthly_payment)} / tháng</p>
                    </div>
                  </div>
                  
                  <div className="mb-2 flex justify-between text-xs font-semibold text-slate-500">
                    <span>Đã trả: <span className="font-mono text-slate-700">{formatCurrency(debt.paid_amount)}</span></span>
                    <span>Còn lại: <span className="font-mono text-slate-800">{formatCurrency(Math.max(0, debt.total_amount - debt.paid_amount))}</span></span>
                  </div>
                  
                  {/* Rounded Progress Track */}
                  <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden shadow-inner mb-4 relative p-[1px]">
                    <motion.div 
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, progress)}%` }}
                      transition={{ duration: 0.5, ease: 'easeOut' }}
                      className={`h-full rounded-full ${debt.type === 'loan' ? 'bg-[#17B978]' : 'bg-[#4F6EF7]'}`} 
                    />
                  </div>
                </div>

                <div className="mt-2 flex justify-between items-center border-t border-slate-100/60 pt-3.5">
                  <div className="flex gap-3">
                    <button
                      onClick={() => startEdit(debt)}
                      className="text-xs text-slate-400 hover:text-[#4F6EF7] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Chỉnh sửa thông tin"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Sửa
                    </button>
                    
                    <button
                      onClick={() => handleDeleteDebt(debt.id!, debt.name)}
                      className="text-xs text-slate-400 hover:text-[#F0426B] font-bold flex items-center gap-1 transition-colors cursor-pointer"
                      title="Xóa khoản nợ"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      Xóa
                    </button>
                  </div>

                  <button 
                    onClick={() => handleRecordPayment(debt)}
                    className="text-xs font-bold text-[#4F6EF7] hover:text-[#4F6EF7]/90 bg-indigo-50/70 hover:bg-indigo-100 px-3.5 py-2 rounded-xl transition-colors disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                    disabled={debt.paid_amount >= debt.total_amount}
                  >
                    + Ghi nhận đã trả
                  </button>
                </div>
              </div>
            );
          })}
          {resolvedDebts.length === 0 && !showNewDebt && (
            <div className="col-span-2 text-center text-slate-400 py-14 bg-white rounded-2xl border border-slate-100 flex flex-col items-center justify-center gap-2">
              <Landmark className="w-10 h-10 text-slate-200 stroke-[1.5]" />
              <div>
                <p className="font-bold text-slate-700">Chưa ghi nhận khoản công nợ nào</p>
                <p className="text-xs text-slate-400 mt-1">Sử dụng nút "Thêm khoản mới" phía trên để theo dõi tín dụng/cho vay.</p>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
