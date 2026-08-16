import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { db } from '../firebase';
import { ref, onValue, set, update } from 'firebase/database';
import { 
  subscribeToTransactions, 
  subscribeToCategories, 
  subscribeToBudgets, 
  subscribeToMonthlyPlan,
  updateMonthlyPlan,
  setBudget, 
  updateSettlementConfig, 
  addCustomCycle, 
  deleteCustomCycle, 
  addTransaction,
  isExpenseCategory
} from '../lib/db';
import { Transaction, Category, Budget as BudgetType, CustomCycle } from '../types';
import { format as formatDate } from 'date-fns';
import { 
  Target, 
  TrendingDown, 
  TrendingUp, 
  AlertTriangle, 
  CheckCircle, 
  Info, 
  RefreshCw, 
  Calendar, 
  Trash2, 
  Plus, 
  Sparkles,
  PieChart,
  Edit3,
  DollarSign,
  Tag,
  Circle
} from 'lucide-react';
import * as Icons from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput, getCurrentPeriod, isDateWithinIntervalSafely } from '../lib/utils';
import { useFeedback } from '../context/FeedbackContext';
import { CardSkeleton, ListSkeleton } from '../components/Skeleton';

export default function PlanAndBudget({ 
  user, 
  settlementDay,
  settlementConfig = { settlement_day: 1, mode: 'fixed' },
  customCycles = []
}: { 
  user: User, 
  settlementDay: number,
  settlementConfig?: { settlement_day: number; mode: 'fixed' | 'flexible'; estimated_income?: number },
  customCycles?: CustomCycle[]
}) {
  const { showToast } = useFeedback();

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [budgets, setBudgets] = useState<BudgetType[]>([]);
  const [plannedIncome, setPlannedIncome] = useState('15,000,000');
  const [loading, setLoading] = useState(true);
  const [isUpdatingCategory, setIsUpdatingCategory] = useState<string | null>(null);
  
  // Controlled inputs for each category's budget limit
  const [budgetInputs, setBudgetInputs] = useState<Record<string, string>>({});

  // Subscriptions
  useEffect(() => {
    let loadedT = false;
    let loadedC = false;
    let loadedB = false;

    const checkLoaded = () => {
      if (loadedT && loadedC && loadedB) setLoading(false);
    };

    const unsubPlan = subscribeToMonthlyPlan(user.uid, (data) => {
      if (data && data.planned_income !== undefined) {
        setPlannedIncome(formatNumberInput(data.planned_income.toString()));
      }
    });

    const unsubTx = subscribeToTransactions(user.uid, (data) => { setTransactions(data); loadedT = true; checkLoaded(); });
    const unsubCat = subscribeToCategories(user.uid, (data) => { setCategories(data); loadedC = true; checkLoaded(); });
    const unsubBud = subscribeToBudgets(user.uid, (data) => { setBudgets(data); loadedB = true; checkLoaded(); });

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 1000);

    return () => {
      unsubPlan();
      unsubTx();
      unsubCat();
      unsubBud();
      clearTimeout(safetyTimer);
    };
  }, [user.uid]);

  // All expense categories (strictly excluding income categories and Đi chợ)
  const expenseCategories = useMemo(() => {
    return categories.filter(c => isExpenseCategory(c));
  }, [categories]);

  // Sync budget inputs whenever categories or budgets are loaded or updated
  useEffect(() => {
    if (expenseCategories.length > 0) {
      setBudgetInputs(prev => {
        const next = { ...prev };
        expenseCategories.forEach(cat => {
          if (cat.id) {
            const b = budgets.find(item => item.category_id === cat.id);
            const val = Number(b?.limit_amount !== undefined ? b.limit_amount : ((cat as any).limit_amount || (cat as any).budget || 0));
            if (val > 0) {
              next[cat.id] = formatNumberInput(val.toString());
            } else if (next[cat.id] === undefined) {
              next[cat.id] = '';
            }
          }
        });
        return next;
      });
    }
  }, [budgets, expenseCategories]);

  // Current Settlement Period
  const period = useMemo(() => {
    return getCurrentPeriod(settlementConfig, customCycles);
  }, [settlementConfig, customCycles]);

  // Filter transactions in current period safely
  const monthTxs = useMemo(() => {
    const { start, end } = period;
    return transactions.filter(t => !t.is_split_pending && isDateWithinIntervalSafely(t.date, start, end));
  }, [transactions, period]);

  // Spent map per category
  const spentMap = useMemo(() => {
    const map: Record<string, number> = {};
    monthTxs.forEach(t => {
      if (t.type === 'expense') {
        const amt = Number(t.amount) || 0;
        if (t.category_id) {
          map[t.category_id] = (map[t.category_id] || 0) + amt;
        }
      }
    });
    return map;
  }, [monthTxs]);

  // Actual total income and expense in period
  const actualStats = useMemo(() => {
    let income = 0;
    let expense = 0;
    monthTxs.forEach(t => {
      const amt = Number(t.amount) || 0;
      if (t.type === 'income') income += amt;
      else expense += amt;
    });
    return { income, expense, net: income - expense };
  }, [monthTxs]);

  // Map category budgets ONLY for genuine expense categories
  const budgetMap = useMemo(() => {
    const map: Record<string, BudgetType> = {};
    const validExpenseIds = new Set(expenseCategories.map(c => c.id));

    budgets.forEach(b => {
      if (b.category_id && validExpenseIds.has(b.category_id)) {
        map[b.category_id] = {
          category_id: b.category_id,
          percentage: Number(b.percentage) || 0,
          limit_amount: Number(b.limit_amount !== undefined ? b.limit_amount : ((b as any).limit || (b as any).amount || 0))
        };
      }
    });

    // Fallback to category embedded limit if not in budgetMap
    expenseCategories.forEach(c => {
      if (c.id && !map[c.id]) {
        const lim = Number((c as any).limit_amount !== undefined ? (c as any).limit_amount : ((c as any).budget || 0));
        if (lim > 0) {
          map[c.id] = {
            category_id: c.id,
            percentage: Number((c as any).percentage || 0),
            limit_amount: lim
          };
        }
      }
    });
    return map;
  }, [budgets, expenseCategories]);

  // Calculate total budget allocated across expense categories
  const totalBudgetedExpense = useMemo(() => {
    return expenseCategories.reduce((sum, cat) => {
      const inputVal = budgetInputs[cat.id!] !== undefined 
        ? parseNumberInput(budgetInputs[cat.id!]) 
        : (budgetMap[cat.id!]?.limit_amount || 0);
      return sum + inputVal;
    }, 0);
  }, [expenseCategories, budgetMap, budgetInputs]);

  // Total Variance = Total Budgeted - Actual Spent
  const totalVariance = totalBudgetedExpense - actualStats.expense;

  // Handle typing inside category limit input
  const handleInputChange = (categoryId: string, rawValue: string) => {
    const formatted = formatNumberInput(rawValue);
    setBudgetInputs(prev => ({ ...prev, [categoryId]: formatted }));
  };

  // Quick preset adjustment
  const handleQuickAdd = (categoryId: string, deltaAmount: number) => {
    const currentStr = budgetInputs[categoryId] || (budgetMap[categoryId]?.limit_amount ? budgetMap[categoryId].limit_amount.toString() : '0');
    const currentNum = parseNumberInput(currentStr);
    const newNum = Math.max(0, currentNum + deltaAmount);
    const formatted = formatNumberInput(newNum.toString());
    setBudgetInputs(prev => ({ ...prev, [categoryId]: formatted }));
    handleUpdateCategoryLimit(categoryId, formatted);
  };

  // Handle updating budget limit for a specific category
  const handleUpdateCategoryLimit = async (categoryId: string, rawValue?: string) => {
    const valueToParse = rawValue !== undefined ? rawValue : (budgetInputs[categoryId] || '');
    const limitAmount = parseNumberInput(valueToParse);
    const inc = parseNumberInput(plannedIncome) || 1;
    const percentage = Math.min(100, Math.round((limitAmount / Math.max(1, inc)) * 100));

    const formatted = formatNumberInput(limitAmount.toString());
    setBudgetInputs(prev => ({ ...prev, [categoryId]: formatted }));

    // Optimistic local update
    setBudgets(prev => {
      const remaining = prev.filter(b => b.category_id !== categoryId);
      return [...remaining, { category_id: categoryId, limit_amount: limitAmount, percentage }];
    });

    setIsUpdatingCategory(categoryId);
    try {
      await setBudget(user.uid, categoryId, { 
        limit_amount: limitAmount,
        percentage 
      });
      showToast('Đã lưu hạn mức ngân sách!', 'success');
    } catch (err: any) {
      console.error('Error saving budget:', err);
      showToast('Đã ghi nhận ngân sách tại máy.', 'success');
    } finally {
      setIsUpdatingCategory(null);
    }
  };

  // Handle saving all budgets at once
  const [isSavingAll, setIsSavingAll] = useState(false);
  const handleSaveAllBudgets = async () => {
    setIsSavingAll(true);
    const inc = parseNumberInput(plannedIncome) || 1;
    let savedCount = 0;
    for (const cat of expenseCategories) {
      if (cat.id) {
        const valStr = budgetInputs[cat.id] !== undefined ? budgetInputs[cat.id] : (budgetMap[cat.id]?.limit_amount ? budgetMap[cat.id].limit_amount.toString() : '0');
        const limitAmt = parseNumberInput(valStr);
        const pct = Math.min(100, Math.round((limitAmt / Math.max(1, inc)) * 100));
        try {
          await setBudget(user.uid, cat.id, { limit_amount: limitAmt, percentage: pct });
          savedCount++;
        } catch (e) {}
      }
    }
    setIsSavingAll(false);
    showToast(`Đã lưu thành công ngân sách cho ${savedCount} danh mục! ✨`, 'success');
  };

  // Save Planned Income to DB
  const handleSavePlannedIncome = async (val: string) => {
    setPlannedIncome(val);
    const num = parseNumberInput(val);
    try {
      await updateMonthlyPlan(user.uid, { planned_income: num });
      await updateSettlementConfig(user.uid, { estimated_income: num });
    } catch (err) {
      console.error(err);
    }
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
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-amber-950 leading-none flex items-center gap-2">
            Kế hoạch & Ngân sách <span className="text-2xl">🎯</span>
          </h1>
          <p className="text-xs sm:text-sm text-amber-800/80 font-bold mt-1.5">
            Lên hạn mức cho từng mục chi và so sánh chi tiết giữa ngân sách & chi tiêu thực tế! ✨
          </p>
        </div>
      </div>

      {/* OVERALL COMPARISON DASHBOARD SUMMARY */}
      <div className="bg-gradient-to-br from-[#FFFDF9] via-white to-[#FFF8EC] p-6 sm:p-8 rounded-3xl shadow-lg shadow-amber-150/10 border-4 border-[#FFF2D8] space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-amber-100/60">
          <div>
            <span className="text-xs font-black uppercase tracking-widest text-amber-700 bg-amber-100/80 px-3 py-1 rounded-full border border-amber-200">
              {settlementConfig.mode === 'fixed' 
                ? `Chu kỳ chốt sổ cố định: Ngày ${settlementConfig.settlement_day} hàng tháng` 
                : `Chu kỳ linh hoạt theo ngày nhận lương`}
            </span>
            <p className="text-xs text-amber-800/70 font-semibold mt-2 flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5 text-amber-600" />
              Đang áp dụng: {formatDate(period.start, 'dd/MM/yyyy')} — {formatDate(period.end, 'dd/MM/yyyy')}
            </p>
          </div>

          {/* Planned Income Input */}
          <div className="flex items-center gap-2 bg-white p-2 rounded-2xl border-2 border-amber-100 shadow-sm">
            <span className="text-xs font-black text-amber-900 shrink-0 ml-1">Thu nhập dự kiến:</span>
            <input
              type="text"
              value={plannedIncome}
              onChange={(e) => handleSavePlannedIncome(formatNumberInput(e.target.value))}
              className="w-32 bg-amber-50/50 rounded-xl px-2.5 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FFC300] tabular-nums"
            />
            <span className="text-xs font-bold text-amber-700 mr-1">VND</span>
          </div>
        </div>

        {/* Synchronized Actual Income Banner */}
        <div className="bg-emerald-50/90 p-4 rounded-2xl border-2 border-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-emerald-500 text-white rounded-xl shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs font-black text-emerald-950">
                Thu nhập thực tế chu kỳ này (Tự động từ Lịch sử): <span className="text-sm font-mono text-emerald-700 font-extrabold">{formatCurrency(actualStats.income)}</span>
              </p>
              <p className="text-[11px] text-emerald-800/80 font-bold mt-0.5">
                ✨ <strong>Không cần nhập lại tiền lương!</strong> Tiền lương & thu nhập bạn đã nhập ở mục <strong>Lịch sử</strong> sẽ tự động được tổng hợp vào đây.
              </p>
            </div>
          </div>
        </div>

        {/* 3 SUMMARY METRICS HEADER */}
        <div className="flex items-center justify-between">
          <span className="text-xs font-black uppercase tracking-widest text-amber-900">
            Tổng quan các chỉ số ngân sách
          </span>
        </div>

        {/* 3 SUMMARY METRICS */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
          {/* Total Budgeted Expenses */}
          <div className="bg-white p-5 rounded-2xl border-2 border-amber-100 shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-widest text-amber-800/80 block mb-1">
              Tổng ngân sách kế hoạch 📋
            </span>
            <p className="text-2xl font-black font-mono text-amber-950 tabular-nums">
              {formatCurrency(totalBudgetedExpense)}
            </p>
            <p className="text-[10px] text-amber-700/80 mt-2 font-bold">
              Tổng số tiền dự định chi cho tất cả các mục.
            </p>
          </div>

          {/* Actual Expenses Spent */}
          <div className="bg-white p-5 rounded-2xl border-2 border-amber-100 shadow-sm">
            <span className="text-[11px] font-black uppercase tracking-widest text-rose-800/80 block mb-1">
              Thực tế đã chi 💸
            </span>
            <p className="text-2xl font-black font-mono text-rose-600 tabular-nums">
              {formatCurrency(actualStats.expense)}
            </p>
            <p className="text-[10px] text-rose-700/80 mt-2 font-bold">
              Tổng số tiền thực tế đã ghi nhận trong chu kỳ này.
            </p>
          </div>

          {/* Variance (Chênh lệch Ngân sách & Thực tế) */}
          <div className={`p-5 rounded-2xl border-2 shadow-sm ${
            totalVariance >= 0 
              ? 'bg-emerald-50/70 border-emerald-200 text-emerald-950' 
              : 'bg-rose-50/70 border-rose-200 text-rose-950'
          }`}>
            <span className="text-[11px] font-black uppercase tracking-widest block mb-1">
              {totalVariance >= 0 ? 'Chênh lệch (Còn dư ngân sách) 🍏' : 'Chênh lệch (Chi vượt ngân sách) 🍎'}
            </span>
            <p className={`text-2xl font-black font-mono tabular-nums ${
              totalVariance >= 0 ? 'text-emerald-700' : 'text-rose-700'
            }`}>
              {totalVariance >= 0 ? '+' : ''}{formatCurrency(totalVariance)}
            </p>
            <p className="text-[10px] opacity-80 mt-2 font-bold">
              {totalVariance >= 0 
                ? 'Tuyệt vời! Bạn đang chi tiêu trong hạn mức cho phép.' 
                : 'Chú ý: Tổng chi tiêu thực tế đã vượt ngân sách dự định.'}
            </p>
          </div>
        </div>

        {/* Formula Explanation Banner - Permanently visible for user clarity */}
        <div className="bg-amber-50/95 p-4 rounded-2xl border-2 border-amber-300/90 text-xs text-amber-950 space-y-2 shadow-xs">
          <div className="font-black text-amber-900 flex items-center gap-1.5">
            <Info className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Công thức tính các chỉ số ngân sách:</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 text-[11px] font-medium pt-1">
            <div className="bg-white/90 p-3 rounded-xl border border-amber-200 shadow-xs">
              <p className="font-black text-amber-900 mb-1">1. Tổng ngân sách kế hoạch</p>
              <p className="text-amber-800/90 leading-relaxed">
                Bằng tổng các hạn mức chi tiêu bạn thiết lập cho từng danh mục = <strong>∑(Hạn mức các danh mục)</strong>.
              </p>
            </div>
            <div className="bg-white/90 p-3 rounded-xl border border-amber-200 shadow-xs">
              <p className="font-black text-rose-900 mb-1">2. Thực tế đã chi</p>
              <p className="text-rose-800/90 leading-relaxed">
                Bằng tổng tất cả các khoản chi tiêu thực tế bạn đã ghi chép ở mục Lịch sử trong chu kỳ này = <strong>∑(Giao dịch Chi)</strong>.
              </p>
            </div>
            <div className="bg-white/90 p-3 rounded-xl border border-amber-200 shadow-xs">
              <p className="font-black text-emerald-900 mb-1">3. Chênh lệch (Còn dư)</p>
              <p className="text-emerald-800/90 leading-relaxed">
                Bằng <strong>[Tổng ngân sách kế hoạch] − [Thực tế đã chi]</strong>. Số Dương = Còn dư hạn mức; Số Âm = Đã chi vượt ngân sách.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* SECTION: CATEGORY BUDGET COMPARISON & INPUT TABLE */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-lg shadow-amber-150/5 border-4 border-[#FFF2D8] space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-amber-100/60 pb-4">
          <div>
            <h2 className="text-xl font-black text-amber-950 flex items-center gap-2">
              Chi tiết ngân sách & thực tế theo từng mục 📝
            </h2>
            <p className="text-xs text-amber-800/70 font-semibold mt-1">
              Nhập số tiền ngân sách mong muốn cho mỗi danh mục chi tiêu ở ô bên dưới (tự động áp dụng cho các tháng).
            </p>
          </div>

          {expenseCategories.length > 0 && (
            <button
              onClick={handleSaveAllBudgets}
              disabled={isSavingAll}
              className="flex items-center justify-center gap-1.5 px-4 py-2.5 bg-gradient-to-r from-amber-400 to-[#FFC300] hover:from-amber-500 hover:to-amber-400 text-amber-950 rounded-2xl font-black text-xs shadow-md shadow-amber-200/50 hover:shadow-lg transition-all active:scale-95 cursor-pointer shrink-0 disabled:opacity-50"
            >
              <Sparkles className={`w-3.5 h-3.5 ${isSavingAll ? 'animate-spin' : ''}`} />
              <span>{isSavingAll ? 'Đang lưu tất cả...' : 'Lưu tất cả ngân sách ✨'}</span>
            </button>
          )}
        </div>

        {expenseCategories.length === 0 ? (
          <div className="py-12 text-center text-amber-800 text-xs font-bold">
            Chưa có danh mục chi phí nào. Hãy thêm danh mục chi phí ở trang Lịch sử để bắt đầu lên ngân sách nha!
          </div>
        ) : (
          <div className="space-y-4">
            {expenseCategories.map((cat) => {
              const DynamicIcon = cat && cat.icon && (Icons as any)[cat.icon] ? (Icons as any)[cat.icon] : (Icons.Circle || Circle || Tag);
              const Icon = (typeof DynamicIcon === 'function' || (typeof DynamicIcon === 'object' && DynamicIcon !== null)) ? DynamicIcon : Circle;
              const limit = budgetMap[cat.id!]?.limit_amount || 0;
              const spent = spentMap[cat.id!] || 0;
              const variance = limit - spent; // Positive = Under budget, Negative = Over budget
              const percentSpent = limit > 0 ? Math.min(100, Math.round((spent / limit) * 100)) : (spent > 0 ? 100 : 0);
              const currentValue = budgetInputs[cat.id!] !== undefined ? budgetInputs[cat.id!] : (limit > 0 ? formatNumberInput(limit.toString()) : '');
              const isSavingThis = isUpdatingCategory === cat.id;

              return (
                <div 
                  key={cat.id} 
                  className="p-4 sm:p-5 rounded-2xl border-2 border-amber-100/80 bg-[#FFFDF9] hover:border-amber-300 transition-all space-y-3"
                >
                  <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    {/* Category Title & Icon */}
                    <div className="flex items-center gap-3 min-w-[180px]">
                      <div 
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-white shadow-sm"
                        style={{ backgroundColor: `${cat.color || '#ffd000'}20`, color: cat.color || '#b45309' }}
                      >
                        <Icon className="w-5 h-5 stroke-[2.25]" />
                      </div>
                      <div>
                        <p className="font-extrabold text-amber-950 text-sm">{cat.name}</p>
                        <span className="text-[10px] text-amber-800/60 font-bold">
                          Đã chi: <span className="font-mono text-amber-900">{formatCurrency(spent)}</span>
                        </span>
                      </div>
                    </div>

                    {/* Input for Budget Limit + Action */}
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 bg-white px-3 py-1.5 rounded-xl border-2 border-amber-100 shadow-xs">
                        <span className="text-xs font-bold text-amber-800/80 shrink-0">Ngân sách:</span>
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(e) => handleInputChange(cat.id!, e.target.value)}
                          onBlur={(e) => handleUpdateCategoryLimit(cat.id!, e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              handleUpdateCategoryLimit(cat.id!, (e.target as HTMLInputElement).value);
                            }
                          }}
                          className="w-24 sm:w-28 bg-amber-50/40 rounded-lg px-2 py-1 text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#FFC300] tabular-nums"
                          placeholder="0"
                        />
                        <span className="text-xs font-bold text-amber-700">VND</span>
                      </div>

                      {/* Explicit Save button */}
                      <button
                        type="button"
                        onClick={() => handleUpdateCategoryLimit(cat.id!, currentValue)}
                        disabled={isSavingThis}
                        className="px-2.5 py-1.5 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-xl text-xs font-extrabold flex items-center gap-1 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                        title="Lưu hạn mức cho mục này"
                      >
                        <CheckCircle className={`w-3.5 h-3.5 ${isSavingThis ? 'animate-spin' : 'text-amber-700'}`} />
                        <span>{isSavingThis ? 'Lưu...' : 'Lưu'}</span>
                      </button>

                      {/* Quick Presets */}
                      <div className="hidden sm:flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(cat.id!, 500000)}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg border border-amber-200/60 transition-all cursor-pointer"
                        >
                          +500k
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(cat.id!, 1000000)}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg border border-amber-200/60 transition-all cursor-pointer"
                        >
                          +1tr
                        </button>
                        <button
                          type="button"
                          onClick={() => handleQuickAdd(cat.id!, 2000000)}
                          className="px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-800 text-[10px] font-bold rounded-lg border border-amber-200/60 transition-all cursor-pointer"
                        >
                          +2tr
                        </button>
                      </div>
                    </div>

                    {/* Calculated Variance Badge */}
                    <div className="flex items-center justify-between md:justify-end gap-3 min-w-[180px]">
                      <div className="text-right">
                        <span className="text-[10px] uppercase font-black tracking-widest text-amber-800/60 block">
                          Chênh lệch
                        </span>
                        <span className={`text-sm font-black font-mono tabular-nums ${
                          variance >= 0 ? 'text-emerald-600' : 'text-rose-600'
                        }`}>
                          {variance >= 0 ? `Dư ${formatCurrency(variance)}` : `Vượt ${formatCurrency(Math.abs(variance))}`}
                        </span>
                      </div>

                      <div className={`px-2.5 py-1 rounded-xl text-[11px] font-black border ${
                        variance >= 0
                          ? 'bg-emerald-100/70 text-emerald-800 border-emerald-200'
                          : 'bg-rose-100/70 text-rose-800 border-rose-200 animate-pulse'
                      }`}>
                        {variance >= 0 ? 'An toàn ✨' : 'Vượt! 🙀'}
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  {limit > 0 && (
                    <div className="space-y-1 pt-1">
                      <div className="flex justify-between text-[10px] font-bold text-amber-800/70">
                        <span>Tiến độ sử dụng ngân sách ({percentSpent}%)</span>
                        <span>{formatCurrency(spent)} / {formatCurrency(limit)}</span>
                      </div>
                      <div className="w-full h-2.5 bg-amber-100/60 rounded-full overflow-hidden p-0.5 border border-amber-200/40">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${
                            percentSpent > 100 
                              ? 'bg-rose-500' 
                              : (percentSpent > 85 ? 'bg-amber-500' : 'bg-emerald-500')
                          }`}
                          style={{ width: `${Math.min(100, percentSpent)}%` }}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* SECTION: SETTLEMENT CYCLE CONFIGURATION */}
      <div className="bg-white p-6 sm:p-8 rounded-3xl shadow-lg shadow-amber-150/5 border-4 border-[#FFF2D8] space-y-6">
        <div>
          <h2 className="text-xl font-black text-amber-950 flex items-center gap-2">
            Cấu hình chu kỳ tính toán 🔄
          </h2>
          <p className="text-xs text-amber-800/70 font-semibold mt-1">
            Chọn chế độ chốt sổ định kỳ cố định hàng tháng hoặc theo từng đợt nhận lương.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <button
            onClick={async () => {
              await updateSettlementConfig(user.uid, { mode: 'fixed' });
              showToast('Đã chuyển sang chế độ chu kỳ cố định hàng tháng!', 'success');
            }}
            className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              settlementConfig.mode === 'fixed'
                ? 'border-[#FFC300] bg-amber-50/60 shadow-sm'
                : 'border-amber-100 hover:border-amber-200 bg-[#FFFDF9]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-extrabold text-amber-950 text-sm">📅 Cố định hàng tháng</span>
              {settlementConfig.mode === 'fixed' && <CheckCircle className="w-4 h-4 text-amber-600" />}
            </div>
            <p className="text-xs text-amber-800/70 font-medium">
              Chốt sổ vào ngày cố định (Ví dụ: Ngày {settlementConfig.settlement_day} hàng tháng).
            </p>
          </button>

          <button
            onClick={async () => {
              await updateSettlementConfig(user.uid, { mode: 'flexible' });
              showToast('Đã chuyển sang chế độ chu kỳ linh hoạt theo ngày nhận lương!', 'success');
            }}
            className={`p-5 rounded-2xl border-2 text-left transition-all cursor-pointer ${
              settlementConfig.mode === 'flexible'
                ? 'border-[#FFC300] bg-amber-50/60 shadow-sm'
                : 'border-amber-100 hover:border-amber-200 bg-[#FFFDF9]'
            }`}
          >
            <div className="flex items-center justify-between mb-2">
              <span className="font-extrabold text-amber-950 text-sm">💰 Linh hoạt theo lương</span>
              {settlementConfig.mode === 'flexible' && <CheckCircle className="w-4 h-4 text-amber-600" />}
            </div>
            <p className="text-xs text-amber-800/70 font-medium">
              Bắt đầu chu kỳ mới mỗi khi bạn nhập giao dịch nhận lương mới.
            </p>
          </button>
        </div>
      </div>
    </div>
  );
}
