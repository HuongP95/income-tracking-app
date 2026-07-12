import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { subscribeToDebts, subscribeToTransactions, subscribeToCategories, addDebt, updateDebt, deleteDebt, addTransaction, updateTransaction, addCategory } from '../lib/db';
import { DebtInstallment, Transaction, Category, CustomCycle } from '../types';
import { isWithinInterval, format } from 'date-fns';
import { Users, CreditCard, Calendar, Wallet, ArrowUpRight, ArrowDownLeft, Info, Pencil, Trash2, X, Check } from 'lucide-react';
import { formatCurrency, getSettlementPeriod, formatNumberInput, parseNumberInput, getCurrentPeriod } from '../lib/utils';

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
  const [debts, setDebts] = useState<DebtInstallment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  
  const [showNewDebt, setShowNewDebt] = useState(false);
  const [newDebt, setNewDebt] = useState<Partial<DebtInstallment>>({ type: 'debt' });
  const [splitCount, setSplitCount] = useState(2);

  const [newTotalAmount, setNewTotalAmount] = useState('');
  const [newMonthlyPayment, setNewMonthlyPayment] = useState('');

  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Partial<DebtInstallment>>({});
  const [editTotalAmount, setEditTotalAmount] = useState('');
  const [editMonthlyPayment, setEditMonthlyPayment] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startEdit = (debt: DebtInstallment) => {
    setEditingDebtId(debt.id || null);
    setEditForm({ ...debt });
    setEditTotalAmount(formatNumberInput(debt.total_amount));
    setEditMonthlyPayment(formatNumberInput(debt.monthly_payment || 0));
    setConfirmDeleteId(null);
  };

  const handleUpdateDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingDebtId || !editForm.name || !editTotalAmount) return;
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
  };

  const handleDeleteDebt = async (id: string) => {
    await deleteDebt(user.uid, id);
    if (editingDebtId === id) {
      setEditingDebtId(null);
    }
    setConfirmDeleteId(null);
  };

  useEffect(() => {
    const unsubD = subscribeToDebts(user.uid, setDebts);
    const unsubT = subscribeToTransactions(user.uid, setTransactions);
    const unsubC = subscribeToCategories(user.uid, setCategories);
    return () => { unsubD(); unsubT(); unsubC(); };
  }, [user.uid]);

  const handleAddDebt = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDebt.name || !newTotalAmount) return;
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

    // Adjusted Balance: cashBalance - Loans outstanding - Debts outstanding
    const adjustedBalance = cashStats.balance - outstandingLoans - outstandingDebts;

    return {
      outstandingLoans,
      outstandingDebts,
      adjustedBalance
    };
  }, [resolvedDebts, cashStats]);

  const handleSettle = async () => {
    if (groceryTxs.length === 0 || !groceryCat) return;
    
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
  };

  const handleRecordPayment = async (debt: DebtInstallment) => {
    const paymentAmount = Math.min(debt.total_amount - debt.paid_amount, debt.monthly_payment || (debt.total_amount - debt.paid_amount));
    if (paymentAmount <= 0) return;

    const catName = debt.type === 'loan' ? 'Thu hồi nợ' : 'Trả nợ & Trả góp';
    const catType = debt.type === 'loan' ? 'income' : 'expense';
    const catColor = debt.type === 'loan' ? '#10b981' : '#ef4444';
    const catIcon = debt.type === 'loan' ? 'DollarSign' : 'CreditCard';

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
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Nợ & Chia tiền</h1>
        <p className="text-sm text-gray-500">Theo dõi các khoản nợ, trả góp và chia sẻ hóa đơn.</p>
      </div>

      {/* SECTION: WALLET & CO-DEBT OVERVIEW */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-850 text-white p-6 rounded-2xl shadow-md relative overflow-hidden flex flex-col justify-between">
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-4 translate-y-4">
            <Wallet className="w-36 h-36" />
          </div>
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-indigo-100">Số dư ví khả dụng</span>
              <Wallet className="w-5 h-5 text-indigo-200" />
            </div>
            <p className="text-2xl font-bold font-mono tracking-tight">{formatCurrency(debtStats.adjustedBalance)}</p>
          </div>
          <p className="text-[10px] text-indigo-200 mt-4 leading-relaxed flex items-center gap-1">
            <Info className="w-3.5 h-3.5 shrink-0" />
            <span>Đã điều chỉnh theo nợ & cho vay thực tế.</span>
          </p>
        </div>

        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Tiền cho vay chưa thu</span>
              <ArrowUpRight className="w-5 h-5 text-emerald-500" />
            </div>
            <p className="text-2xl font-bold font-mono tracking-tight text-emerald-600">{formatCurrency(debtStats.outstandingLoans)}</p>
          </div>
          <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
            Sẽ được cộng lại vào Số dư ví khi thu hồi nợ (Ghi nhận "Đã trả").
          </p>
        </div>

        <div className="bg-white border border-gray-100 p-6 rounded-2xl shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex justify-between items-start mb-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-gray-500">Nợ & Trả góp còn lại</span>
              <ArrowDownLeft className="w-5 h-5 text-rose-500" />
            </div>
            <p className="text-2xl font-bold font-mono tracking-tight text-rose-600">{formatCurrency(debtStats.outstandingDebts)}</p>
          </div>
          <p className="text-[10px] text-gray-400 mt-4 leading-relaxed">
            Sẽ được cộng hoàn lại vào Số dư ví khi thanh toán hoàn tất nợ.
          </p>
        </div>
      </div>

      {/* SECTION B: Shared Grocery Splitter */}
      <section className="bg-indigo-900 text-white p-6 rounded-2xl shadow-lg">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-2">
          <h2 className="text-lg font-semibold flex items-center">
            <span className="text-xl mr-2">🧺</span>
            Chia Tiền Đi Chợ Thông Minh
          </h2>
          <div className="bg-indigo-800 text-indigo-100 text-xs px-3 py-1 rounded-full flex items-center gap-1">
            <Calendar className="w-3.5 h-3.5" />
            <span>Chu kỳ: {format(period.start, 'dd/MM')} - {format(period.end, 'dd/MM')} (Nhận lương ngày {settlementDay})</span>
          </div>
        </div>
        {!groceryCat ? (
          <p className="text-sm text-indigo-200">Tạo danh mục tên "Đi chợ" hoặc "Grocery" để sử dụng tính năng này.</p>
        ) : (
          <div className="flex flex-col md:flex-row gap-6">
            <div className="flex-1 space-y-4">
              <div className="bg-white/10 rounded-xl p-4">
                <p className="text-xs text-indigo-200 mb-1">Tổng tiền đi chợ chưa chia trong chu kỳ quyết toán</p>
                <p className="text-2xl font-bold font-mono">{formatCurrency(totalGrocery)}</p>
                <p className="text-xs text-indigo-300 mt-1">Từ {groceryTxs.length} giao dịch trong chu kỳ ({format(period.start, 'dd/MM/yyyy')} - {format(period.end, 'dd/MM/yyyy')})</p>
              </div>
            </div>
            <div className="flex-1 space-y-4">
              <div>
                <label className="block text-[10px] uppercase tracking-tighter text-indigo-200 mb-1">Chia với (Số người)</label>
                <input
                  type="number"
                  min="1"
                  value={splitCount}
                  onChange={(e) => setSplitCount(Number(e.target.value))}
                  className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
              </div>
              <div className="flex items-center justify-between gap-4 py-2">
                <span className="text-[10px] uppercase tracking-tighter text-indigo-200">Phần của bạn:</span>
                <span className="text-xl font-bold text-emerald-400 underline decoration-2 underline-offset-4">{formatCurrency(myShare)}</span>
              </div>
              <button
                onClick={handleSettle}
                disabled={totalGrocery === 0}
                className="w-full rounded-xl bg-emerald-500 px-3 py-3 text-sm font-bold text-indigo-950 shadow-md hover:bg-emerald-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Xác nhận chia tiền
              </button>
            </div>
          </div>
        )}
      </section>

      {/* SECTION A: Debt & Installment */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold text-gray-900 flex items-center">
            <CreditCard className="w-5 h-5 mr-2 text-indigo-600" />
            Nợ & Trả góp đang diễn ra
          </h2>
          <button onClick={() => setShowNewDebt(!showNewDebt)} className="text-sm text-indigo-600 font-medium hover:text-indigo-700">
            {showNewDebt ? 'Hủy' : '+ Thêm mới'}
          </button>
        </div>

        {showNewDebt && (
          <form onSubmit={handleAddDebt} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tên / Ghi chú</label>
              <input required type="text" value={newDebt.name || ''} onChange={e => setNewDebt({...newDebt, name: e.target.value})} className="block w-full rounded-md border-0 py-1.5 px-3 ring-1 ring-inset ring-gray-300 sm:text-sm" />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Loại</label>
              <select value={newDebt.type} onChange={e => setNewDebt({...newDebt, type: e.target.value as any})} className="block w-full rounded-md border-0 py-1.5 px-3 ring-1 ring-inset ring-gray-300 sm:text-sm">
                <option value="debt">Khoản Nợ (Mình nợ người khác)</option>
                <option value="loan">Cho vay (Người khác nợ mình)</option>
                <option value="installment">Trả góp (Mua trước trả sau)</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Tổng tiền</label>
              <input
                required
                type="text"
                inputMode="numeric"
                placeholder="Ví dụ: 10,000,000"
                value={newTotalAmount}
                onChange={e => setNewTotalAmount(formatNumberInput(e.target.value))}
                className="block w-full rounded-md border-0 py-1.5 px-3 ring-1 ring-inset ring-gray-300 sm:text-sm font-mono focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">Thanh toán mỗi tháng</label>
              <input
                type="text"
                inputMode="numeric"
                placeholder="Ví dụ: 500,000"
                value={newMonthlyPayment}
                onChange={e => setNewMonthlyPayment(formatNumberInput(e.target.value))}
                className="block w-full rounded-md border-0 py-1.5 px-3 ring-1 ring-inset ring-gray-300 sm:text-sm font-mono focus:ring-2 focus:ring-indigo-600"
              />
            </div>
            <div className="sm:col-span-2">
              <button type="submit" className="w-full bg-indigo-600 text-white py-2 rounded-md font-medium text-sm hover:bg-indigo-500">Lưu</button>
            </div>
          </form>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {resolvedDebts.map(debt => {
            const progress = (debt.paid_amount / debt.total_amount) * 100;
            
            if (editingDebtId === debt.id) {
              return (
                <form key={debt.id} onSubmit={handleUpdateDebt} className="bg-white p-6 rounded-2xl shadow-md border-2 border-indigo-500 space-y-4">
                  <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                    <h3 className="font-semibold text-indigo-950 text-sm">Chỉnh sửa khoản nợ / trả góp</h3>
                    <button
                      type="button"
                      onClick={() => setEditingDebtId(null)}
                      className="p-1 rounded-full text-gray-400 hover:bg-gray-100 hover:text-gray-600 transition-colors"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-3">
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tên / Ghi chú</label>
                      <input
                        required
                        type="text"
                        value={editForm.name || ''}
                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                        className="block w-full rounded-lg border-0 py-1.5 px-3 ring-1 ring-inset ring-gray-300 sm:text-sm focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Loại</label>
                        <select
                          value={editForm.type}
                          onChange={e => setEditForm({ ...editForm, type: e.target.value as any })}
                          className="block w-full rounded-lg border-0 py-1.5 px-3 ring-1 ring-inset ring-gray-300 sm:text-sm focus:ring-2 focus:ring-indigo-600"
                        >
                          <option value="debt">Nợ</option>
                          <option value="loan">Cho vay</option>
                          <option value="installment">Trả góp</option>
                        </select>
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Tổng tiền</label>
                        <input
                          required
                          type="text"
                          inputMode="numeric"
                          value={editTotalAmount}
                          onChange={e => setEditTotalAmount(formatNumberInput(e.target.value))}
                          className="block w-full rounded-lg border-0 py-1.5 px-3 ring-1 ring-inset ring-gray-300 sm:text-sm font-mono focus:ring-2 focus:ring-indigo-600"
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Thanh toán mỗi tháng</label>
                      <input
                        type="text"
                        inputMode="numeric"
                        value={editMonthlyPayment}
                        onChange={e => setEditMonthlyPayment(formatNumberInput(e.target.value))}
                        className="block w-full rounded-lg border-0 py-1.5 px-3 ring-1 ring-inset ring-gray-300 sm:text-sm font-mono focus:ring-2 focus:ring-indigo-600"
                      />
                    </div>
                  </div>

                  <div className="flex justify-end gap-2 pt-3 border-t border-gray-100">
                    <button
                      type="button"
                      onClick={() => setEditingDebtId(null)}
                      className="px-3 py-1.5 rounded-lg bg-gray-100 text-gray-700 text-xs font-semibold hover:bg-gray-200 transition-colors"
                    >
                      Hủy
                    </button>
                    <button
                      type="submit"
                      className="px-3 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold hover:bg-indigo-500 transition-colors shadow-sm"
                    >
                      Lưu thay đổi
                    </button>
                  </div>
                </form>
              );
            }

            return (
              <div key={debt.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <div>
                      <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider mb-2 ${debt.type === 'loan' ? 'bg-emerald-100 text-emerald-700' : 'bg-orange-100 text-orange-700'}`}>
                        {debt.type === 'loan' ? 'Cho vay' : debt.type === 'debt' ? 'Nợ' : 'Trả góp'}
                      </span>
                      <h3 className="font-semibold text-gray-900">{debt.name}</h3>
                    </div>
                    <div className="text-right">
                      <p className="text-lg font-bold text-gray-900">{formatCurrency(debt.total_amount)}</p>
                      <p className="text-xs text-gray-500">{formatCurrency(debt.monthly_payment)}/tháng</p>
                    </div>
                  </div>
                  
                  <div className="mb-2 flex justify-between text-xs text-gray-500">
                    <span>Đã trả: {formatCurrency(debt.paid_amount)}</span>
                    <span>Còn lại: {formatCurrency(Math.max(0, debt.total_amount - debt.paid_amount))}</span>
                  </div>
                  <div className="w-full bg-gray-100 rounded-full h-2 mb-4">
                    <div className="bg-indigo-600 h-2 rounded-full transition-all duration-350" style={{ width: `${Math.min(100, progress)}%` }}></div>
                  </div>
                </div>

                <div className="mt-2 flex justify-between items-center border-t border-gray-50 pt-3">
                  <div className="flex gap-3">
                    <button
                      onClick={() => startEdit(debt)}
                      className="text-xs text-gray-500 hover:text-indigo-600 font-semibold flex items-center gap-1 transition-colors"
                      title="Chỉnh sửa thông tin"
                    >
                      <Pencil className="w-3.5 h-3.5" />
                      Sửa
                    </button>
                    
                    {confirmDeleteId === debt.id ? (
                      <div className="flex items-center gap-1.5 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100 animate-pulse">
                        <span className="text-[10px] text-rose-700 font-bold">Xác nhận xóa?</span>
                        <button
                          onClick={() => handleDeleteDebt(debt.id!)}
                          className="p-0.5 rounded text-rose-700 hover:bg-rose-200"
                          title="Có, xóa đi"
                        >
                          <Check className="w-3 h-3" />
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-0.5 rounded text-gray-500 hover:bg-gray-200"
                          title="Không, giữ lại"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(debt.id || null)}
                        className="text-xs text-gray-400 hover:text-rose-600 font-semibold flex items-center gap-1 transition-colors"
                        title="Xóa khoản nợ"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Xóa
                      </button>
                    )}
                  </div>

                  <button 
                    onClick={() => handleRecordPayment(debt)}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    disabled={debt.paid_amount >= debt.total_amount}
                  >
                    + Ghi nhận đã trả
                  </button>
                </div>
              </div>
            );
          })}
          {resolvedDebts.length === 0 && !showNewDebt && (
            <div className="col-span-2 text-center text-gray-500 py-10 bg-white rounded-2xl border border-gray-100">
              Không có khoản nợ hay trả góp nào.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
