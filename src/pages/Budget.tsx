import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { subscribeToTransactions, subscribeToCategories, subscribeToBudgets, setBudget } from '../lib/db';
import { Transaction, Category, Budget as BudgetType, CustomCycle } from '../types';
import { isWithinInterval, format } from 'date-fns';
import { Settings2, HelpCircle, CheckCircle, Info, Calendar } from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput, getSettlementPeriod, getCurrentPeriod } from '../lib/utils';

export default function Budget({ 
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
  const [budgets, setBudgets] = useState<BudgetType[]>([]);
  const [targetIncome, setTargetIncome] = useState('10,000,000');
  const [showGuide, setShowGuide] = useState(true);
  
  useEffect(() => {
    const unsubTx = subscribeToTransactions(user.uid, setTransactions);
    const unsubCat = subscribeToCategories(user.uid, setCategories);
    const unsubBud = subscribeToBudgets(user.uid, setBudgets);
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

  const expenseCategories = categories.filter(c => c.type === 'expense');

  const budgetMap = budgets.reduce((acc, b) => {
    acc[b.category_id!] = b;
    return acc;
  }, {} as Record<string, BudgetType>);

  const spentMap = monthTxs.reduce((acc, t) => {
    if (t.type === 'expense') {
      acc[t.category_id] = (acc[t.category_id] || 0) + t.amount;
    }
    return acc;
  }, {} as Record<string, number>);

  const handleUpdateBudget = async (categoryId: string, percentage: number) => {
    const income = parseNumberInput(targetIncome);
    const limit = (income || 0) * (percentage / 100);
    await setBudget(user.uid, categoryId, { percentage, limit_amount: limit });
  };

  const calculateAuto = () => {
    if (expenseCategories.length === 0) return;
    const basePct = Math.floor(100 / expenseCategories.length);
    expenseCategories.forEach((cat, idx) => {
      const pct = idx === 0 ? basePct + (100 % expenseCategories.length) : basePct;
      handleUpdateBudget(cat.id!, pct);
    });
  };

  const handleTargetIncomeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const formatted = formatNumberInput(e.target.value);
    setTargetIncome(formatted);
  };

  // Recalculate limits when targetIncome changes
  const applyNewIncomeLimits = async () => {
    const income = parseNumberInput(targetIncome);
    for (const cat of expenseCategories) {
      const currentBudget = budgetMap[cat.id!];
      const pct = currentBudget?.percentage || 0;
      const limit = income * (pct / 100);
      await setBudget(user.uid, cat.id!, { percentage: pct, limit_amount: limit });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Quản lý ngân sách</h1>
          <p className="text-sm text-gray-500">Lên kế hoạch và theo dõi giới hạn chi tiêu từng danh mục.</p>
        </div>
        <div className="bg-indigo-50 border border-indigo-100 text-indigo-800 text-xs font-semibold px-4 py-2 rounded-2xl flex items-center gap-2 shadow-xs self-start sm:self-center">
          <Calendar className="w-4 h-4 text-indigo-600" />
          <span>
            {period.isCustom 
              ? `Chu kỳ lương: ${period.cycleName || ''} (${format(period.start, 'dd/MM/yyyy')} - ${format(period.end, 'dd/MM/yyyy')})`
              : `Chu kỳ: ${format(period.start, 'dd/MM/yyyy')} - ${format(period.end, 'dd/MM/yyyy')} (Quyết toán: Ngày ${settlementDay} hàng tháng)`
            }
          </span>
        </div>
      </div>

      {/* Guide Banner */}
      {showGuide && (
        <div className="bg-indigo-50 border border-indigo-100 p-5 rounded-2xl relative">
          <button 
            onClick={() => setShowGuide(false)} 
            className="absolute top-4 right-4 text-indigo-400 hover:text-indigo-600 font-bold"
          >
            ✕
          </button>
          <h4 className="font-bold text-indigo-900 mb-2 flex items-center gap-2">
            <Info className="w-5 h-5 text-indigo-600" />
            Cách thức hoạt động của phân bổ ngân sách:
          </h4>
          <ul className="space-y-1.5 text-xs sm:text-sm text-indigo-950 list-decimal pl-5">
            <li>Nhập <strong>Thu nhập ước tính</strong> của bạn cho tháng này (ví dụ: 10,000,000 VND).</li>
            <li>Đặt <strong>Phần trăm (%)</strong> ngân sách mong muốn phân bổ cho từng danh mục chi tiêu (ví dụ: Nhà cửa 30%, Di chuyển 15%).</li>
            <li>Ứng dụng tự động tính toán <strong>Số tiền giới hạn</strong> (ví dụ: 10,000,000 VND x 30% = 3,000,000 VND).</li>
            <li>Khi bạn thêm giao dịch chi tiêu, thanh tiến độ sẽ tăng dần và cảnh báo bằng màu đỏ 🔴 khi bạn chi tiêu quá giới hạn đề ra.</li>
          </ul>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 mb-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4 flex items-center">
          <Settings2 className="w-5 h-5 mr-2 text-indigo-600" />
          Phân bổ ngân sách
        </h3>
        <div className="flex flex-col sm:flex-row sm:items-end gap-4 max-w-xl">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-1">Thu nhập ước tính tháng này (VND)</label>
            <input
              type="text"
              value={targetIncome}
              onChange={handleTargetIncomeChange}
              className="block w-full rounded-lg border-0 py-2.5 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm font-mono font-semibold"
              placeholder="Ví dụ: 10,000,000"
            />
          </div>
          <div className="flex gap-2">
            <button 
              onClick={applyNewIncomeLimits}
              className="px-4 py-2.5 bg-indigo-600 text-white hover:bg-indigo-700 rounded-lg text-sm font-bold transition-all shadow-sm"
              title="Áp dụng mức thu nhập mới để cập nhật lại hạn mức tiền các danh mục"
            >
              Áp dụng
            </button>
            <button 
              onClick={calculateAuto}
              className="px-4 py-2.5 bg-gray-100 text-gray-700 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
            >
              Chia đều % tự động
            </button>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {expenseCategories.map(cat => {
          const budget = budgetMap[cat.id!];
          const limit = budget?.limit_amount || 0;
          const spent = spentMap[cat.id!] || 0;
          const percentageSpent = limit > 0 ? Math.min((spent / limit) * 100, 100) : (spent > 0 ? 100 : 0);
          const isOver = spent > limit && limit > 0;

          return (
            <div key={cat.id} className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 hover:shadow-md transition-shadow">
              <div className="flex justify-between items-center mb-4">
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${cat.color}20` }}>
                    <span className="font-semibold" style={{ color: cat.color }}>{cat.name[0]}</span>
                  </div>
                  <div>
                    <h4 className="font-semibold text-gray-900">{cat.name}</h4>
                    <p className="text-xs text-gray-500">{budget?.percentage || 0}% thu nhập</p>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  <input 
                    type="number" 
                    className="w-16 rounded-md border-0 py-1 px-2 text-sm ring-1 ring-inset ring-gray-300 font-semibold text-center"
                    placeholder="%"
                    value={budget?.percentage || ''}
                    onChange={(e) => handleUpdateBudget(cat.id!, parseFloat(e.target.value) || 0)}
                  />
                  <span className="text-sm text-gray-500">%</span>
                </div>
              </div>

              <div className="mb-2 flex justify-between text-sm">
                <span className="text-gray-500">Đã tiêu: {formatCurrency(spent)}</span>
                <span className="font-medium text-gray-900">Giới hạn: {formatCurrency(limit)}</span>
              </div>
              
              <div className="w-full bg-gray-100 rounded-full h-2.5 overflow-hidden">
                <div 
                  className={`h-2.5 rounded-full transition-all duration-300 ${isOver ? 'bg-rose-500' : 'bg-emerald-500'}`} 
                  style={{ width: `${percentageSpent}%` }}
                ></div>
              </div>
              {isOver && (
                <p className="text-xs text-rose-500 mt-2 font-semibold flex items-center gap-1">
                  <span>⚠️ Vượt ngân sách {formatCurrency(spent - limit)}</span>
                </p>
              )}
            </div>
          );
        })}
        {expenseCategories.length === 0 && (
          <div className="col-span-2 text-center text-gray-500 py-10 bg-white rounded-2xl border border-gray-100">
            Hãy tạo một danh mục chi phí ở Tổng quan để bắt đầu lập ngân sách.
          </div>
        )}
      </div>
    </div>
  );
}
