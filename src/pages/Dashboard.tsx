import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { subscribeToCategories, addCategory, addTransaction, subscribeToDebts, subscribeToTransactions } from '../lib/db';
import { Category, TransactionType, DebtInstallment, Transaction } from '../types';
import { PlusCircle, ShoppingCart, Home, Car, DollarSign, Plus, CheckCircle, Wallet, ArrowUpRight, ArrowDownLeft, Info } from 'lucide-react';
import { format } from 'date-fns';
import { formatNumberInput, parseNumberInput, formatCurrency } from '../lib/utils';

const ICONS: Record<string, any> = {
  ShoppingCart,
  Home,
  Car,
  DollarSign
};

export default function Dashboard({ user }: { user: User }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [debts, setDebts] = useState<DebtInstallment[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<TransactionType>('expense');
  const [newCatIcon, setNewCatIcon] = useState('ShoppingCart');
  const [newCatColor, setNewCatColor] = useState('#ef4444');

  useEffect(() => {
    const unsubC = subscribeToCategories(user.uid, setCategories);
    const unsubD = subscribeToDebts(user.uid, setDebts);
    const unsubT = subscribeToTransactions(user.uid, setTransactions);
    return () => {
      unsubC();
      unsubD();
      unsubT();
    };
  }, [user.uid]);

  // Calculate total transactions and cash balance (all time)
  const cashStats = useMemo(() => {
    let income = 0;
    let expense = 0;
    transactions.forEach(t => {
      if (t.is_split_pending) return;
      if (t.type === 'income') income += t.amount;
      else expense += t.amount;
    });
    return { income, expense, balance: income - expense };
  }, [transactions]);

  // Calculate outstanding loans and debts
  const debtStats = useMemo(() => {
    let outstandingLoans = 0;
    let outstandingDebts = 0;

    debts.forEach(d => {
      const debtTxs = transactions.filter(t => t.debt_id === d.id);
      const computedPaid = debtTxs.reduce((sum, t) => sum + t.amount, 0);
      const remaining = d.total_amount - computedPaid;
      if (d.type === 'loan') {
        outstandingLoans += Math.max(0, remaining);
      } else {
        outstandingDebts += Math.max(0, remaining);
      }
    });

    const adjustedBalance = cashStats.balance - outstandingLoans - outstandingDebts;

    return {
      outstandingLoans,
      outstandingDebts,
      adjustedBalance
    };
  }, [debts, transactions, cashStats]);

  const filteredCategories = categories.filter(c => c.type === type);

  // Sync categoryId when type or categories change
  useEffect(() => {
    if (filteredCategories.length > 0) {
      const exists = filteredCategories.some(c => c.id === categoryId);
      if (!exists) {
        setCategoryId(filteredCategories[0].id!);
      }
    } else {
      setCategoryId('');
    }
  }, [type, categories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const parsedAmount = parseNumberInput(amount);
    if (!parsedAmount || !categoryId) return;
    
    await addTransaction(user.uid, {
      amount: parsedAmount,
      type,
      category_id: categoryId,
      date: new Date(date).getTime(),
      note
    });

    setAmount('');
    setNote('');
    setShowSuccess(true);
    setTimeout(() => {
      setShowSuccess(false);
    }, 4000);
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return;
    await addCategory(user.uid, {
      name: newCatName,
      type: newCatType,
      icon: newCatIcon,
      color: newCatColor
    });
    setShowCategoryModal(false);
    setNewCatName('');
  };

  const handleAmountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setAmount(formatNumberInput(e.target.value));
  };

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight text-gray-900">Tổng quan</h1>
        <p className="text-sm text-gray-500">Ghi chép nhanh các giao dịch và theo dõi số dư của bạn.</p>
      </div>

      {/* SECTION: WALLET & CO-DEBT OVERVIEW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 max-w-xl">
        <div className="bg-gradient-to-br from-indigo-600 to-indigo-850 text-white p-4 rounded-2xl shadow-md relative overflow-hidden flex flex-col justify-between min-h-[110px]">
          <div className="absolute right-0 bottom-0 opacity-10 transform translate-x-2 translate-y-2">
            <Wallet className="w-20 h-20" />
          </div>
          <div>
            <div className="flex justify-between items-start mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-100">Số dư ví khả dụng</span>
              <Wallet className="w-4 h-4 text-indigo-200" />
            </div>
            <p className="text-lg font-bold font-mono tracking-tight">{formatCurrency(debtStats.adjustedBalance)}</p>
          </div>
          <p className="text-[9px] text-indigo-200 mt-1 flex items-center gap-1 leading-tight">
            <Info className="w-2.5 h-2.5 shrink-0" />
            <span>Đã chốt công nợ thực tế.</span>
          </p>
        </div>

        <div className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm flex flex-col justify-between min-h-[110px]">
          <div>
            <div className="flex justify-between items-start mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Cho vay chưa thu</span>
              <ArrowUpRight className="w-4 h-4 text-emerald-500" />
            </div>
            <p className="text-lg font-bold font-mono tracking-tight text-emerald-600">{formatCurrency(debtStats.outstandingLoans)}</p>
          </div>
          <p className="text-[9px] text-gray-400 mt-1 leading-tight">
            Cộng lại khi đòi được nợ.
          </p>
        </div>

        <div className="bg-white border border-gray-100 p-4 rounded-2xl shadow-sm flex flex-col justify-between min-h-[110px]">
          <div>
            <div className="flex justify-between items-start mb-1">
              <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Nợ còn lại</span>
              <ArrowDownLeft className="w-4 h-4 text-rose-500" />
            </div>
            <p className="text-lg font-bold font-mono tracking-tight text-rose-600">{formatCurrency(debtStats.outstandingDebts)}</p>
          </div>
          <p className="text-[9px] text-gray-400 mt-1 leading-tight">
            Hoàn lại khi trả hết nợ.
          </p>
        </div>
      </div>

      {showSuccess && (
        <div className="max-w-xl p-4 mb-4 rounded-xl bg-emerald-50 text-emerald-800 border border-emerald-200 text-sm font-medium flex items-center justify-between shadow-sm animate-pulse">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-5 h-5 text-emerald-500 shrink-0" />
            <span>Đã ghi nhận giao dịch thành công! Dữ liệu đã được thêm vào lịch sử.</span>
          </div>
          <button onClick={() => setShowSuccess(false)} className="text-emerald-400 hover:text-emerald-600 font-bold ml-2">✕</button>
        </div>
      )}

      <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 max-w-xl">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex bg-gray-100 p-1 rounded-lg">
            <button
              type="button"
              onClick={() => setType('expense')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === 'expense' ? 'bg-white shadow text-rose-600 font-semibold' : 'text-gray-600'}`}
            >
              Chi phí
            </button>
            <button
              type="button"
              onClick={() => setType('income')}
              className={`flex-1 py-2 text-sm font-medium rounded-md transition-colors ${type === 'income' ? 'bg-white shadow text-emerald-600 font-semibold' : 'text-gray-600'}`}
            >
              Thu nhập
            </button>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Số tiền (VND)</label>
            <div className="relative">
              <input
                type="text"
                required
                value={amount}
                onChange={handleAmountChange}
                className="block w-full rounded-lg border-0 py-2.5 px-3.5 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-lg sm:leading-6 font-mono"
                placeholder="Ví dụ: 50,000"
              />
            </div>
          </div>

          <div className="flex gap-4">
            <div className="flex-1">
              <div className="flex justify-between items-center mb-1">
                <label className="block text-sm font-medium text-gray-700">Danh mục</label>
                <button 
                  type="button" 
                  onClick={() => {
                    setNewCatType(type);
                    setShowCategoryModal(true);
                  }} 
                  className="text-xs text-indigo-600 hover:text-indigo-700 flex items-center"
                >
                  <Plus className="w-3 h-3 mr-1" /> Thêm
                </button>
              </div>
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                required
                className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              >
                <option value="" disabled>Chọn danh mục</option>
                {filteredCategories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>
            <div className="flex-1">
              <label className="block text-sm font-medium text-gray-700 mb-1">Ngày</label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Ghi chú (Tùy chọn)</label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
              placeholder="Bạn đã chi/thu khoản này cho việc gì?"
            />
          </div>

          <button
            type="submit"
            className="w-full rounded-full bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
          >
            Lưu giao dịch
          </button>
        </form>
      </div>

      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Danh mục mới</h3>
            <form onSubmit={handleAddCategory} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Loại</label>
                <select 
                  value={newCatType}
                  onChange={(e) => setNewCatType(e.target.value as TransactionType)}
                  className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                >
                  <option value="expense">Chi phí</option>
                  <option value="income">Thu nhập</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Tên danh mục</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Biểu tượng</label>
                <select 
                  value={newCatIcon}
                  onChange={(e) => setNewCatIcon(e.target.value)}
                  className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                >
                  <option value="ShoppingCart">Giỏ hàng</option>
                  <option value="Home">Nhà cửa</option>
                  <option value="Car">Xe cộ</option>
                  <option value="DollarSign">Tiền bạc</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Màu sắc</label>
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => setNewCatColor(e.target.value)}
                  className="block h-10 w-full rounded-lg border-0 p-1 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
                />
              </div>
              <div className="flex justify-end space-x-3 mt-6">
                <button type="button" onClick={() => setShowCategoryModal(false)} className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-full border border-gray-200">Hủy</button>
                <button type="submit" className="px-4 py-2 text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-sm">Lưu</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
