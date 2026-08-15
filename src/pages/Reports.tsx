import { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import { subscribeToTransactions, subscribeToCategories, subscribeToSavings } from '../lib/db';
import { Transaction, Category, CustomCycle, SavingTransaction } from '../types';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { format, isWithinInterval } from 'date-fns';
import { formatCurrency, getSettlementPeriod, getCurrentPeriod } from '../lib/utils';
import { Calendar, HelpCircle, BarChart3, TrendingUp, Sparkles, Receipt, Info, FileSpreadsheet, ChevronRight, PiggyBank } from 'lucide-react';
import { ListSkeleton } from '../components/Skeleton';

export default function Reports({ 
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
  const [categories, setCategories] = useState<Category[]>([]);
  const [savings, setSavings] = useState<SavingTransaction[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [reportType, setReportType] = useState<'month' | 'year'>('month');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
 
  useEffect(() => {
    let loadedT = false;
    let loadedC = false;
    let loadedS = false;
    const checkLoaded = () => {
      if (loadedT && loadedC && loadedS) setLoading(false);
    };

    const unsubTx = subscribeToTransactions(user.uid, (data) => {
      setTransactions(data);
      loadedT = true;
      checkLoaded();
    });
    const unsubCat = subscribeToCategories(user.uid, (data) => {
      setCategories(data);
      loadedC = true;
      checkLoaded();
    });
    const unsubSavings = subscribeToSavings(user.uid, (data) => {
      setSavings(data);
      loadedS = true;
      checkLoaded();
    });

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    return () => {
      unsubTx();
      unsubCat();
      unsubSavings();
      clearTimeout(safetyTimer);
    };
  }, [user.uid]);

  const catMap = useMemo(() => {
    return categories.reduce((acc, cat) => {
      acc[cat.id!] = cat;
      return acc;
    }, {} as Record<string, Category>);
  }, [categories]);

  const period = useMemo(() => {
    // If user has selected a month, let's look at the cycle starting on settlementDay of that month or matching custom cycles.
    const dateWithSettlementDay = new Date(currentMonth.getFullYear(), currentMonth.getMonth(), settlementDay);
    return getCurrentPeriod(settlementConfig, customCycles, dateWithSettlementDay);
  }, [settlementDay, settlementConfig, customCycles, currentMonth]);

  const monthTxs = useMemo(() => {
    const { start, end } = period;
    return transactions.filter(t => !t.is_split_pending && isWithinInterval(new Date(t.date), { start, end }));
  }, [transactions, period]);

  // Helper to compute stats for any list of transactions, accounting for net debt/loan payments
  const calculateAdjustedStats = useCallback((txs: Transaction[]) => {
    let regularIncome = 0;
    let regularExpense = 0;
    let loanRecoveries = 0;
    let debtPayments = 0;

    txs.forEach(t => {
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

    return {
      income: adjustedIncome,
      expense: adjustedExpense,
      net: adjustedIncome - adjustedExpense,
      rawIncome: regularIncome + loanRecoveries,
      rawExpense: regularExpense + debtPayments,
      debtPayments,
      loanRecoveries
    };
  }, [catMap]);

  const getPeriodSavings = useCallback((start: Date, end: Date) => {
    let deposits = 0;
    let withdrawals = 0;
    savings.forEach(s => {
      if (isWithinInterval(new Date(s.date), { start, end })) {
        if (s.type === 'deposit') {
          deposits += s.amount;
        } else {
          withdrawals += s.amount;
        }
      }
    });
    return deposits - withdrawals;
  }, [savings]);

  const stats = useMemo(() => {
    return calculateAdjustedStats(monthTxs);
  }, [monthTxs, calculateAdjustedStats]);

  const periodSavings = useMemo(() => {
    return getPeriodSavings(period.start, period.end);
  }, [period, getPeriodSavings]);

  const pieData = useMemo(() => {
    const expenses = monthTxs.filter(t => {
      if (t.type !== 'expense') return false;
      const cat = catMap[t.category_id];
      const catName = cat?.name?.toLowerCase() || '';
      const note = t.note?.toLowerCase() || '';
      const isDebtPayment = catName.includes('trả nợ') || catName.includes('trả góp') || note.includes('trả nợ') || note.includes('trả góp');
      return !isDebtPayment;
    });

    const grouped = expenses.reduce((acc, t) => {
      acc[t.category_id] = (acc[t.category_id] || 0) + t.amount;
      return acc;
    }, {} as Record<string, number>);
    
    return Object.keys(grouped).map(catId => ({
      name: catMap[catId]?.name || 'Không rõ',
      value: grouped[catId],
      color: catMap[catId]?.color || '#94a3b8'
    })).sort((a, b) => b.value - a.value);
  }, [monthTxs, catMap]);

  const yearlyStats = useMemo(() => {
    const monthsData = Array.from({ length: 12 }, (_, i) => {
      const dateWithSettlementDay = new Date(currentYear, i, settlementDay);
      const cycle = getSettlementPeriod(settlementDay, dateWithSettlementDay);
      
      const cycleTxs = transactions.filter(t => 
        !t.is_split_pending && 
        isWithinInterval(new Date(t.date), { start: cycle.start, end: cycle.end })
      );

      const mStats = calculateAdjustedStats(cycleTxs);
      const mSavings = getPeriodSavings(cycle.start, cycle.end);

      return {
        monthIndex: i,
        name: `Tháng ${i + 1}`,
        'Thu nhập': mStats.rawIncome,
        'Chi phí': mStats.rawExpense,
        'Tiết kiệm': mSavings,
        'Còn lại': mStats.rawIncome - mStats.rawExpense - mSavings
      };
    });

    let totalIncome = 0;
    let totalExpense = 0;
    let totalSavings = 0;
    let totalRemaining = 0;

    monthsData.forEach(m => {
      totalIncome += m['Thu nhập'];
      totalExpense += m['Chi phí'];
      totalSavings += m['Tiết kiệm'];
      totalRemaining += m['Còn lại'];
    });

    return {
      monthsData,
      totalIncome,
      totalExpense,
      totalSavings,
      totalRemaining
    };
  }, [currentYear, settlementDay, transactions, calculateAdjustedStats, getPeriodSavings]);

  const barData = useMemo(() => {
    return [
      { 
        name: 'Dòng tiền chu kỳ', 
        'Thu nhập': stats.rawIncome, 
        'Chi phí': stats.rawExpense,
        'Tiết kiệm': periodSavings,
        'Còn lại': stats.rawIncome - stats.rawExpense - periodSavings
      }
    ];
  }, [stats, periodSavings]);

  const yearOptions = useMemo(() => {
    const currentYearVal = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYearVal - 2 + i);
  }, []);

  const handlePieSectorClick = useCallback((data: any) => {
    if (data && data.name) {
      const matchedCat = categories.find(c => c.name === data.name);
      if (matchedCat?.id) {
        localStorage.setItem('filter_category_id', matchedCat.id);
        // Dispatch custom navigation event
        window.dispatchEvent(new CustomEvent('finly_change_tab', { detail: { tab: 'history' } }));
      }
    }
  }, [categories]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-amber-100 rounded-2xl animate-pulse" />
        <ListSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-300">
      {/* Premium Sliding Segmented Tab Selector */}
      <div className="flex bg-amber-100/50 p-1 rounded-2xl max-w-xs border-2 border-amber-100/20">
        <button
          onClick={() => setReportType('month')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
            reportType === 'month'
              ? 'bg-[#FFC300] text-amber-950 shadow-sm'
              : 'text-amber-800/70 hover:text-amber-900'
          }`}
        >
          Báo cáo tháng 📅
        </button>
        <button
          onClick={() => setReportType('year')}
          className={`flex-1 py-2 text-xs font-black rounded-xl transition-all cursor-pointer ${
            reportType === 'year'
              ? 'bg-[#FFC300] text-amber-950 shadow-sm'
              : 'text-amber-800/70 hover:text-amber-900'
          }`}
        >
          Báo cáo năm 🚀
        </button>
      </div>

      {/* FILTER & TITLE HERO ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-amber-950 leading-tight flex items-center gap-2">
            {reportType === 'month' ? 'Báo cáo tháng 📊' : 'Báo cáo năm 🏆'}
          </h1>
          <p className="text-xs sm:text-sm text-amber-800/80 font-bold mt-1">
            Báo cáo đa chiều, biểu đồ kute, hỗ trợ tối ưu hóa kế hoạch ngân sách nha! ✨
          </p>
          {reportType === 'month' && (
            <div className="mt-2 flex items-center gap-1.5 text-xs text-amber-900 font-bold">
              <Calendar className="w-3.5 h-3.5 shrink-0 text-amber-600" />
              <span>
                {period.isCustom 
                  ? `Chu kỳ lương: ${period.cycleName || ''} (${format(period.start, 'dd/MM/yyyy')} - ${format(period.end, 'dd/MM/yyyy')})`
                  : `Chu kỳ: ${format(period.start, 'dd/MM/yyyy')} - ${format(period.end, 'dd/MM/yyyy')} (Khấu trừ: Ngày ${settlementDay} hàng tháng)`
                }
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-3 shrink-0 self-start sm:self-center">
          {reportType === 'month' ? (
            <input 
              type="month"
              value={format(currentMonth, 'yyyy-MM')}
              onChange={(e) => setCurrentMonth(new Date(e.target.value + '-01T00:00:00'))}
              className="block rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-bold cursor-pointer shadow-sm"
            />
          ) : (
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              className="block rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-bold cursor-pointer shadow-sm"
            >
              {yearOptions.map(y => (
                <option key={y} value={y}>Năm {y}</option>
              ))}
            </select>
          )}
        </div>
      </div>

      {reportType === 'month' ? (
        <>
          {/* FOUR-CARD HERO METRICS GRID */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white p-5 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800/80 mb-1">Tổng thu nhập 👛</span>
              <p className="text-xl sm:text-2xl font-black text-emerald-600 font-mono tracking-tight tabular-nums">{formatCurrency(stats.rawIncome)}</p>
            </div>
            <div className="bg-white p-5 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800/80 mb-1">Tổng chi tiêu 🛍️</span>
              <p className="text-xl sm:text-2xl font-black text-rose-500 font-mono tracking-tight tabular-nums">{formatCurrency(stats.rawExpense)}</p>
            </div>
            <div className="bg-white p-5 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800/80 mb-1">Gửi tiết kiệm 🐖</span>
              <p className="text-xl sm:text-2xl font-black text-amber-600 font-mono tracking-tight tabular-nums">{formatCurrency(periodSavings)}</p>
            </div>
            <div className="bg-gradient-to-br from-[#FFFDF9] to-[#FFF9E6] p-5 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800/80 mb-1">Thu nhập còn lại 🪙</span>
              <p className={`text-xl sm:text-2xl font-black font-mono tracking-tight tabular-nums ${stats.rawIncome - stats.rawExpense - periodSavings >= 0 ? 'text-amber-950' : 'text-rose-500'}`}>
                {formatCurrency(stats.rawIncome - stats.rawExpense - periodSavings)}
              </p>
            </div>
          </div>

          {/* NET DEBT FLOW RESOLUTION ALERTS */}
          {(stats.debtPayments > 0 || stats.loanRecoveries > 0) && (
            <div className="bg-amber-50/50 border-2 border-amber-100/60 p-4.5 rounded-3xl flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-amber-950 gap-2.5 shadow-xs">
              <div className="flex items-start gap-2">
                <Info className="w-4.5 h-4.5 text-amber-600 shrink-0 mt-0.5" />
                <p className="font-bold text-amber-900">
                  <span className="text-amber-950 font-black">Giải trình điều chỉnh công nợ:</span> Số dư khả dụng thực tế của chu kỳ đã được cập nhật do phát sinh hoạt động tín dụng: Đã chi trả nợ <strong className="text-rose-500">-{formatCurrency(stats.debtPayments)}</strong> và Thu hồi nợ <strong className="text-emerald-600">+{formatCurrency(stats.loanRecoveries)}</strong>.
                </p>
              </div>
              <div className="font-black bg-amber-100 text-amber-950 px-3.5 py-1.5 rounded-xl shrink-0 font-mono text-[11px] self-start sm:self-auto border border-amber-200">
                Lượng nợ ròng: {formatCurrency(stats.loanRecoveries - stats.debtPayments)}
              </div>
            </div>
          )}

          {/* CHARTS GRAPH CONTAINER */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Pie Category Allocation Chart */}
            <div className="bg-white p-6 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:shadow-lg transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-black text-amber-950 tracking-tight flex items-center gap-1.5 uppercase">
                  <BarChart3 className="w-5 h-5 text-[#FFC300]" />
                  Phân bổ chi phí danh mục 🍰
                </h3>
                {pieData.length > 0 && (
                  <span className="text-[9px] bg-amber-50 border border-amber-100/70 font-black uppercase tracking-wider text-amber-700 px-2.5 py-1 rounded-lg">
                    Chạm miếng bánh để lọc nha!
                  </span>
                )}
              </div>
              {pieData.length > 0 ? (
                <div>
                  <div className="h-68">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={pieData}
                          cx="50%"
                          cy="50%"
                          innerRadius={68}
                          outerRadius={88}
                          paddingAngle={3}
                          dataKey="value"
                          onClick={handlePieSectorClick}
                        >
                          {pieData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={entry.color} 
                              className="cursor-pointer focus:outline-none hover:opacity-90 transition-opacity"
                            />
                          ))}
                        </Pie>
                        <Tooltip 
                          formatter={(value: number) => formatCurrency(value)} 
                          contentStyle={{ backgroundColor: '#FFFDF9', color: '#451a03', borderRadius: '24px', border: '4px solid #FFF2D8', padding: '10px 14px', fontSize: '11px', fontWeight: '900' }}
                        />
                        <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-amber-800/80 font-bold text-center mt-3 flex items-center justify-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500 animate-pulse" />
                    <span>Mẹo: Click vào bất kỳ danh mục nào để nhảy về Lịch sử lọc chi tiết!</span>
                  </p>
                </div>
              ) : (
                <div className="h-68 flex flex-col items-center justify-center text-amber-800/60 gap-2">
                  <Receipt className="w-10 h-10 text-amber-200 stroke-[1.5]" />
                  <p className="text-xs font-black">Chưa phát sinh chi phí nào trong chu kỳ này hết á.</p>
                </div>
              )}
            </div>

            {/* Income vs Expense Bar Chart */}
            <div className="bg-white p-6 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:shadow-lg transition-all duration-300">
              <h3 className="text-sm font-black text-amber-950 mb-6 tracking-tight flex items-center gap-1.5 uppercase">
                <TrendingUp className="w-5 h-5 text-emerald-500" />
                Cân đối thu chi thực tế ⚖️
              </h3>
              <div className="h-68">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#fffbeb" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#78350f' }} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} tick={{ fontSize: 11, fill: '#78350f' }} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(255, 195, 0, 0.05)' }} 
                      formatter={(value: number) => formatCurrency(value)} 
                      contentStyle={{ backgroundColor: '#FFFDF9', color: '#451a03', borderRadius: '24px', border: '4px solid #FFF2D8', padding: '10px 14px', fontSize: '11px', fontWeight: '900' }}
                    />
                    <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                    <Bar dataKey="Thu nhập" fill="#10B981" radius={[6, 6, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="Chi phí" fill="#F43F5E" radius={[6, 6, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="Tiết kiệm" fill="#F59E0B" radius={[6, 6, 0, 0]} maxBarSize={30} />
                    <Bar dataKey="Còn lại" fill="#3B82F6" radius={[6, 6, 0, 0]} maxBarSize={30} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* YEARLY HERO ROW */}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
            <div className="bg-white p-5 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800/80 mb-1">Thu nhập cả năm ({currentYear}) 💸</span>
              <p className="text-xl sm:text-2xl font-black text-emerald-600 font-mono tracking-tight tabular-nums">{formatCurrency(yearlyStats.totalIncome)}</p>
            </div>
            <div className="bg-white p-5 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800/80 mb-1">Chi phí cả năm ({currentYear}) 🛍️</span>
              <p className="text-xl sm:text-2xl font-black text-rose-500 font-mono tracking-tight tabular-nums">{formatCurrency(yearlyStats.totalExpense)}</p>
            </div>
            <div className="bg-white p-5 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800/80 mb-1">Tiết kiệm cả năm 🐖</span>
              <p className="text-xl sm:text-2xl font-black text-amber-600 font-mono tracking-tight tabular-nums">{formatCurrency(yearlyStats.totalSavings)}</p>
            </div>
            <div className="bg-gradient-to-br from-[#FFFDF9] to-[#FFF9E6] p-5 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:-translate-y-1 hover:shadow-lg transition-all duration-300 flex flex-col justify-center">
              <span className="text-[10px] font-black uppercase tracking-widest text-amber-800/80 mb-1">Thu nhập còn lại 🪙</span>
              <p className={`text-xl sm:text-2xl font-black font-mono tracking-tight tabular-nums ${yearlyStats.totalRemaining >= 0 ? 'text-amber-950' : 'text-rose-500'}`}>
                {formatCurrency(yearlyStats.totalRemaining)}
              </p>
            </div>
          </div>

          {/* YEARLY COMPARISON TRENDING CHART */}
          <div className="bg-white p-6 rounded-3xl shadow-md border-4 border-[#FFF2D8] hover:shadow-lg transition-all duration-300 mt-6">
            <h3 className="text-sm font-black text-amber-950 mb-6 tracking-tight flex items-center gap-1.5 uppercase">
              <BarChart3 className="w-5 h-5 text-[#FFC300]" />
              Biến động dòng tiền các tháng năm {currentYear} 📈
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyStats.monthsData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#fffbeb" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#78350f' }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} tick={{ fontSize: 11, fill: '#78350f' }} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(255, 195, 0, 0.05)' }} 
                    formatter={(value: number) => formatCurrency(value)} 
                    contentStyle={{ backgroundColor: '#FFFDF9', color: '#451a03', borderRadius: '24px', border: '4px solid #FFF2D8', padding: '10px 14px', fontSize: '11px', fontWeight: '900' }}
                  />
                  <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                  <Bar dataKey="Thu nhập" fill="#10B981" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Chi phí" fill="#F43F5E" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Tiết kiệm" fill="#F59E0B" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Còn lại" fill="#3B82F6" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* MONTH-BY-MONTH GRID DETAILED LIST */}
          <div className="bg-white rounded-3xl border-4 border-[#FFF2D8] shadow-md overflow-hidden mt-6">
            <div className="px-6 py-4.5 border-b border-amber-100 flex items-center gap-1.5 bg-amber-50/50">
              <FileSpreadsheet className="w-5 h-5 text-amber-700" />
              <h3 className="text-xs font-black text-amber-950 uppercase tracking-widest">Bảng số liệu chi tiết các tháng</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-amber-100">
                <thead className="bg-amber-50/30">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-black uppercase tracking-wider text-amber-800">Tháng</th>
                    <th className="px-6 py-3.5 text-right text-xs font-black uppercase tracking-wider text-amber-800">Tổng thu nhập</th>
                    <th className="px-6 py-3.5 text-right text-xs font-black uppercase tracking-wider text-amber-800">Tổng chi tiêu</th>
                    <th className="px-6 py-3.5 text-right text-xs font-black uppercase tracking-wider text-amber-800">Gửi tiết kiệm</th>
                    <th className="px-6 py-3.5 text-right text-xs font-black uppercase tracking-wider text-amber-800">Thu nhập còn lại</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-amber-100/60 font-mono text-xs sm:text-sm">
                  {yearlyStats.monthsData.map((row) => (
                    <tr key={row.name} className="hover:bg-amber-50/20 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-amber-950 font-sans font-bold flex items-center gap-1">
                        <span>{row.name}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-amber-300" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-emerald-600 font-bold tabular-nums">{formatCurrency(row['Thu nhập'])}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-rose-500 font-bold tabular-nums">{formatCurrency(row['Chi phí'])}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-amber-600 font-bold tabular-nums">{formatCurrency(row['Tiết kiệm'])}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-right font-black tabular-nums ${row['Còn lại'] >= 0 ? 'text-amber-950' : 'text-rose-500'}`}>
                        {formatCurrency(row['Còn lại'])}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
