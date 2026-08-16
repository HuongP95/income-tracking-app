import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { ref, onValue, set, update } from 'firebase/database';
import { 
  subscribeToTransactions, 
  updateSettlementDay, 
  subscribeToCategories, 
  subscribeToMonthlyPlan,
  updateMonthlyPlan,
  updateSettlementConfig, 
  addCustomCycle, 
  updateCustomCycle, 
  deleteCustomCycle, 
  addTransaction 
} from '../lib/db';
import { Transaction, Category, CustomCycle } from '../types';
import { isWithinInterval, format } from 'date-fns';
import { Target, TrendingDown, TrendingUp, AlertTriangle, CheckCircle, Info, RefreshCw, Calendar, Trash2, Plus, Sparkles } from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput, getSettlementPeriod, getCurrentPeriod } from '../lib/utils';

export default function MonthlyPlan({ 
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
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [plannedIncome, setPlannedIncome] = useState('15,000,000');
  const [plannedExpense, setPlannedExpense] = useState('10,000,000');
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  // Custom cycles form state
  const [showCycleForm, setShowCycleForm] = useState(false);
  const [cycleStartDate, setCycleStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [cycleSalaryAmount, setCycleSalaryAmount] = useState('');
  const [cycleNote, setCycleNote] = useState('');
  const [autoAddSalaryTx, setAutoAddSalaryTx] = useState(true);

  // Subscribe to monthly plan values from database
  useEffect(() => {
    const unsubPlan = subscribeToMonthlyPlan(user.uid, (data) => {
      if (data) {
        if (data.planned_income !== undefined) {
          setPlannedIncome(formatNumberInput(data.planned_income.toString()));
        }
        if (data.planned_expense !== undefined) {
          setPlannedExpense(formatNumberInput(data.planned_expense.toString()));
        }
      }
    });

    const unsubTx = subscribeToTransactions(user.uid, setTransactions);
    const unsubCat = subscribeToCategories(user.uid, setCategories);

    return () => {
      unsubPlan();
      unsubTx();
      unsubCat();
    };
  }, [user.uid]);

  const catMap = useMemo(() => {
    return categories.reduce((acc, cat) => {
      acc[cat.id!] = cat;
      return acc;
    }, {} as Record<string, Category>);
  }, [categories]);

  const period = useMemo(() => {
    return getCurrentPeriod(settlementConfig, customCycles);
  }, [settlementConfig, customCycles]);

  // Compute actual income and expense for the current cycle
  const actualStats = useMemo(() => {
    const { start, end } = period;
    const thisMonthTxs = transactions.filter(t => !t.is_split_pending && isWithinInterval(new Date(t.date), { start, end }));

    let regularIncome = 0;
    let regularExpense = 0;
    let loanRecoveries = 0;
    let debtPayments = 0;

    thisMonthTxs.forEach(t => {
      const cat = catMap[t.category_id];
      const catName = cat?.name?.toLowerCase() || '';
      const note = t.note?.toLowerCase() || '';
      
      const isDebtPayment = t.type === 'expense' && (catName.includes('trả nợ') || catName.includes('trả góp') || note.includes('trả nợ') || note.includes('trả góp'));
      const isLoanRecovery = t.type === 'income' && (catName.includes('thu hồi nợ') || catName.includes('thu nợ') || note.includes('thu hồi nợ') || note.includes('thu nợ'));

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

    const netDebtFlow = loanRecoveries - debtPayments;
    const adjustedIncome = regularIncome + netDebtFlow;
    const adjustedExpense = regularExpense;
    const rawIncome = regularIncome + loanRecoveries;
    const rawExpense = regularExpense + debtPayments;

    return { 
      income: adjustedIncome, 
      expense: adjustedExpense,
      rawIncome,
      rawExpense,
      debtPayments,
      loanRecoveries
    };
  }, [transactions, period, catMap]);

  const rawPlannedIncome = parseNumberInput(plannedIncome);
  const rawPlannedExpense = parseNumberInput(plannedExpense);

  const plannedNet = rawPlannedIncome - rawPlannedExpense;
  const actualNet = actualStats.income - actualStats.expense;

  // Check deficit
  const isExpenseOverPlan = actualStats.expense > rawPlannedExpense;
  const isIncomeUnderPlan = actualStats.income < rawPlannedIncome && new Date().getDate() > 15; // warning later in the month
  const isNetDeficit = actualNet < plannedNet;
  const deficitAmount = plannedNet - actualNet;

  const handleSavePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateMonthlyPlan(user.uid, {
        planned_income: rawPlannedIncome,
        planned_expense: rawPlannedExpense
      });
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleCreateCycle = async (e: React.FormEvent) => {
    e.preventDefault();
    const startTime = new Date(cycleStartDate).getTime();
    const salary = parseNumberInput(cycleSalaryAmount);

    // 1. Add the new cycle
    const addedCycle = await addCustomCycle(user.uid, {
      start_date: startTime,
      name: cycleNote || `Chu kỳ từ ${format(new Date(startTime), 'dd/MM/yyyy')}`,
      salary_amount: salary,
      note: cycleNote
    });

    // 2. Adjust end_dates for all previous cycles
    const updatedSim = [...customCycles, { ...addedCycle, id: addedCycle.id }].sort((a, b) => a.start_date - b.start_date);
    for (let i = 0; i < updatedSim.length - 1; i++) {
      const current = updatedSim[i];
      const next = updatedSim[i + 1];
      const newEnd = next.start_date - 1;
      if (current.id && current.end_date !== newEnd) {
        await updateCustomCycle(user.uid, current.id, { end_date: newEnd });
      }
    }

    // 3. Auto-add salary transaction if checked
    if (autoAddSalaryTx && salary > 0) {
      // Find or create 'Lương' category or first income category
      let salaryCat = categories.find(c => c.type === 'income' && (c.name.toLowerCase().includes('lương') || c.name.toLowerCase().includes('salary')));
      if (!salaryCat) {
        salaryCat = categories.find(c => c.type === 'income');
      }
      const catId = salaryCat?.id || 'income_default';
      
      await addTransaction(user.uid, {
        amount: salary,
        type: 'income',
        category_id: catId,
        date: startTime,
        note: cycleNote ? `Lương nhận đầu chu kỳ: ${cycleNote}` : 'Lương đầu chu kỳ'
      });
    }

    // Reset form
    setShowCycleForm(false);
    setCycleSalaryAmount('');
    setCycleNote('');
    setCycleStartDate(format(new Date(), 'yyyy-MM-dd'));
  };

  const handleDeleteCycle = async (cycleId: string) => {
    if (!window.confirm('Bạn có chắc chắn muốn xóa chu kỳ này không? Việc này có thể làm thay đổi cách nhóm các giao dịch.')) return;
    await deleteCustomCycle(user.uid, cycleId);
    
    // After deletion, re-align end dates of remaining cycles
    const remaining = customCycles.filter(c => c.id !== cycleId).sort((a, b) => a.start_date - b.start_date);
    for (let i = 0; i < remaining.length; i++) {
      const current = remaining[i];
      const next = remaining[i + 1];
      const newEnd = next ? next.start_date - 1 : undefined;
      if (current.id && current.end_date !== newEnd) {
        await updateCustomCycle(user.uid, current.id, { end_date: newEnd });
      }
    }
  };

  return (
    <div className="space-y-6">
      <div className="mb-4">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Kế hoạch thu chi tháng này</h1>
        <p className="text-sm text-gray-500">Thiết lập mục tiêu ngân sách ban đầu và đối chiếu với thực tế.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Settings Column */}
        <div className="space-y-6 lg:col-span-1">
          {/* Core Settings Form */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
            <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-indigo-600" />
              Mục tiêu ban đầu (Plan)
            </h3>
            
            {showSaveSuccess && (
              <div className="mb-4 p-3 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-semibold flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-emerald-500" />
                <span>Đã cập nhật kế hoạch thành công!</span>
              </div>
            )}

            <form onSubmit={handleSavePlan} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Kế hoạch Thu nhập (VND)
                </label>
                <input
                  type="text"
                  required
                  value={plannedIncome}
                  onChange={e => setPlannedIncome(formatNumberInput(e.target.value))}
                  className="block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 font-mono font-bold"
                  placeholder="Ví dụ: 15,000,000"
                />
                <p className="text-[10px] text-gray-400 mt-1">Tổng thu nhập dự tính (lương, làm thêm...)</p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1">
                  Kế hoạch Chi tiêu (VND)
                </label>
                <input
                  type="text"
                  required
                  value={plannedExpense}
                  onChange={e => setPlannedExpense(formatNumberInput(e.target.value))}
                  className="block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 font-mono font-bold"
                  placeholder="Ví dụ: 10,000,000"
                />
                <p className="text-[10px] text-gray-400 mt-1">Tổng chi tiêu kế hoạch tối đa</p>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isSaving}
                  className="w-full py-2.5 bg-indigo-600 text-white rounded-xl text-sm font-bold hover:bg-indigo-700 transition-all shadow-md disabled:opacity-50"
                >
                  {isSaving ? 'Đang lưu...' : 'Lưu & Áp dụng'}
                </button>
              </div>
            </form>
          </div>

          {/* Settlement Cycle Settings */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit space-y-6">
            <div>
              <h3 className="text-lg font-semibold text-gray-900 mb-1 flex items-center gap-2">
                <RefreshCw className="w-5 h-5 text-indigo-600" />
                Chu kỳ quyết toán
              </h3>
              <p className="text-xs text-gray-500 leading-relaxed">
                Thiết lập khoảng thời gian tính toán các báo cáo thu chi, ngân sách và kế hoạch tài chính.
              </p>
            </div>

            {/* Mode Selector Tabs */}
            <div className="grid grid-cols-2 gap-1 p-1 bg-gray-50 rounded-xl">
              <button
                type="button"
                onClick={async () => {
                  await updateSettlementConfig(user.uid, { mode: 'fixed' });
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  settlementConfig.mode === 'fixed'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Cố định hàng tháng
              </button>
              <button
                type="button"
                onClick={async () => {
                  await updateSettlementConfig(user.uid, { mode: 'flexible' });
                }}
                className={`py-2 text-xs font-bold rounded-lg transition-all ${
                  settlementConfig.mode === 'flexible'
                    ? 'bg-white text-indigo-700 shadow-sm'
                    : 'text-gray-500 hover:text-gray-900'
                }`}
              >
                Linh hoạt theo lương
              </button>
            </div>

            {settlementConfig.mode === 'fixed' ? (
              <div className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                    Ngày quyết toán hàng tháng
                  </label>
                  <select
                    value={settlementDay}
                    onChange={async (e) => {
                      const day = Number(e.target.value);
                      await updateSettlementConfig(user.uid, { settlement_day: day, mode: 'fixed' });
                    }}
                    className="block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 font-semibold text-sm"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                      <option key={day} value={day}>
                        Ngày {day} hàng tháng
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-gray-400 mt-1 leading-normal">
                    Chu kỳ tự động xoay vòng cố định vào ngày này mỗi tháng.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Active Cycle Quick Stats */}
                {customCycles.length > 0 ? (
                  <div className="p-3.5 bg-indigo-50/50 border border-indigo-100/60 rounded-xl text-xs space-y-1.5">
                    <p className="font-bold text-indigo-900 flex items-center gap-1">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      Chu kỳ lương hiện tại:
                    </p>
                    <div className="pl-5 space-y-1 text-indigo-950">
                      <p className="font-medium">🏷️ Tên: <span className="font-bold">{period.cycleName}</span></p>
                      {period.salaryAmount !== undefined && period.salaryAmount > 0 && (
                        <p className="font-medium">💰 Lương đã nhận: <span className="font-bold text-emerald-600 font-mono">{formatCurrency(period.salaryAmount)}</span></p>
                      )}
                      <p className="font-medium">📅 Bắt đầu: <span className="font-semibold font-mono">{format(period.start, 'dd/MM/yyyy')}</span></p>
                    </div>
                  </div>
                ) : (
                  <div className="p-3.5 bg-amber-50 border border-amber-100 rounded-xl text-xs text-amber-900 leading-normal">
                    💡 Bạn chưa tạo chu kỳ linh hoạt nào. Hãy bấm nút dưới đây để khai báo ngày nhận lương và bắt đầu chu kỳ đầu tiên!
                  </div>
                )}

                {/* Form to Create Custom Cycle */}
                {showCycleForm ? (
                  <form onSubmit={handleCreateCycle} className="p-4 bg-gray-50 border border-gray-100 rounded-xl space-y-3 text-left">
                    <p className="text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Nhận lương & Mở chu kỳ mới</p>
                    
                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Ngày bắt đầu nhận lương</label>
                      <input
                        type="date"
                        required
                        value={cycleStartDate}
                        onChange={e => setCycleStartDate(e.target.value)}
                        className="block w-full rounded-lg border-gray-300 text-xs py-1.5 px-2.5 focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Số tiền lương (VND)</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: 15,000,000"
                        value={cycleSalaryAmount}
                        onChange={e => setCycleSalaryAmount(formatNumberInput(e.target.value))}
                        className="block w-full rounded-lg border-gray-200 text-xs py-1.5 px-2.5 font-mono focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-gray-500 uppercase tracking-wider mb-1">Ghi chú chu kỳ</label>
                      <input
                        type="text"
                        placeholder="Ví dụ: Lương tháng 7"
                        value={cycleNote}
                        onChange={e => setCycleNote(e.target.value)}
                        className="block w-full rounded-lg border-gray-200 text-xs py-1.5 px-2.5 focus:border-indigo-500 focus:ring-indigo-500"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="autoAddSalaryTx"
                        checked={autoAddSalaryTx}
                        onChange={e => setAutoAddSalaryTx(e.target.checked)}
                        className="rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 h-3.5 w-3.5"
                      />
                      <label htmlFor="autoAddSalaryTx" className="text-[10px] font-medium text-gray-600 select-none cursor-pointer">
                        Tự động ghi nhận giao dịch thu nhập (Lương)
                      </label>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => setShowCycleForm(false)}
                        className="flex-1 py-1.5 bg-white border border-gray-200 hover:bg-gray-50 text-gray-700 rounded-lg text-xs font-semibold"
                      >
                        Hủy
                      </button>
                      <button
                        type="submit"
                        className="flex-1 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs"
                      >
                        Bắt đầu
                      </button>
                    </div>
                  </form>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setCycleStartDate(format(new Date(), 'yyyy-MM-dd'));
                      setShowCycleForm(true);
                    }}
                    className="w-full py-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-dashed border-indigo-200 rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-2"
                  >
                    <Plus className="w-4 h-4 text-indigo-600" />
                    Đóng chu kỳ & Nhận lương mới
                  </button>
                )}

                {/* History of Custom Cycles */}
                {customCycles.length > 0 && (
                  <div className="pt-2 text-left">
                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-1.5">Lịch sử chu kỳ</p>
                    <div className="max-h-[160px] overflow-y-auto border border-gray-100 rounded-xl divide-y divide-gray-50">
                      {customCycles.map((cycle) => (
                        <div key={cycle.id} className="p-2.5 flex justify-between items-center text-[11px] hover:bg-gray-50">
                          <div className="space-y-0.5">
                            <p className="font-bold text-gray-800">{cycle.name || cycle.note || "Chu kỳ"}</p>
                            <p className="text-gray-500 font-mono">
                              {format(new Date(cycle.start_date), 'dd/MM/yy')} 
                              {cycle.end_date ? ` - ${format(new Date(cycle.end_date), 'dd/MM/yy')}` : " (Đang mở)"}
                            </p>
                            {cycle.salary_amount !== undefined && cycle.salary_amount > 0 && (
                              <p className="text-emerald-600 font-semibold font-mono">+{formatCurrency(cycle.salary_amount)}</p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={() => cycle.id && handleDeleteCycle(cycle.id)}
                            className="p-1.5 text-gray-400 hover:text-rose-600 rounded-md hover:bg-rose-50 transition-colors"
                            title="Xóa chu kỳ"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Always visible active calculation range */}
            <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-950 space-y-1 text-left">
              <p className="font-bold text-indigo-900 flex items-center gap-1">
                <Calendar className="w-4 h-4 text-indigo-600" />
                Chu kỳ quyết toán hiện tại:
              </p>
              <p className="font-semibold font-mono pl-5 text-gray-900">
                {format(period.start, 'dd/MM/yyyy')} - {format(period.end, 'dd/MM/yyyy')}
              </p>
              {settlementConfig.mode === 'flexible' && period.isCustom && (
                <p className="text-[10px] text-indigo-800 font-medium pl-5 leading-normal">
                  💡 Số liệu thu chi, ngân sách được tính toán theo chu kỳ lương này.
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Comparison Dashboard */}
        <div className="lg:col-span-2 space-y-6">
          {/* Deficit Alert Indicator */}
          {isNetDeficit ? (
            <div className="bg-rose-50 border border-rose-100 p-5 rounded-2xl flex items-start gap-4 shadow-sm">
              <div className="p-2.5 bg-rose-100 rounded-xl text-rose-600 shrink-0">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-rose-900 text-base">Cảnh báo: Hụt ngân sách so với kế hoạch ban đầu!</h4>
                <p className="text-sm text-rose-800 mt-1 leading-relaxed">
                  Thặng dư thực tế của bạn hiện tại là <span className="font-bold">{formatCurrency(actualNet)}</span>, 
                  thấp hơn kế hoạch ban đầu là <span className="font-bold">{formatCurrency(plannedNet)}</span>.
                  Bạn đang bị hụt <span className="font-extrabold underline">{formatCurrency(deficitAmount)}</span>.
                </p>
                <p className="text-xs text-rose-700 mt-2 font-medium">
                  💡 Lời khuyên: Hãy hạn chế các chi phí không cần thiết trong những ngày tới hoặc tìm cách tăng thêm nguồn thu để bù đắp.
                </p>
              </div>
            </div>
          ) : (
            <div className="bg-emerald-50 border border-emerald-100 p-5 rounded-2xl flex items-start gap-4 shadow-sm">
              <div className="p-2.5 bg-emerald-100 rounded-xl text-emerald-600 shrink-0">
                <CheckCircle className="w-6 h-6" />
              </div>
              <div>
                <h4 className="font-bold text-emerald-900 text-base">Tuyệt vời! Ngân sách vẫn đang đúng kế hoạch</h4>
                <p className="text-sm text-emerald-800 mt-1">
                  Thặng dư tích lũy hiện tại của bạn là <span className="font-bold">{formatCurrency(actualNet)}</span>, 
                  vẫn nằm trong vùng an toàn so với kế hoạch đề ra (<span className="font-bold">{formatCurrency(plannedNet)}</span>).
                </p>
              </div>
            </div>
          )}

          {/* Detailed Progress Comparison Bars */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 space-y-6">
            <h3 className="text-base font-bold text-gray-900 mb-2">So sánh chi tiết Kế hoạch vs Thực tế</h3>
            
            {/* Income Progress */}
            <div className="space-y-2">
              <div className="flex justify-between items-end">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Thu nhập tháng này</span>
                  <p className="text-lg font-bold text-gray-900 flex items-center gap-1.5 mt-0.5">
                    <TrendingUp className="w-4 h-4 text-emerald-500" />
                    Thực tế: {formatCurrency(actualStats.income)}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500 font-medium">
                  Kế hoạch: {formatCurrency(rawPlannedIncome)}
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div 
                  className="bg-emerald-500 h-3 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min((actualStats.income / (rawPlannedIncome || 1)) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className="text-gray-500">
                  {actualStats.debtPayments > 0 && (
                    <span className="text-amber-700 font-bold block">
                      ⚠️ Đã trừ {formatCurrency(actualStats.debtPayments)} trả nợ. Tổng thu nhập gốc: {formatCurrency(actualStats.rawIncome)}
                    </span>
                  )}
                </span>
                <span className="text-gray-500">
                  Đạt được {((actualStats.income / (rawPlannedIncome || 1)) * 100).toFixed(1)}% mục tiêu
                </span>
              </div>
            </div>

            {/* Expense Progress */}
            <div className="space-y-2 pt-2 border-t border-gray-50">
              <div className="flex justify-between items-end">
                <div>
                  <span className="text-xs font-semibold uppercase tracking-wider text-gray-400">Chi tiêu tháng này</span>
                  <p className="text-lg font-bold text-gray-900 flex items-center gap-1.5 mt-0.5">
                    <TrendingDown className={`w-4 h-4 ${isExpenseOverPlan ? 'text-rose-500' : 'text-indigo-500'}`} />
                    Thực tế: {formatCurrency(actualStats.expense)}
                  </p>
                </div>
                <div className="text-right text-xs text-gray-500 font-medium">
                  Trần kế hoạch: {formatCurrency(rawPlannedExpense)}
                </div>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-3 overflow-hidden">
                <div 
                  className={`h-3 rounded-full transition-all duration-500 ${isExpenseOverPlan ? 'bg-rose-500' : 'bg-indigo-600'}`}
                  style={{ width: `${Math.min((actualStats.expense / (rawPlannedExpense || 1)) * 100, 100)}%` }}
                />
              </div>
              <div className="flex justify-between text-xs mt-1">
                <span className={isExpenseOverPlan ? "text-rose-600 font-bold" : "text-gray-500"}>
                  {isExpenseOverPlan ? `Vượt quá kế hoạch ${formatCurrency(actualStats.expense - rawPlannedExpense)}` : 'Chi tiêu trong tầm kiểm soát'}
                  {actualStats.debtPayments > 0 && (
                    <span className="text-slate-500 block mt-0.5 font-medium">
                      (Chưa bao gồm {formatCurrency(actualStats.debtPayments)} trả nợ. Tổng chi tiêu thực tế: {formatCurrency(actualStats.rawExpense)})
                    </span>
                  )}
                </span>
                <span className="text-gray-500">
                  Đã tiêu {((actualStats.expense / (rawPlannedExpense || 1)) * 100).toFixed(1)}% trần
                </span>
              </div>
            </div>

            {/* Net Savings Potential */}
            <div className="pt-4 border-t border-gray-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 bg-gray-50 p-4 rounded-xl">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Thặng dư mong muốn (Tiết kiệm dự kiến)</p>
                <p className="text-xl font-extrabold text-indigo-900 mt-0.5">{formatCurrency(plannedNet)}</p>
              </div>
              <div className="sm:text-right">
                <p className="text-xs font-semibold uppercase tracking-wider text-gray-400">Thặng dư tích lũy thực tế</p>
                <p className={`text-xl font-extrabold mt-0.5 ${actualNet >= plannedNet ? 'text-emerald-600' : 'text-rose-600'}`}>
                  {formatCurrency(actualNet)}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
