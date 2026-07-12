import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { ref, onValue, set } from 'firebase/database';
import { subscribeToTransactions, updateSettlementDay, subscribeToCategories } from '../lib/db';
import { Transaction, Category } from '../types';
import { isWithinInterval, format } from 'date-fns';
import { Target, TrendingDown, TrendingUp, AlertTriangle, CheckCircle, Info, RefreshCw, Calendar } from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput, getSettlementPeriod } from '../lib/utils';

export default function MonthlyPlan({ user, settlementDay }: { user: User, settlementDay: number }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [plannedIncome, setPlannedIncome] = useState('15,000,000');
  const [plannedExpense, setPlannedExpense] = useState('10,000,000');
  const [categories, setCategories] = useState<Category[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  // Subscribe to monthly plan values from database
  useEffect(() => {
    const planRef = ref(db, `monthly_plans/${user.uid}`);
    const unsubPlan = onValue(planRef, (snapshot) => {
      const data = snapshot.val();
      if (data) {
        if (data.planned_income !== undefined) {
          setPlannedIncome(formatNumberInput(data.planned_income));
        }
        if (data.planned_expense !== undefined) {
          setPlannedExpense(formatNumberInput(data.planned_expense));
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
    return getSettlementPeriod(settlementDay);
  }, [settlementDay]);

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

    return { income: adjustedIncome, expense: adjustedExpense };
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
      const planRef = ref(db, `monthly_plans/${user.uid}`);
      await set(planRef, {
        planned_income: rawPlannedIncome,
        planned_expense: rawPlannedExpense,
        updated_at: new Date().getTime()
      });
      setShowSaveSuccess(true);
      setTimeout(() => setShowSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setIsSaving(false);
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
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
            <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center gap-2">
              <RefreshCw className="w-5 h-5 text-indigo-600" />
              Chu kỳ quyết toán
            </h3>
            <p className="text-xs text-gray-500 mb-4 leading-relaxed">
              Nhập ngày chốt giao dịch hàng tháng của bạn (ví dụ ngày lãnh lương). Số liệu các mục Kế hoạch, Báo cáo, Ngân sách và Chia tiền sẽ tính toán theo chu kỳ này.
            </p>

            <div className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 uppercase tracking-wider mb-1.5">
                  Ngày quyết toán hàng tháng
                </label>
                <select
                  value={settlementDay}
                  onChange={async (e) => {
                    const day = Number(e.target.value);
                    await updateSettlementDay(user.uid, day);
                  }}
                  className="block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 font-semibold"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((day) => (
                    <option key={day} value={day}>
                      Ngày {day} hàng tháng
                    </option>
                  ))}
                </select>
              </div>

              <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3.5 text-xs text-indigo-950 space-y-1">
                <p className="font-bold text-indigo-900 flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-indigo-600" />
                  Chu kỳ hiện tại của bạn:
                </p>
                <p className="font-semibold font-mono pl-5">
                  {format(period.start, 'dd/MM/yyyy')} - {format(period.end, 'dd/MM/yyyy')}
                </p>
              </div>
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
              <p className="text-xs text-gray-500 text-right">
                Đạt được {((actualStats.income / (rawPlannedIncome || 1)) * 100).toFixed(1)}% mục tiêu
              </p>
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
