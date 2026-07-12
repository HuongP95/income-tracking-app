/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState, useMemo } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import Auth from './components/Auth';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Reports from './pages/Reports';
import Budget from './pages/Budget';
import DebtTracker from './pages/DebtTracker';
import MonthlyPlan from './pages/MonthlyPlan';
import { LayoutDashboard, Receipt, PieChart, Wallet, CreditCard, LogOut, Target, Sparkles, AlertCircle, TrendingUp, Compass } from 'lucide-react';
import { cn } from './lib/utils';
import { subscribeToSettlementConfig, subscribeToCustomCycles, subscribeToTransactions, subscribeToBudgets } from './lib/db';
import { CustomCycle, Transaction, Budget as BudgetType } from './types';
import { motion, AnimatePresence } from 'motion/react';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState(() => {
    return localStorage.getItem('finly_active_tab') || 'dashboard';
  });
  const [settlementConfig, setSettlementConfig] = useState<{ settlement_day: number; mode: 'fixed' | 'flexible' }>({ settlement_day: 1, mode: 'fixed' });
  const [customCycles, setCustomCycles] = useState<CustomCycle[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetType[]>([]);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (user) {
      const unsubConfig = subscribeToSettlementConfig(user.uid, setSettlementConfig);
      const unsubCycles = subscribeToCustomCycles(user.uid, setCustomCycles);
      const unsubTxs = subscribeToTransactions(user.uid, setTransactions);
      const unsubBudgets = subscribeToBudgets(user.uid, setBudgets);
      return () => {
        unsubConfig();
        unsubCycles();
        unsubTxs();
        unsubBudgets();
      };
    }
  }, [user]);

  useEffect(() => {
    localStorage.setItem('finly_active_tab', activeTab);
  }, [activeTab]);

  useEffect(() => {
    const handleTabChange = (e: Event) => {
      const customEvent = e as CustomEvent<{ tab: string }>;
      if (customEvent.detail?.tab) {
        setActiveTab(customEvent.detail.tab);
      }
    };
    window.addEventListener('finly_change_tab', handleTabChange);
    return () => window.removeEventListener('finly_change_tab', handleTabChange);
  }, []);

  // Dynamic Personal Advice Engine
  const advice = useMemo(() => {
    if (transactions.length === 0) {
      return {
        text: "Thêm giao dịch đầu tiên của bạn để kích hoạt hệ thống phân tích tài chính thông minh Finly!",
        icon: Compass,
        color: "text-sky-400 bg-sky-500/10"
      };
    }

    const expenseTxs = transactions.filter(t => t.type === 'expense');
    const categoryTotals: Record<string, number> = {};
    expenseTxs.forEach(t => {
      categoryTotals[t.category_id] = (categoryTotals[t.category_id] || 0) + t.amount;
    });

    let exceededCount = 0;
    budgets.forEach(b => {
      const spent = categoryTotals[b.category_id || ''] || 0;
      if (b.limit_amount && spent > b.limit_amount) {
        exceededCount++;
      }
    });

    if (exceededCount > 0) {
      return {
        text: `Cảnh báo: Bạn đã chi tiêu vượt hạn mức ở ${exceededCount} danh mục ngân sách!`,
        icon: AlertCircle,
        color: "text-[#F0426B] bg-[#F0426B]/10 animate-pulse"
      };
    }

    const totalIncome = transactions.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
    const totalExpense = expenseTxs.reduce((sum, t) => sum + t.amount, 0);

    if (totalIncome > 0) {
      const savingsRate = ((totalIncome - totalExpense) / totalIncome) * 100;
      if (savingsRate > 20) {
        return {
          text: `Xuất sắc! Tỷ lệ tiết kiệm của bạn đạt ${savingsRate.toFixed(0)}%. Hãy duy trì phong độ tài chính này nhé!`,
          icon: Sparkles,
          color: "text-[#17B978] bg-[#17B978]/10"
        };
      } else if (savingsRate > 0) {
        return {
          text: `Tỷ lệ tiết kiệm hiện tại là ${savingsRate.toFixed(0)}%. Bạn có thể tối ưu thêm để tích lũy nhanh hơn.`,
          icon: TrendingUp,
          color: "text-amber-400 bg-amber-400/10"
        };
      } else {
        return {
          text: `Cảnh báo: Chi tiêu đang vượt thu nhập. Vui lòng rà soát danh sách chi tiêu để cân đối dòng tiền.`,
          icon: AlertCircle,
          color: "text-[#F0426B] bg-[#F0426B]/10"
        };
      }
    }

    return {
      text: "Thiết lập ngân sách hàng tháng giúp bạn kiểm soát dòng tiền hiệu quả và tránh nợ nần phát sinh.",
      icon: Compass,
      color: "text-indigo-400 bg-indigo-500/10"
    };
  }, [transactions, budgets]);

  if (loading) {
    return (
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#0B0F19] text-white">
        <div className="relative flex flex-col items-center gap-4">
          <div className="h-12 w-12 rounded-2xl bg-[#4F6EF7] flex items-center justify-center shadow-lg shadow-[#4F6EF7]/20 animate-bounce">
            <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <span className="text-lg font-bold tracking-wider text-slate-300 animate-pulse">FINLY PREMIUM</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  const navItems = [
    { id: 'dashboard', label: 'Tổng quan', icon: LayoutDashboard },
    { id: 'history', label: 'Lịch sử', icon: Receipt },
    { id: 'plan', label: 'Kế hoạch', icon: Target },
    { id: 'reports', label: 'Báo cáo', icon: PieChart },
    { id: 'budget', label: 'Ngân sách', icon: Wallet },
    { id: 'debts', label: 'Nợ & Chia tiền', icon: CreditCard },
  ];

  const AdviceIcon = advice.icon;

  return (
    <div className="flex h-screen bg-[#F7F8FA] flex-col md:flex-row font-sans text-slate-800 overflow-hidden">
      {/* Sidebar Navigation */}
      <nav className="bg-white md:w-64 flex-shrink-0 order-2 md:order-1 border-t md:border-t-0 border-slate-200/80 md:border-r fixed bottom-0 w-full md:relative z-20 pb-safe shadow-lg shadow-slate-100/40 md:flex md:flex-col h-16 md:h-screen">
        <div className="flex md:flex-col h-full md:p-6 p-1.5 justify-around md:justify-start">
          
          {/* Logo */}
          <div className="hidden md:flex items-center space-x-3 mb-10 px-3 py-1">
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-[#4F6EF7] to-indigo-400 flex items-center justify-center text-white shadow-md shadow-[#4F6EF7]/20">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-bold text-slate-900 tracking-tight leading-none">Finly</span>
              <span className="text-[10px] text-[#4F6EF7] font-semibold tracking-widest mt-0.5">PREMIUM</span>
            </div>
          </div>
          
          {/* Nav Links */}
          <div className="flex flex-1 md:flex-col justify-around md:justify-start md:space-y-1.5 w-full">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "relative flex flex-col md:flex-row items-center md:space-x-3 px-1 sm:px-3.5 py-1.5 md:py-3 rounded-xl transition-all flex-1 md:flex-none font-semibold text-xs md:text-sm cursor-pointer",
                    isActive 
                      ? "text-[#4F6EF7] bg-indigo-50/70 md:bg-indigo-50/50" 
                      : "text-slate-500 hover:text-slate-900 hover:bg-slate-50/80"
                  )}
                >
                  {/* Active Indicator Line for Desktop */}
                  {isActive && (
                    <span className="hidden md:block absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r bg-[#4F6EF7]" />
                  )}
                  <Icon className={cn("w-[21px] h-[21px] stroke-[1.75px]", isActive ? "text-[#4F6EF7]" : "text-slate-400")} />
                  <span className="text-[10px] md:text-sm mt-1 md:mt-0 tracking-tight">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Advice Section */}
          <div className="hidden md:block mt-auto mb-6 px-1">
            <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 relative overflow-hidden group">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-1.5 rounded-lg flex items-center justify-center", advice.color)}>
                  <AdviceIcon className="w-4 h-4" />
                </div>
                <span className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Lời khuyên</span>
              </div>
              <p className="text-xs text-slate-600 leading-relaxed font-semibold">
                {advice.text}
              </p>
            </div>
          </div>

          {/* Logout Button */}
          <button 
            onClick={() => signOut(auth)}
            className="hidden md:flex items-center space-x-3 px-4 py-3 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-xl transition-colors font-semibold text-sm cursor-pointer"
          >
            <LogOut className="w-5 h-5 text-slate-400 group-hover:text-red-500" />
            <span className="tracking-tight">Đăng xuất</span>
          </button>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto order-1 md:order-2 pb-20 md:pb-0 relative flex flex-col h-full">
        {/* Mobile Header */}
        <header className="md:hidden bg-white border-b border-slate-200/80 px-5 py-3.5 flex justify-between items-center sticky top-0 z-20 shadow-sm">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-lg bg-gradient-to-tr from-[#4F6EF7] to-indigo-400 flex items-center justify-center text-white">
              <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
              </svg>
            </div>
            <span className="text-base font-bold text-slate-900 tracking-tight">Finly</span>
          </div>
          <button onClick={() => signOut(auth)} className="text-slate-500 hover:text-red-600 p-1 rounded-lg">
            <LogOut className="w-5 h-5" />
          </button>
        </header>

        {/* Content Wrapper */}
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full relative overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="h-full w-full"
            >
              {activeTab === 'dashboard' && <Dashboard user={user} />}
              {activeTab === 'history' && <History user={user} />}
              {activeTab === 'plan' && <MonthlyPlan user={user} settlementDay={settlementConfig.settlement_day} settlementConfig={settlementConfig} customCycles={customCycles} />}
              {activeTab === 'reports' && <Reports user={user} settlementDay={settlementConfig.settlement_day} settlementConfig={settlementConfig} customCycles={customCycles} />}
              {activeTab === 'budget' && <Budget user={user} settlementDay={settlementConfig.settlement_day} settlementConfig={settlementConfig} customCycles={customCycles} />}
              {activeTab === 'debts' && <DebtTracker user={user} settlementDay={settlementConfig.settlement_day} settlementConfig={settlementConfig} customCycles={customCycles} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

