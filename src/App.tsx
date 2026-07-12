/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { auth } from './firebase';
import { onAuthStateChanged, User, signOut } from 'firebase/auth';
import Auth from './components/Auth';
import Dashboard from './pages/Dashboard';
import History from './pages/History';
import Reports from './pages/Reports';
import Budget from './pages/Budget';
import DebtTracker from './pages/DebtTracker';
import MonthlyPlan from './pages/MonthlyPlan';
import { LayoutDashboard, Receipt, PieChart, Wallet, CreditCard, LogOut, Target } from 'lucide-react';
import { cn } from './lib/utils';
import { subscribeToSettlementConfig, subscribeToCustomCycles } from './lib/db';
import { CustomCycle } from './types';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [settlementConfig, setSettlementConfig] = useState<{ settlement_day: number; mode: 'fixed' | 'flexible' }>({ settlement_day: 1, mode: 'fixed' });
  const [customCycles, setCustomCycles] = useState<CustomCycle[]>([]);

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
      return () => {
        unsubConfig();
        unsubCycles();
      };
    }
  }, [user]);

  if (loading) {
    return <div className="flex h-screen items-center justify-center">Loading...</div>;
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

  return (
    <div className="flex h-screen bg-[#F8F9FA] flex-col md:flex-row font-sans text-[#1A1C1E]">
      {/* Sidebar/Bottom Nav */}
      <nav className="bg-white border-r border-gray-100 md:w-60 flex-shrink-0 order-2 md:order-1 border-t md:border-t-0 fixed bottom-0 w-full md:relative z-10 pb-safe">
        <div className="flex md:flex-col h-full md:h-screen md:p-6 p-2 justify-around md:justify-start">
          <div className="hidden md:flex items-center space-x-3 mb-10 px-3">
            <div className="h-8 w-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold">
              <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
            </div>
            <span className="text-xl font-bold text-gray-800 tracking-tight">Finly.</span>
          </div>
          
          <div className="flex flex-1 md:flex-col justify-around md:justify-start md:space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.id}
                  onClick={() => setActiveTab(item.id)}
                  className={cn(
                    "flex flex-col md:flex-row items-center space-y-1 md:space-y-0 md:space-x-3 px-3 py-2 rounded-md transition-colors flex-1 md:flex-none font-medium",
                    activeTab === item.id 
                      ? "text-indigo-700 bg-indigo-50" 
                      : "text-gray-500 hover:bg-gray-50"
                  )}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-[10px] md:text-sm">{item.label}</span>
                </button>
              );
            })}
          </div>

          <div className="hidden md:block mt-auto mb-4">
            <div className="p-4 bg-gray-50 rounded-xl text-left">
              <p className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-2">Lời khuyên</p>
              <p className="text-sm text-gray-600 leading-relaxed">Bạn đã tiết kiệm <span className="text-emerald-600 font-bold">12%</span> so với tháng trước.</p>
            </div>
          </div>

          <button 
            onClick={() => signOut(auth)}
            className="hidden md:flex items-center space-x-3 px-3 py-2 text-gray-500 hover:bg-gray-50 rounded-md transition-colors font-medium"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Đăng xuất</span>
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto order-1 md:order-2 pb-20 md:pb-0 relative">
        <header className="md:hidden bg-white border-b border-gray-100 px-4 py-3 flex justify-between items-center sticky top-0 z-10">
          <span className="text-lg font-bold text-gray-900 tracking-tight">Finly.</span>
          <button onClick={() => signOut(auth)} className="text-gray-500">
            <LogOut className="w-5 h-5" />
          </button>
        </header>
        <div className="p-4 md:p-8 max-w-7xl mx-auto w-full">
          {activeTab === 'dashboard' && <Dashboard user={user} />}
          {activeTab === 'history' && <History user={user} />}
          {activeTab === 'plan' && <MonthlyPlan user={user} settlementDay={settlementConfig.settlement_day} settlementConfig={settlementConfig} customCycles={customCycles} />}
          {activeTab === 'reports' && <Reports user={user} settlementDay={settlementConfig.settlement_day} settlementConfig={settlementConfig} customCycles={customCycles} />}
          {activeTab === 'budget' && <Budget user={user} settlementDay={settlementConfig.settlement_day} settlementConfig={settlementConfig} customCycles={customCycles} />}
          {activeTab === 'debts' && <DebtTracker user={user} settlementDay={settlementConfig.settlement_day} settlementConfig={settlementConfig} customCycles={customCycles} />}
        </div>
      </main>
    </div>
  );
}
