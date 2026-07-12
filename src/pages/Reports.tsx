import { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import { subscribeToTransactions, subscribeToCategories } from '../lib/db';
import { Transaction, Category, CustomCycle } from '../types';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { format, isWithinInterval } from 'date-fns';
import { formatCurrency, getSettlementPeriod, getCurrentPeriod } from '../lib/utils';
import { Calendar, HelpCircle, BarChart3, TrendingUp, Sparkles, Receipt, Info, FileSpreadsheet, ChevronRight } from 'lucide-react';
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
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [reportType, setReportType] = useState<'month' | 'year'>('month');
  const [currentYear, setCurrentYear] = useState(new Date().getFullYear());
  const [loading, setLoading] = useState(true);
 
  useEffect(() => {
    let loadedT = false;
    let loadedC = false;
    const checkLoaded = () => {
      if (loadedT && loadedC) setLoading(false);
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

    return () => {
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

  const stats = useMemo(() => {
    return calculateAdjustedStats(monthTxs);
  }, [monthTxs, calculateAdjustedStats]);

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
      return {
        monthIndex: i,
        name: `Tháng ${i + 1}`,
        'Thu nhập': mStats.income,
        'Chi phí': mStats.expense,
        'Tiết kiệm': mStats.net,
      };
    });

    let totalIncome = 0;
    let totalExpense = 0;
    let totalNet = 0;

    monthsData.forEach(m => {
      totalIncome += m['Thu nhập'];
      totalExpense += m['Chi phí'];
      totalNet += m['Tiết kiệm'];
    });

    return {
      monthsData,
      totalIncome,
      totalExpense,
      totalNet
    };
  }, [currentYear, settlementDay, transactions, calculateAdjustedStats]);

  const barData = useMemo(() => {
    return [
      { name: 'Phân tích dòng tiền', Thu: stats.income, Chi: stats.expense }
    ];
  }, [stats]);

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
        <div className="h-10 w-64 bg-slate-200 rounded animate-pulse" />
        <ListSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Premium Sliding Segmented Tab Selector */}
      <div className="flex bg-slate-100 p-1 rounded-xl max-w-xs">
        <button
          onClick={() => setReportType('month')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            reportType === 'month'
              ? 'bg-white shadow text-[#4F6EF7]'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Báo cáo tháng
        </button>
        <button
          onClick={() => setReportType('year')}
          className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
            reportType === 'year'
              ? 'bg-white shadow text-[#4F6EF7]'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          Báo cáo năm
        </button>
      </div>

      {/* FILTER & TITLE HERO ROW */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight">
            {reportType === 'month' ? 'Báo cáo tháng' : 'Báo cáo năm'}
          </h1>
          <p className="text-sm text-slate-500 font-medium">Báo cáo đa chiều, biểu đồ trực quan, hỗ trợ tối ưu hóa kế hoạch ngân sách.</p>
          {reportType === 'month' && (
            <div className="mt-1.5 flex items-center gap-1.5 text-xs text-[#4F6EF7] font-bold">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>
                {period.isCustom 
                  ? `Chu kỳ lương: ${period.cycleName || ''} (${format(period.start, 'dd/MM/yyyy')} - ${format(period.end, 'dd/MM/yyyy')})`
                  : `Chu kỳ: ${format(period.start, 'dd/MM/yyyy')} - ${format(period.end, 'dd/MM/yyyy')} (Quyết toán: Ngày ${settlementDay} hàng tháng)`
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
              className="block rounded-xl border-0 py-2.5 px-3.5 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-[#4F6EF7] text-sm font-bold bg-white cursor-pointer"
            />
          ) : (
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              className="block rounded-xl border-0 py-2.5 px-3.5 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-[#4F6EF7] text-sm font-bold bg-white cursor-pointer"
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
          {/* THREE-CARD HERO METRICS GRID */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 flex flex-col justify-center">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Tổng thu nhập khả dụng</span>
              <p className="text-2xl sm:text-3xl font-bold text-[#17B978] font-mono tracking-tight tabular-nums">{formatCurrency(stats.income)}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 flex flex-col justify-center">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Tổng chi phí định lượng</span>
              <p className="text-2xl sm:text-3xl font-bold text-[#F0426B] font-mono tracking-tight tabular-nums">{formatCurrency(stats.expense)}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 flex flex-col justify-center">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Tiết kiệm ròng dư thừa</span>
              <p className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight tabular-nums ${stats.net >= 0 ? 'text-slate-900' : 'text-[#F0426B]'}`}>
                {formatCurrency(stats.net)}
              </p>
            </div>
          </div>

          {/* NET DEBT FLOW RESOLUTION ALERTS */}
          {(stats.debtPayments > 0 || stats.loanRecoveries > 0) && (
            <div className="bg-indigo-50/40 border border-indigo-100/40 p-4.5 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-indigo-950 gap-2.5 shadow-xs">
              <div className="flex items-start gap-2">
                <Info className="w-4.5 h-4.5 text-[#4F6EF7] shrink-0 mt-0.5" />
                <p className="font-medium">
                  <span className="font-bold">Giải trình điều chỉnh công nợ:</span> Số dư khả dụng thực tế của chu kỳ đã được cập nhật do phát sinh hoạt động tín dụng: Đã chi trả nợ <strong className="text-rose-600">-{formatCurrency(stats.debtPayments)}</strong> và Thu hồi nợ <strong className="text-emerald-600">+{formatCurrency(stats.loanRecoveries)}</strong>.
                </p>
              </div>
              <div className="font-bold bg-indigo-100/60 text-indigo-900 px-3 py-1.5 rounded-xl shrink-0 font-mono text-[11px] self-start sm:self-auto shadow-xs">
                Lượng nợ ròng: {formatCurrency(stats.loanRecoveries - stats.debtPayments)}
              </div>
            </div>
          )}

          {/* CHARTS GRAPH CONTAINER */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            
            {/* Pie Category Allocation Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all duration-300">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-base font-bold text-slate-900 tracking-tight flex items-center gap-1.5">
                  <BarChart3 className="w-5 h-5 text-[#4F6EF7]" />
                  Phân bổ chi phí theo danh mục
                </h3>
                {pieData.length > 0 && (
                  <span className="text-[10px] bg-slate-100 font-bold uppercase tracking-wider text-slate-400 px-2.5 py-1 rounded-lg">
                    Click lát để lọc
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
                          contentStyle={{ backgroundColor: '#0B0F19', color: '#fff', borderRadius: '12px', border: 'none', padding: '10px 14px', fontSize: '12px', fontWeight: 'bold' }}
                        />
                        <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <p className="text-[11px] text-slate-400 font-medium text-center mt-3 flex items-center justify-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 text-amber-500" />
                    <span>Mẹo: Click vào bất kỳ danh mục nào để nhảy về Lịch sử lọc chi tiết!</span>
                  </p>
                </div>
              ) : (
                <div className="h-68 flex flex-col items-center justify-center text-slate-400 gap-2">
                  <Receipt className="w-10 h-10 text-slate-200 stroke-[1.5]" />
                  <p className="text-xs font-semibold">Không có chi phí định lượng phát sinh chu kỳ này.</p>
                </div>
              )}
            </div>

            {/* Income vs Expense Bar Chart */}
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all duration-300">
              <h3 className="text-base font-bold text-slate-900 mb-6 tracking-tight flex items-center gap-1.5">
                <TrendingUp className="w-5 h-5 text-[#17B978]" />
                Cân đối thu chi thực tế
              </h3>
              <div className="h-68">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748b' }} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} tick={{ fontSize: 11, fill: '#64748b' }} />
                    <Tooltip 
                      cursor={{ fill: 'rgba(0, 0, 0, 0.02)' }} 
                      formatter={(value: number) => formatCurrency(value)} 
                      contentStyle={{ backgroundColor: '#0B0F19', color: '#fff', borderRadius: '12px', border: 'none', padding: '10px 14px', fontSize: '12px', fontWeight: 'bold' }}
                    />
                    <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                    <Bar dataKey="Thu" name="Thu nhập điều chỉnh" fill="#17B978" radius={[6, 6, 0, 0]} maxBarSize={45} />
                    <Bar dataKey="Chi" name="Chi phí thuần" fill="#F0426B" radius={[6, 6, 0, 0]} maxBarSize={45} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          {/* YEARLY HERO ROW */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 flex flex-col justify-center">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Thu nhập cả năm ({currentYear})</span>
              <p className="text-2xl sm:text-3xl font-bold text-[#17B978] font-mono tracking-tight tabular-nums">{formatCurrency(yearlyStats.totalIncome)}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 flex flex-col justify-center">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Chi phí cả năm ({currentYear})</span>
              <p className="text-2xl sm:text-3xl font-bold text-[#F0426B] font-mono tracking-tight tabular-nums">{formatCurrency(yearlyStats.totalExpense)}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all duration-300 hover:-translate-y-0.5 flex flex-col justify-center">
              <span className="text-xs font-bold uppercase tracking-widest text-slate-400 mb-1">Tích lũy lũy kế</span>
              <p className={`text-2xl sm:text-3xl font-bold font-mono tracking-tight tabular-nums ${yearlyStats.totalNet >= 0 ? 'text-slate-900' : 'text-[#F0426B]'}`}>
                {formatCurrency(yearlyStats.totalNet)}
              </p>
            </div>
          </div>

          {/* YEARLY COMPARISON TRENDING CHART */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100/50 hover:shadow-md transition-all duration-300 mt-6">
            <h3 className="text-base font-bold text-slate-900 mb-6 tracking-tight flex items-center gap-1.5">
              <BarChart3 className="w-5 h-5 text-[#4F6EF7]" />
              Biến động thu chi các tháng trong năm {currentYear}
            </h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyStats.monthsData} margin={{ top: 10, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 11, fontWeight: 'bold', fill: '#64748b' }} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => `${(val / 1000000).toFixed(0)}M`} tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip 
                    cursor={{ fill: 'rgba(0, 0, 0, 0.02)' }} 
                    formatter={(value: number) => formatCurrency(value)} 
                    contentStyle={{ backgroundColor: '#0B0F19', color: '#fff', borderRadius: '12px', border: 'none', padding: '10px 14px', fontSize: '12px', fontWeight: 'bold' }}
                  />
                  <Legend iconSize={10} iconType="circle" wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }} />
                  <Bar dataKey="Thu nhập" fill="#17B978" radius={[5, 5, 0, 0]} />
                  <Bar dataKey="Chi phí" fill="#F0426B" radius={[5, 5, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* MONTH-BY-MONTH GRID DETAILED LIST */}
          <div className="bg-white rounded-2xl border border-slate-100/60 shadow-sm overflow-hidden mt-6">
            <div className="px-6 py-4.5 border-b border-slate-100/60 flex items-center gap-1.5 bg-slate-50/50">
              <FileSpreadsheet className="w-5 h-5 text-[#4F6EF7]" />
              <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">Bảng chi tiết số liệu theo tháng</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100">
                <thead className="bg-slate-50">
                  <tr>
                    <th className="px-6 py-3.5 text-left text-xs font-bold uppercase tracking-wider text-slate-400">Tháng</th>
                    <th className="px-6 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-400">Thu nhập ròng</th>
                    <th className="px-6 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-400">Chi phí ròng</th>
                    <th className="px-6 py-3.5 text-right text-xs font-bold uppercase tracking-wider text-slate-400">Tích lũy thặng dư</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-slate-100 font-mono text-sm">
                  {yearlyStats.monthsData.map((row) => (
                    <tr key={row.name} className="hover:bg-slate-50/40 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-slate-900 font-sans font-bold flex items-center gap-1">
                        <span>{row.name}</span>
                        <ChevronRight className="w-3.5 h-3.5 text-slate-300" />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-[#17B978] font-bold tabular-nums">{formatCurrency(row['Thu nhập'])}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-[#F0426B] font-bold tabular-nums">{formatCurrency(row['Chi phí'])}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-right font-bold tabular-nums ${row['Tiết kiệm'] >= 0 ? 'text-slate-900' : 'text-[#F0426B]'}`}>
                        {formatCurrency(row['Tiết kiệm'])}
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
