import { useState, useEffect, useMemo, useCallback } from 'react';
import { User } from 'firebase/auth';
import { subscribeToTransactions, subscribeToCategories } from '../lib/db';
import { Transaction, Category, CustomCycle } from '../types';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, Legend } from 'recharts';
import { format, isWithinInterval } from 'date-fns';
import { formatCurrency, getSettlementPeriod, getCurrentPeriod } from '../lib/utils';
import { Calendar } from 'lucide-react';

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

  useEffect(() => {
    const unsubTx = subscribeToTransactions(user.uid, setTransactions);
    const unsubCat = subscribeToCategories(user.uid, setCategories);
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
      color: catMap[catId]?.color || '#999'
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

  const barData = [
    { name: 'Thu nhập vs Chi phí', Thu: stats.income, Chi: stats.expense }
  ];

  const yearOptions = useMemo(() => {
    const currentYearVal = new Date().getFullYear();
    return Array.from({ length: 5 }, (_, i) => currentYearVal - 2 + i);
  }, []);

  return (
    <div className="space-y-6">
      {/* Tab Selector */}
      <div className="flex border-b border-gray-200">
        <button
          onClick={() => setReportType('month')}
          className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-all ${
            reportType === 'month'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Báo cáo tháng
        </button>
        <button
          onClick={() => setReportType('year')}
          className={`py-2.5 px-4 text-sm font-semibold border-b-2 transition-all ${
            reportType === 'year'
              ? 'border-indigo-600 text-indigo-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          Báo cáo năm
        </button>
      </div>

      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">
            {reportType === 'month' ? 'Báo cáo tháng' : 'Báo cáo năm'}
          </h1>
          <p className="text-sm text-gray-500">Phân tích và chi tiết thu chi.</p>
          {reportType === 'month' && (
            <div className="mt-1 flex items-center gap-1.5 text-xs text-indigo-600 font-semibold">
              <Calendar className="w-3.5 h-3.5" />
              <span>
                {period.isCustom 
                  ? `Chu kỳ lương: ${period.cycleName || ''} (${format(period.start, 'dd/MM/yyyy')} - ${format(period.end, 'dd/MM/yyyy')})`
                  : `Chu kỳ: ${format(period.start, 'dd/MM/yyyy')} - ${format(period.end, 'dd/MM/yyyy')} (Quyết toán: Ngày ${settlementDay} hàng tháng)`
                }
              </span>
            </div>
          )}
        </div>
        <div className="flex items-center space-x-4">
          {reportType === 'month' ? (
            <input 
              type="month"
              value={format(currentMonth, 'yyyy-MM')}
              onChange={(e) => setCurrentMonth(new Date(e.target.value + '-01T00:00:00'))}
              className="block rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm font-semibold"
            />
          ) : (
            <select
              value={currentYear}
              onChange={(e) => setCurrentYear(Number(e.target.value))}
              className="block rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm font-semibold"
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
              <p className="text-sm font-medium text-gray-500 mb-1">Tổng thu nhập</p>
              <p className="text-3xl font-bold text-emerald-600">{formatCurrency(stats.income)}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
              <p className="text-sm font-medium text-gray-500 mb-1">Tổng chi phí</p>
              <p className="text-3xl font-bold text-rose-600">{formatCurrency(stats.expense)}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
              <p className="text-sm font-medium text-gray-500 mb-1">Tiết kiệm ròng</p>
              <p className={`text-3xl font-bold ${stats.net >= 0 ? 'text-gray-900' : 'text-rose-600'}`}>
                {formatCurrency(stats.net)}
              </p>
            </div>
          </div>

          {(stats.debtPayments > 0 || stats.loanRecoveries > 0) && (
            <div className="bg-indigo-50 border border-indigo-100 p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center sm:justify-between text-xs text-indigo-950 mt-4 gap-2 shadow-xs">
              <div>
                <span className="font-bold">💡 Giải trình điều chỉnh công nợ:</span>
                <span className="ml-1">
                  Thu nhập khả dụng được điều chỉnh do có các giao dịch nợ:
                  Đã trả nợ <strong className="text-rose-700">-{formatCurrency(stats.debtPayments)}</strong> và Thu hồi nợ <strong className="text-emerald-700">+{formatCurrency(stats.loanRecoveries)}</strong>.
                </span>
              </div>
              <div className="font-bold bg-indigo-100 px-2.5 py-1.5 rounded text-indigo-900 self-start sm:self-auto shrink-0 font-mono text-[11px]">
                Lượng nợ ròng: {formatCurrency(stats.loanRecoveries - stats.debtPayments)}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Phân bổ chi phí</h3>
              {pieData.length > 0 ? (
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={pieData}
                        cx="50%"
                        cy="50%"
                        innerRadius={60}
                        outerRadius={80}
                        paddingAngle={5}
                        dataKey="value"
                      >
                        {pieData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value: number) => formatCurrency(value)} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <div className="h-64 flex items-center justify-center text-gray-400">Không có chi phí tháng này</div>
              )}
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900 mb-6">Thu nhập vs Chi phí</h3>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => formatCurrency(val)} />
                    <Tooltip cursor={{ fill: 'transparent' }} formatter={(value: number) => formatCurrency(value)} />
                    <Legend />
                    <Bar dataKey="Thu" name="Thu nhập" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={60} />
                    <Bar dataKey="Chi" name="Chi phí" fill="#e11d48" radius={[4, 4, 0, 0]} maxBarSize={60} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
              <p className="text-sm font-medium text-gray-500 mb-1">Tổng thu nhập cả năm</p>
              <p className="text-3xl font-bold text-emerald-600">{formatCurrency(yearlyStats.totalIncome)}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
              <p className="text-sm font-medium text-gray-500 mb-1">Tổng chi phí cả năm</p>
              <p className="text-3xl font-bold text-rose-600">{formatCurrency(yearlyStats.totalExpense)}</p>
            </div>
            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 flex flex-col justify-center">
              <p className="text-sm font-medium text-gray-500 mb-1">Tổng tiết kiệm cả năm</p>
              <p className={`text-3xl font-bold ${yearlyStats.totalNet >= 0 ? 'text-gray-900' : 'text-rose-600'}`}>
                {formatCurrency(yearlyStats.totalNet)}
              </p>
            </div>
          </div>

          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mt-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-6">Biến động thu chi các tháng trong năm {currentYear}</h3>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={yearlyStats.monthsData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f0f0f0" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} />
                  <YAxis axisLine={false} tickLine={false} tickFormatter={(val) => formatCurrency(val)} />
                  <Tooltip cursor={{ fill: 'transparent' }} formatter={(value: number) => formatCurrency(value)} />
                  <Legend />
                  <Bar dataKey="Thu nhập" fill="#10b981" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Chi phí" fill="#e11d48" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden mt-6">
            <div className="px-6 py-4 border-b border-gray-100">
              <h3 className="text-lg font-semibold text-gray-900">Chi tiết theo tháng</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-500">Tháng</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Thu nhập</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Chi phí</th>
                    <th className="px-6 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-500">Tiết kiệm ròng</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200 font-mono text-sm">
                  {yearlyStats.monthsData.map((row) => (
                    <tr key={row.name} className="hover:bg-gray-50 transition-colors">
                      <td className="px-6 py-4 whitespace-nowrap text-gray-900 font-sans font-medium">{row.name}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-emerald-600 font-bold">{formatCurrency(row['Thu nhập'])}</td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-rose-600 font-bold">{formatCurrency(row['Chi phí'])}</td>
                      <td className={`px-6 py-4 whitespace-nowrap text-right font-bold ${row['Tiết kiệm'] >= 0 ? 'text-gray-900' : 'text-rose-600'}`}>
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
