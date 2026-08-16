import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { subscribeToTransactions, subscribeToCategories, subscribeToBudgets, setBudget, updateSettlementConfig, isExpenseCategory } from '../lib/db';
import { Transaction, Category, Budget as BudgetType, CustomCycle } from '../types';
import { isWithinInterval, format } from 'date-fns';
import { Settings2, HelpCircle, CheckCircle, Info, Calendar, AlertTriangle, RefreshCw, Zap } from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput, getCurrentPeriod } from '../lib/utils';
import { useFeedback } from '../context/FeedbackContext';
import { motion } from 'motion/react';
import { CardSkeleton } from '../components/Skeleton';

export default function Budget({ 
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
  const [targetIncome, setTargetIncome] = useState('10,000,000');
  const [showGuide, setShowGuide] = useState(true);
  const [loading, setLoading] = useState(true);
  const [isUpdating, setIsUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (settlementConfig?.estimated_income !== undefined) {
      setTargetIncome(formatNumberInput(settlementConfig.estimated_income.toString()));
    }
  }, [settlementConfig?.estimated_income]);
  
  useEffect(() => {
    let count = 0;
    const checkLoaded = () => {
      count++;
      if (count >= 3) setLoading(false);
    };

    const unsubTx = subscribeToTransactions(user.uid, (data) => { setTransactions(data); checkLoaded(); });
    const unsubCat = subscribeToCategories(user.uid, (data) => { setCategories(data); checkLoaded(); });
    const unsubBud = subscribeToBudgets(user.uid, (data) => { setBudgets(data); checkLoaded(); });
    return () => {
      unsubTx();
      unsubCat();
      unsubBud();
    };
  }, [user.uid]);

  const period = useMemo(() => {
    return getCurrentPeriod(settlementConfig, customCycles);
  }, [settlementConfig, customCycles]);

  const monthTxs = useMemo(() => {
    const { start, end } = period;
    return transactions.filter(t => !t.is_split_pending && isWithinInterval(new Date(t.date), { start, end }));
  }, [transactions, period]);

  const expenseCategories = useMemo(() => {
    return categories.filter(c => isExpenseCategory(c));
  }, [categories]);

  const budgetMap = useMemo(() => {
    return budgets.reduce((acc, b) => {
      acc[b.category_id!] = b;
      return acc;
    }, {} as Record<string, BudgetType>);
  }, [budgets]);

  const spentMap = useMemo(() => {
    return monthTxs.reduce((acc, t) => {
      if (t.type === 'expense') {
        acc[t.category_id] = (acc[t.category_id] || 0) + t.amount;
      }
      return acc;
    }, {} as Record<string, number>);
  }, [monthTxs]);

  const handleUpdateBudget = async (categoryId: string, percentage: number) => {
    const income = parseNumberInput(targetIncome);
    const limit = (income || 0) * (percentage / 100);
    setIsUpdating(categoryId);
    try {
      await setBudget(user.uid, categoryId, { percentage, limit_amount: limit });
    } catch (err) {
      showToast('Không thể cập nhật hạn mức.', 'error');
    } finally {
      setIsUpdating(null);
    }
  };

  const calculateAuto = async () => {
    if (expenseCategories.length === 0) return;
    const basePct = Math.floor(100 / expenseCategories.length);
    showToast('Đang phân bổ đều ngân sách tự động...', 'success');
    
    for (let idx = 0; idx < expenseCategories.length; idx++) {
      const cat = expenseCategories[idx];
      const pct = idx === 0 ? basePct + (100 % expenseCategories.length) : basePct;
      const income = parseNumberInput(targetIncome);
      const limit = (income || 0) * (pct / 100);
      await setBudget(user.uid, cat.id!, { percentage: pct, limit_amount: limit });
    }
    showToast('Phân bổ tự động hoàn tất!', 'success');
  };

  const handleTargetIncomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatNumberInput(e.target.value);
    setTargetIncome(formatted);
  };

  // Recalculate limits when targetIncome changes
  const applyNewIncomeLimits = async () => {
    const income = parseNumberInput(targetIncome);
    if (income <= 0) {
      showToast('Thu nhập ước tính phải lớn hơn 0.', 'error');
      return;
    }
    showToast('Đang cập nhật lại hạn mức các danh mục...', 'success');
    try {
      await updateSettlementConfig(user.uid, { estimated_income: income });
    } catch (err) {
      console.error('Lỗi khi lưu thu nhập ước tính:', err);
    }
    for (const cat of expenseCategories) {
      const currentBudget = budgetMap[cat.id!];
      const pct = currentBudget?.percentage || 0;
      const limit = income * (pct / 100);
      await setBudget(user.uid, cat.id!, { percentage: pct, limit_amount: limit });
    }
    showToast('Đã áp dụng mức thu nhập mới thành công!', 'success');
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-44 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-72 bg-slate-100 rounded animate-pulse" />
          </div>
          <div className="h-10 w-52 bg-slate-200 rounded animate-pulse" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <CardSkeleton />
          <CardSkeleton />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* HEADER WITH SETTLEMENT CALENDAR METRIC */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-amber-950 leading-none flex items-center gap-2">
            Ngân sách <span className="text-2xl">📊</span>
          </h1>
          <p className="text-xs sm:text-sm text-amber-800/80 font-bold mt-1.5">
            Lập kế hoạch phân phối dòng tiền cùng bé Coin để tối ưu chi tiêu nha! ✨
          </p>
        </div>
        <div className="bg-amber-100/80 border-2 border-amber-200/50 text-amber-950 text-xs font-black px-4 py-3 rounded-2xl flex items-center gap-2.5 shadow-sm self-start">
          <Calendar className="w-4.5 h-4.5 text-[#FFB700] shrink-0" />
          <span className="leading-snug">
            {period.isCustom 
              ? `Chu kỳ lương: ${period.cycleName || ''} (${format(period.start, 'dd/MM/yyyy')} - ${format(period.end, 'dd/MM/yyyy')})`
              : `Chu kỳ: ${format(period.start, 'dd/MM/yyyy')} - ${format(period.end, 'dd/MM/yyyy')} (Quyết toán: Ngày ${settlementDay} hàng tháng)`
            }
          </span>
        </div>
      </div>

      {/* Guide Banner with Modern Premium UI styling */}
      {showGuide && (
        <div className="bg-[#FFFBF0] border-2 border-[#FFF2D8] p-5.5 rounded-3xl relative transition-all duration-300 hover:shadow-sm">
          <button 
            onClick={() => setShowGuide(false)} 
            className="absolute top-4 right-4 text-amber-700 hover:text-amber-900 font-bold w-6 h-6 rounded-full hover:bg-amber-100/50 flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
          <h4 className="font-black text-amber-950 mb-2.5 flex items-center gap-2 text-sm sm:text-base">
            <span>💬</span>
            Bé Coin hướng dẫn nè:
          </h4>
          <ul className="space-y-2 text-xs sm:text-sm text-amber-900 list-decimal pl-5 font-bold leading-relaxed">
            <li>Nhập <strong className="text-amber-950">Thu nhập ước tính</strong> của bạn cho chu kỳ này (ví dụ: 10.000.000 VND).</li>
            <li>Phân chia tỷ trọng phần trăm mong muốn phân chia cho từng danh mục chi tiêu (ví dụ: Nhà cửa 30%, Di chuyển 15%).</li>
            <li>Finly tự động tính toán ra <strong className="text-amber-950">Số tiền giới hạn thực tế</strong> tương ứng (ví dụ: 10.000.000 x 30% = 3.000.000 VND).</li>
            <li>Thanh tiến độ thông minh chuyển đổi màu sắc linh hoạt từ <span className="text-emerald-600 font-black">Xanh lá (An toàn)</span> sang <span className="text-amber-500 font-black">Vàng (Cảnh báo)</span> và bật <span className="text-rose-600 font-black">Đỏ (Vượt hạn mức)</span> để ngăn ngừa bội chi kịp thời.</li>
          </ul>
        </div>
      )}

      {/* INPUT SETTING BUDGET ENGINE */}
      <div className="bg-white p-6 md:p-7.5 rounded-3xl shadow-lg shadow-amber-150/5 border-4 border-[#FFF2D8] mb-6">
        <h3 className="text-sm font-black text-amber-950 mb-4 flex items-center gap-1.5 uppercase tracking-widest">
          <Settings2 className="w-5 h-5 text-[#FFB700]" />
          Thiết lập ngân sách chung ⚙️
        </h3>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 max-w-xl">
          <div className="flex-1">
            <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">
              Thu nhập ước tính chu kỳ này (VND)
            </label>
            <input
              type="text"
              value={targetIncome}
              onChange={handleTargetIncomeChange}
              className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-3 px-3.5 text-slate-900 focus:border-[#FFC300] focus:ring-0 focus:outline-none sm:text-sm font-mono font-semibold tabular-nums"
              placeholder="Ví dụ: 10,000,000"
            />
          </div>
          <div className="flex gap-2.5">
            <button 
              onClick={applyNewIncomeLimits}
              className="px-5 py-3 bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] text-amber-950 border-b-4 border-amber-600 rounded-2xl text-xs font-black transition-all shadow-md shadow-amber-100 flex items-center gap-1.5 cursor-pointer"
              title="Cập nhật hạn mức tiền cho tất cả danh mục"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              <span>Áp dụng</span>
            </button>
            <button 
              onClick={calculateAuto}
              className="px-5 py-3 bg-amber-50 hover:bg-amber-100 text-amber-900 border-2 border-amber-200/50 rounded-2xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
            >
              <Zap className="w-3.5 h-3.5 text-amber-500" />
              <span>Chia đều %</span>
            </button>
          </div>
        </div>
      </div>

      {/* BENTO GRID OF BUDGET CATEGORIES */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {expenseCategories.map(cat => {
          const budget = budgetMap[cat.id!];
          const limit = budget?.limit_amount || 0;
          const spent = spentMap[cat.id!] || 0;
          
          const percentageSpent = limit > 0 ? Math.min((spent / limit) * 100, 100) : (spent > 0 ? 100 : 0);
          const ratio = limit > 0 ? spent / limit : 0;
          
          // Color pill based on spent ratio: Green -> Yellow -> Red
          let progressColor = 'bg-emerald-500'; // Safe
          let pillBgColor = 'bg-emerald-50';
          let textColor = 'text-emerald-700';
          if (ratio > 0.70 && ratio <= 1.0) {
            progressColor = 'bg-amber-500'; // Warning
            pillBgColor = 'bg-amber-50';
            textColor = 'text-amber-600';
          } else if (ratio > 1.0) {
            progressColor = 'bg-rose-500'; // Danger overrun
            pillBgColor = 'bg-rose-50';
            textColor = 'text-rose-600';
          }

          return (
            <div key={cat.id} className="bg-white p-6 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:shadow-xl transition-all duration-300 hover:-translate-y-1 flex flex-col justify-between">
              <div>
                <div className="flex justify-between items-start mb-5">
                  <div className="flex items-center space-x-3.5">
                    <div 
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-white" 
                      style={{ backgroundColor: `${cat.color}15` }}
                    >
                      <span className="font-extrabold text-lg" style={{ color: cat.color }}>{cat.name[0]}</span>
                    </div>
                    <div>
                      <h4 className="font-black text-amber-950 tracking-tight leading-snug">{cat.name}</h4>
                      <p className="text-xs text-amber-800/60 font-bold mt-0.5">{budget?.percentage || 0}% thu nhập của bạn</p>
                    </div>
                  </div>
                  
                  {/* Realtime input percentage selector */}
                  <div className="flex items-center space-x-1 bg-amber-50/50 p-1 rounded-xl border border-amber-100">
                    <input 
                      type="number" 
                      className="w-12 bg-transparent border-none outline-none font-mono font-black text-sm text-center text-amber-950 focus:ring-0"
                      placeholder="0"
                      value={budget?.percentage || ''}
                      onChange={(e) => handleUpdateBudget(cat.id!, parseFloat(e.target.value) || 0)}
                    />
                    <span className="text-xs font-black text-amber-850/60 pr-1.5">%</span>
                  </div>
                </div>

                <div className="mb-2.5 flex justify-between text-[11px] font-black uppercase tracking-widest text-amber-800/80">
                  <span>Đã tiêu: <span className="font-mono text-amber-950 tracking-tight font-extrabold">{formatCurrency(spent)}</span></span>
                  <span>Hạn mức: <span className="font-mono text-amber-950 tracking-tight font-extrabold">{formatCurrency(limit)}</span></span>
                </div>
                
                {/* Advanced Rounded Pill Progression Track */}
                <div className="w-full bg-amber-50/50 border border-amber-100/50 rounded-full h-3.5 overflow-hidden shadow-inner relative p-[1px]">
                  <motion.div 
                    initial={{ width: 0 }}
                    animate={{ width: `${percentageSpent}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className={`h-full rounded-full ${progressColor}`}
                  />
                </div>
              </div>

              {/* Warnings and stats overlays */}
              <div className="mt-4 pt-3.5 border-t border-amber-100/40 flex items-center justify-between">
                {ratio > 1.0 ? (
                  <p className="text-xs text-rose-600 font-black flex items-center gap-1 leading-none">
                    <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                    <span>Vượt định mức: {formatCurrency(spent - limit)}</span>
                  </p>
                ) : (
                  <span className="text-[10px] font-black text-amber-800/60 uppercase tracking-widest leading-none">
                    {ratio > 0.7 ? '🐾 Tiệm cận giới hạn' : '🐾 Trong vùng an toàn'}
                  </span>
                )}
                
                <span className={`text-xs font-black px-2.5 py-1 rounded-lg shrink-0 ${pillBgColor} ${textColor}`}>
                  {Math.round(ratio * 100)}%
                </span>
              </div>
            </div>
          );
        })}
        
        {expenseCategories.length === 0 && (
          <div className="col-span-2 text-center text-amber-800 py-14 bg-white rounded-3xl border-4 border-[#FFF2D8] flex flex-col items-center justify-center gap-2 shadow">
            <span className="text-4xl">🐾</span>
            <div>
              <p className="font-black text-amber-950">Chưa có danh mục chi phí nào</p>
              <p className="text-xs text-amber-700/70 mt-1">Hãy tạo một danh mục chi phí ở Tổng quan để bắt đầu cấu hình định mức nha.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
