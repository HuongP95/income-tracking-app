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
import PlanAndBudget from './pages/PlanAndBudget';
import SavingsAndDebts from './pages/SavingsAndDebts';
import Reports from './pages/Reports';
import { LayoutDashboard, Receipt, PiggyBank, PieChart, Target, LogOut, Sparkles, AlertCircle, TrendingUp, Compass } from 'lucide-react';
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
  const [settlementConfig, setSettlementConfig] = useState<{ settlement_day: number; mode: 'fixed' | 'flexible'; estimated_income?: number }>({ settlement_day: 1, mode: 'fixed' });
  const [customCycles, setCustomCycles] = useState<CustomCycle[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [budgets, setBudgets] = useState<BudgetType[]>([]);

  // Gracefully handle legacy activeTab state in localStorage
  const currentTab = (activeTab === 'plan' || activeTab === 'budget')
    ? 'plan_budget'
    : (activeTab === 'savings' || activeTab === 'debts')
      ? 'savings_debts'
      : activeTab;

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (u) => {
      setUser(u);
      setLoading(false);
    });
    // Fallback safety timer in case auth state takes long to settle
    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 3000);

    return () => {
      unsubscribe();
      clearTimeout(safetyTimer);
    };
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
      <div className="flex h-screen w-screen flex-col items-center justify-center bg-[#FFFDF9] text-slate-800">
        <div className="relative flex flex-col items-center gap-4">
          <div className="relative">
            {/* Soft shadow that expands and contracts as coin floats */}
            <motion.div 
              animate={{ scale: [0.8, 1.2, 0.8] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-amber-200/50 blur-[1px] rounded-full"
            />
            <motion.div
              animate={{ y: [0, -15, 0], rotate: [0, 10, -10, 0] }}
              transition={{ duration: 1.5, repeat: Infinity, ease: "easeInOut" }}
              className="w-16 h-16 bg-gradient-to-b from-[#FFE45E] to-[#FFC300] rounded-full flex items-center justify-center shadow-md shadow-amber-300/40 border-4 border-white select-none"
            >
              <div className="flex flex-col items-center justify-center w-full h-full relative">
                <span className="text-[10px] font-black text-amber-800 leading-none mb-0.5">$</span>
                <div className="flex space-x-1.5 mb-0.5">
                  <div className="w-1.5 h-1.5 bg-slate-900 rounded-full" />
                  <div className="w-1.5 h-1.5 bg-slate-900 rounded-full" />
                </div>
                <div className="w-2 h-1 border-b-2 border-slate-900 rounded-b-full" />
              </div>
            </motion.div>
          </div>
          <span className="text-sm font-black tracking-wider text-amber-800 animate-pulse">FINLY PREMIUM • Chờ bé xíu nha... ✨</span>
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
    { id: 'plan_budget', label: 'Kế hoạch & Ngân sách', icon: Target },
    { id: 'savings_debts', label: 'Tiết kiệm & Nợ', icon: PiggyBank },
    { id: 'reports', label: 'Báo cáo', icon: PieChart },
  ];

  const AdviceIcon = advice.icon;

  return (
    <div className="flex h-screen bg-[#FFFDF9] flex-col md:flex-row font-sans text-slate-800 overflow-hidden">
      {/* Sidebar Navigation */}
      <nav className="bg-[#FFFDF9] md:w-64 flex-shrink-0 order-2 md:order-1 border-t md:border-t-0 border-amber-100 md:border-r fixed bottom-0 w-full md:relative z-20 pb-safe shadow-lg shadow-amber-100/30 md:flex md:flex-col h-16 md:h-screen">
        <div className="flex md:flex-col h-full md:p-6 p-1.5 justify-around md:justify-start">
          
          {/* Logo */}
          <div className="hidden md:flex items-center space-x-3 mb-10 px-3 py-1">
            <div className="h-10 w-10 rounded-full bg-gradient-to-b from-[#FFE45E] to-[#FFC300] flex items-center justify-center text-amber-950 shadow-md border-2 border-white select-none relative shrink-0">
              <span className="absolute -top-1 -right-1 text-xs">✨</span>
              <div className="flex flex-col items-center justify-center scale-[0.8]">
                <div className="flex space-x-1.5 mb-0.5">
                  <div className="w-1 h-1 bg-slate-900 rounded-full" />
                  <div className="w-1 h-1 bg-slate-900 rounded-full" />
                </div>
                <div className="w-2 h-1 border-b-2 border-slate-900 rounded-b-full" />
              </div>
            </div>
            <div className="flex flex-col">
              <span className="text-lg font-black text-amber-950 tracking-tight leading-none flex items-center gap-1">
                Finly <span className="text-sm">🐾</span>
              </span>
              <span className="text-[10px] text-amber-600 font-bold tracking-widest mt-0.5">KUTE EDITION</span>
            </div>
          </div>
          
          {/* Nav Links */}
          <div className="flex flex-1 md:flex-col justify-around md:justify-start md:space-y-1.5 w-full">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = currentTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "relative flex flex-col md:flex-row items-center md:space-x-3 px-1 sm:px-3.5 py-1.5 md:py-3 rounded-2xl transition-all flex-1 md:flex-none font-bold text-xs md:text-sm cursor-pointer",
                    isActive 
                      ? "text-amber-950 bg-amber-100/80 border border-amber-200/50 shadow-sm" 
                      : "text-amber-800/70 hover:text-amber-950 hover:bg-amber-50/50"
                  )}
                >
                  {/* Active Indicator Line for Desktop */}
                  {isActive && (
                    <span className="hidden md:block absolute left-0 top-1/4 bottom-1/4 w-1 rounded-r-full bg-[#FFC300]" />
                  )}
                  <Icon className={cn("w-[21px] h-[21px] stroke-[2.25px]", isActive ? "text-[#FFB700]" : "text-amber-700/50")} />
                  <span className="text-[10px] md:text-sm mt-1 md:mt-0 tracking-tight">{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Advice Section */}
          <div className="hidden md:block mt-auto mb-6 px-1">
            <div className="p-4 bg-[#FFFBF0] rounded-2xl border-2 border-[#FFF2D8] relative overflow-hidden group">
              <div className="flex items-center gap-2 mb-2">
                <div className={cn("p-1.5 rounded-xl flex items-center justify-center shadow-sm bg-white")}>
                  <span>💬</span>
                </div>
                <span className="text-[11px] font-bold text-amber-800/80 uppercase tracking-widest">Bé Coin khuyên...</span>
              </div>
              <p className="text-xs text-amber-950 leading-relaxed font-bold">
                {advice.text}
              </p>
            </div>
          </div>

          {/* User Email & Logout Section */}
          <div className="hidden md:flex flex-col gap-2 pt-2 border-t border-amber-100">
            {user.email && (
              <div className="px-3 py-2 bg-amber-50/80 rounded-xl border border-amber-200/60 flex items-center gap-2">
                <div className="w-6 h-6 rounded-full bg-amber-300 flex items-center justify-center text-[10px] font-black text-amber-950 shrink-0">
                  {user.email.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-[10px] font-bold text-amber-700/80 uppercase tracking-widest leading-none">Tài khoản</p>
                  <p className="text-xs font-bold text-amber-950 truncate mt-0.5" title={user.email}>{user.email}</p>
                </div>
              </div>
            )}
            <button 
              onClick={() => signOut(auth)}
              className="flex items-center space-x-3 px-3 py-2.5 text-amber-700 hover:text-rose-600 hover:bg-rose-50 rounded-2xl transition-all font-bold text-sm cursor-pointer"
            >
              <LogOut className="w-5 h-5 text-amber-500/60 group-hover:text-rose-500" />
              <span className="tracking-tight">Đăng xuất</span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto order-1 md:order-2 pb-20 md:pb-0 relative flex flex-col h-full bg-gradient-to-b from-[#FFFDF9] via-[#FFF9F2] to-[#FFF3E3]">
        {/* Mobile Header */}
        <header className="md:hidden bg-[#FFFDF9] border-b border-amber-100 px-5 py-3.5 flex justify-between items-center sticky top-0 z-20 shadow-sm">
          <div className="flex items-center space-x-2">
            <div className="h-8 w-8 rounded-full bg-gradient-to-b from-[#FFE45E] to-[#FFC300] flex items-center justify-center text-amber-950 shadow border border-white">
              <span className="text-xs font-black">$</span>
            </div>
            <span className="text-base font-black text-amber-950 tracking-tight flex items-center gap-1">Finly <span className="text-xs">🐾</span></span>
          </div>
          <button onClick={() => signOut(auth)} className="text-amber-700/70 hover:text-rose-600 p-1 rounded-lg">
            <LogOut className="w-5.5 h-5.5" />
          </button>
        </header>

        {/* Content Wrapper */}
        <div className="flex-1 p-4 md:p-8 max-w-7xl mx-auto w-full relative overflow-x-hidden">
          <AnimatePresence mode="wait">
            <motion.div
              key={currentTab}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.18, ease: 'easeOut' }}
              className="h-full w-full"
            >
              {currentTab === 'dashboard' && (
                <Dashboard 
                  user={user} 
                  settlementConfigProp={settlementConfig}
                  customCyclesProp={customCycles}
                  transactionsProp={transactions}
                  budgetsProp={budgets}
                />
              )}
              {currentTab === 'history' && <History user={user} />}
              {currentTab === 'plan_budget' && <PlanAndBudget user={user} settlementDay={settlementConfig.settlement_day} settlementConfig={settlementConfig} customCycles={customCycles} />}
              {currentTab === 'savings_debts' && <SavingsAndDebts user={user} />}
              {currentTab === 'reports' && <Reports user={user} settlementDay={settlementConfig.settlement_day} settlementConfig={settlementConfig} customCycles={customCycles} />}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  );
}

