import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { 
  subscribeToTransactions, 
  subscribeToCategories, 
  deleteTransaction, 
  updateTransaction, 
  addTransaction,
  addCategory 
} from '../lib/db';
import { Transaction, Category, TransactionType } from '../types';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { Trash2, Edit2, Search, Filter, Calendar, Tag, X, Plus, Loader2, PlusCircle, Layers, ChevronDown, ChevronUp } from 'lucide-react';
import * as Icons from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput } from '../lib/utils';
import { useFeedback } from '../context/FeedbackContext';
import { ListSkeleton } from '../components/Skeleton';

export default function History({ user }: { user: User }) {
  const { showToast, confirm } = useFeedback();
  
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);

  // Search state
  const [searchTerm, setSearchTerm] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');

  // Filters state
  const [selectedType, setSelectedType] = useState<'all' | 'income' | 'expense'>('all');
  const [selectedCategory, setSelectedCategory] = useState<string>(() => {
    return localStorage.getItem('filter_category_id') || 'all';
  });

  // Date range filter state (default empty = all time)
  const [fromDate, setFromDate] = useState<string>('');
  const [toDate, setToDate] = useState<string>('');

  // Add transaction form state (Top section)
  const [amount, setAmount] = useState('');
  const [amountTouched, setAmountTouched] = useState(false);
  const [type, setType] = useState<TransactionType>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [date, setDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // New category modal state
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [newCatName, setNewCatName] = useState('');
  const [newCatType, setNewCatType] = useState<TransactionType>('expense');
  const [newCatIcon, setNewCatIcon] = useState('ShoppingCart');
  const [newCatColor, setNewCatColor] = useState('#FFD000');

  // Editing state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<TransactionType>('expense');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Search Debounce (300ms)
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(searchTerm);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchTerm]);

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

    const safetyTimer = setTimeout(() => {
      setLoading(false);
    }, 2500);

    return () => {
      unsubTx();
      unsubCat();
      clearTimeout(safetyTimer);
    };
  }, [user.uid]);

  // Clean up global filter category after reading it
  useEffect(() => {
    localStorage.removeItem('filter_category_id');
  }, []);

  const catMap = useMemo(() => {
    return categories.reduce((acc, cat) => {
      acc[cat.id!] = cat;
      return acc;
    }, {} as Record<string, Category>);
  }, [categories]);

  const filteredCategoriesForAdd = useMemo(() => {
    return categories.filter(c => c.type === type);
  }, [categories, type]);

  // Auto select default category for Add form
  useEffect(() => {
    if (filteredCategoriesForAdd.length > 0) {
      const exists = filteredCategoriesForAdd.some(c => c.id === categoryId);
      if (!exists) {
        setCategoryId(filteredCategoriesForAdd[0].id!);
      }
    } else {
      setCategoryId('');
    }
  }, [type, categories, filteredCategoriesForAdd]);

  // Validation & Add Transaction Handler
  const parsedAmount = useMemo(() => parseNumberInput(amount), [amount]);
  const isAmountInvalid = useMemo(() => {
    return amountTouched && (parsedAmount <= 0 || isNaN(parsedAmount));
  }, [amountTouched, parsedAmount]);

  // Add transaction popup modal & state
  const [showAddTxModal, setShowAddTxModal] = useState(false);
  const [expandedKeys, setExpandedKeys] = useState<Record<string, boolean>>({});

  const toggleExpandGroup = (key: string) => {
    setExpandedKeys(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const handleAddTransaction = async (e: React.FormEvent) => {
    e.preventDefault();
    setAmountTouched(true);
    
    if (parsedAmount <= 0 || !categoryId) {
      showToast('Số tiền không hợp lệ. Vui lòng nhập số lớn hơn 0.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      await addTransaction(user.uid, {
        amount: parsedAmount,
        type,
        category_id: categoryId,
        date: new Date(date).getTime(),
        note
      });

      setAmount('');
      setNote('');
      setAmountTouched(false);
      setShowAddTxModal(false);
      showToast('Ghi nhận giao dịch thành công!', 'success');
    } catch (err) {
      console.error(err);
      showToast('Đã xảy ra lỗi khi lưu giao dịch.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleAddCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCatName) return;
    try {
      const createdCatId = await addCategory(user.uid, {
        name: newCatName,
        type: newCatType,
        icon: newCatIcon,
        color: newCatColor
      });
      setShowCategoryModal(false);
      setNewCatName('');
      if (createdCatId && createdCatId.id) {
        setCategoryId(createdCatId.id);
      }
      showToast('Đã thêm danh mục mới!', 'success');
    } catch (err) {
      showToast('Lỗi khi thêm danh mục.', 'error');
    }
  };

  // Sync categoryId inside the edit form when type or categories change
  useEffect(() => {
    if (editingTx) {
      const filtered = categories.filter(c => c.type === editType);
      if (filtered.length > 0) {
        const exists = filtered.some(c => c.id === editCategoryId);
        if (!exists) {
          setEditCategoryId(filtered[0].id!);
        }
      } else {
        setEditCategoryId('');
      }
    }
  }, [editType, categories, editingTx]);

  const handleStartEdit = (t: Transaction) => {
    setEditingTx(t);
    setEditAmount(formatNumberInput(t.amount));
    setEditType(t.type);
    setEditCategoryId(t.category_id);
    setEditDate(format(new Date(t.date), 'yyyy-MM-dd'));
    setEditNote(t.note || '');
  };

  const handleSaveEdit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTx || !editingTx.id) return;
    const parsedAmount = parseNumberInput(editAmount);
    if (parsedAmount <= 0 || !editCategoryId) {
      showToast('Số tiền không hợp lệ. Vui lòng nhập số lớn hơn 0.', 'error');
      return;
    }

    setIsSaving(true);
    try {
      await updateTransaction(user.uid, editingTx.id, {
        amount: parsedAmount,
        type: editType,
        category_id: editCategoryId,
        date: new Date(editDate).getTime(),
        note: editNote
      });

      setEditingTx(null);
      showToast('Đã lưu thay đổi giao dịch!', 'success');
    } catch (err) {
      showToast('Lỗi khi cập nhật giao dịch.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = (t: Transaction) => {
    confirm({
      title: 'Xóa giao dịch này?',
      message: 'Xoá giao dịch này sẽ cập nhật lại số dư ví khả dụng của bạn.',
      confirmLabel: 'Xóa ngay',
      cancelLabel: 'Bỏ qua',
      type: 'danger',
      onConfirm: async () => {
        try {
          await deleteTransaction(user.uid, t.id!);
          showToast('Đã xóa giao dịch thành công!', 'success', async () => {
            // Undo transaction addition
            const { id, ...backup } = t;
            await addTransaction(user.uid, backup);
            showToast('Đã khôi phục giao dịch thành công!', 'success');
          });
        } catch (err) {
          showToast('Không thể xóa giao dịch.', 'error');
        }
      }
    });
  };

  // Main Filtering Logic
  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (t.is_split_pending) return false;

      const txDate = new Date(t.date);

      // Filter Date Range: fromDate to toDate
      if (fromDate) {
        const start = new Date(`${fromDate}T00:00:00`);
        if (txDate < start) return false;
      }
      if (toDate) {
        const end = new Date(`${toDate}T23:59:59.999`);
        if (txDate > end) return false;
      }

      // Filter by Type (income/expense)
      if (selectedType !== 'all' && t.type !== selectedType) return false;

      // Filter by Category
      if (selectedCategory !== 'all' && t.category_id !== selectedCategory) return false;

      // Filter by Search term
      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase();
        const matchesNote = t.note?.toLowerCase().includes(query);
        const matchesCategory = catMap[t.category_id]?.name.toLowerCase().includes(query);
        return matchesNote || matchesCategory;
      }

      return true;
    });
  }, [transactions, selectedType, selectedCategory, fromDate, toDate, debouncedSearch, catMap]);

  // Group same-day, same-category transactions together
  const groupedTransactions = useMemo(() => {
    const map = new Map<string, {
      key: string;
      dateStr: string;
      timestamp: number;
      category_id: string;
      type: TransactionType;
      totalAmount: number;
      items: Transaction[];
      notesStr: string;
    }>();

    for (const t of filtered) {
      const dateStr = format(new Date(t.date), 'yyyy-MM-dd');
      const key = `${dateStr}_${t.category_id}_${t.type}`;

      if (!map.has(key)) {
        map.set(key, {
          key,
          dateStr,
          timestamp: t.date,
          category_id: t.category_id,
          type: t.type,
          totalAmount: 0,
          items: [],
          notesStr: ''
        });
      }

      const grp = map.get(key)!;
      grp.totalAmount += t.amount;
      grp.items.push(t);
    }

    const result = Array.from(map.values());
    for (const grp of result) {
      const notes = Array.from(new Set(grp.items.map(i => i.note?.trim()).filter(Boolean)));
      grp.notesStr = notes.join(', ');
    }

    return result.sort((a, b) => b.timestamp - a.timestamp);
  }, [filtered]);

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="space-y-2">
            <div className="h-8 w-28 bg-slate-200 rounded animate-pulse" />
            <div className="h-4 w-60 bg-slate-100 rounded animate-pulse" />
          </div>
          <div className="h-10 w-48 bg-slate-200 rounded animate-pulse" />
        </div>
        <ListSkeleton />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* PAGE HEADER WITH ACTION BUTTON */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-[#FFFBEB] via-[#FFFBEB] to-[#FEF3C7] p-6 rounded-3xl border-4 border-[#FFF2D8] shadow-sm">
        <div>
          <h1 className="text-3xl font-black tracking-tight text-amber-950 leading-none flex items-center gap-2">
            Lịch sử giao dịch <span className="text-2xl">📜</span>
          </h1>
          <p className="text-xs sm:text-sm text-amber-800/80 font-bold mt-1.5">
            Ghi chép giao dịch thu chi mới và tra cứu lại lịch sử tiện lợi cùng bé Coin nha! ✨
          </p>
        </div>

        <button
          onClick={() => setShowAddTxModal(true)}
          className="flex items-center justify-center gap-2 bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] text-amber-950 px-6 py-3.5 rounded-2xl text-sm font-black border-b-4 border-amber-600 shadow-md hover:shadow-lg hover:scale-[1.02] active:scale-[0.98] transition-all cursor-pointer shrink-0"
        >
          <PlusCircle className="w-5 h-5 text-amber-950" />
          <span>Ghi chép giao dịch mới 📝</span>
        </button>
      </div>

      {/* POP-UP MODAL FOR ADDING NEW TRANSACTION */}
      {showAddTxModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#3A2A1A]/40 backdrop-blur-sm" onClick={() => setShowAddTxModal(false)} />
          <div className="relative bg-white rounded-3xl p-6 sm:p-8 w-full max-w-lg shadow-2xl border-4 border-[#FFF2D8] overflow-hidden animate-in fade-in zoom-in-95 duration-150 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-amber-100">
              <h2 className="text-lg font-black text-amber-950 flex items-center gap-1.5">
                Ghi chép giao dịch mới 📝
              </h2>
              <button
                type="button"
                onClick={() => setShowAddTxModal(false)}
                className="p-1.5 text-amber-700 hover:text-amber-950 hover:bg-amber-100 rounded-xl transition-all"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleAddTransaction} className="space-y-5">
              {/* Tab Selector for Income/Expense */}
              <div className="flex bg-amber-50/50 p-1 rounded-xl border border-amber-100">
                <button
                  type="button"
                  onClick={() => setType('expense')}
                  className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    type === 'expense' 
                      ? 'bg-rose-100/90 shadow-sm text-rose-700 border border-rose-200/50' 
                      : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  💸 Chi phí
                </button>
                <button
                  type="button"
                  onClick={() => setType('income')}
                  className={`flex-1 py-2.5 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    type === 'income' 
                      ? 'bg-emerald-100/90 shadow-sm text-emerald-700 border border-emerald-200/50' 
                      : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  💰 Thu nhập
                </button>
              </div>

              <div className="space-y-4">
                {/* Amount Field */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">
                    Số tiền giao dịch 💰
                  </label>
                  <input
                    type="text"
                    required
                    value={amount}
                    onChange={(e) => setAmount(formatNumberInput(e.target.value))}
                    onBlur={() => setAmountTouched(true)}
                    className={`block w-full rounded-2xl border-2 py-2.5 px-3.5 text-slate-900 bg-[#FFFDF9] placeholder:text-amber-600/30 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-mono font-bold tabular-nums transition-all ${
                      isAmountInvalid ? 'border-rose-300' : 'border-amber-100'
                    }`}
                    placeholder="Ví dụ: 50,000"
                  />
                  {isAmountInvalid && (
                    <p className="text-[11px] font-bold text-rose-600 mt-1 flex items-center gap-1 animate-pulse ml-1">
                      <span>😿 Số tiền phải lớn hơn 0 VND nha!</span>
                    </p>
                  )}
                </div>

                {/* Category Dropdown */}
                <div>
                  <div className="flex justify-between items-center mb-1.5">
                    <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 ml-1">
                      Danh mục 🐾
                    </label>
                    <button 
                      type="button" 
                      onClick={() => {
                        setNewCatType(type);
                        setShowCategoryModal(true);
                      }} 
                      className="text-[11px] font-extrabold text-amber-700 hover:text-amber-900 flex items-center cursor-pointer transition-colors"
                    >
                      <Plus className="w-3 h-3 mr-0.5 stroke-[3]" /> Thêm danh mục
                    </button>
                  </div>
                  <select
                    value={categoryId}
                    onChange={(e) => setCategoryId(e.target.value)}
                    required
                    className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold transition-all cursor-pointer"
                  >
                    <option value="" disabled>Chọn danh mục nè</option>
                    {filteredCategoriesForAdd.map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>

                {/* Date Field */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">
                    Ngày ghi nhận 📅
                  </label>
                  <input
                    type="date"
                    required
                    value={date}
                    onChange={(e) => setDate(e.target.value)}
                    className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold transition-all cursor-pointer"
                  />
                </div>

                {/* Note Field */}
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">
                    Ghi chú thêm ✍️
                  </label>
                  <input
                    type="text"
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold transition-all"
                    placeholder="Khoản này cho việc gì thế nhỉ?"
                  />
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-amber-100">
                <button
                  type="button"
                  onClick={() => setShowAddTxModal(false)}
                  className="px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-50 rounded-2xl transition-all cursor-pointer"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className={`flex items-center justify-center gap-2 rounded-2xl py-2.5 px-6 text-sm font-black transition-all border-b-4 border-amber-600 cursor-pointer disabled:opacity-70 disabled:cursor-not-allowed ${
                    isSubmitting 
                      ? 'bg-slate-300 border-slate-400 text-slate-600' 
                      : 'bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] text-amber-950 shadow-md shadow-amber-200/50 hover:shadow-lg'
                  }`}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>Đang lưu...</span>
                    </>
                  ) : (
                    <span>Lưu giao dịch ngay ✨</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SECTION 2: LIST OF ADDED TRANSACTIONS WITH ADVANCED FILTER BAR */}
      <section className="space-y-4">
        <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
          <h2 className="text-xl font-black text-amber-950 flex items-center gap-2">
            Danh sách thu, chi đã thêm 📋
            <span className="text-xs bg-amber-100 text-amber-900 font-extrabold px-2.5 py-1 rounded-full border border-amber-200">
              {filtered.length} giao dịch
            </span>
          </h2>

          {/* Search bar */}
          <div className="relative max-w-sm w-full">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
              <Search className="h-4.5 w-4.5 text-amber-600/60" />
            </div>
            <input
              type="text"
              className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 pl-10 pr-4 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-xs font-semibold transition-all"
              placeholder="Tìm theo ghi chú hoặc danh mục..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>

        {/* ADVANCED MULTI-FILTER BAR (Date Range fromDate to toDate, Category, Type) */}
        <div className="bg-white p-4.5 rounded-3xl shadow-md border-4 border-[#FFF2D8] space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-amber-100/60 pb-2">
            <div className="flex items-center gap-2 text-xs font-black text-amber-950 uppercase tracking-widest">
              <Filter className="w-4 h-4 text-amber-600" />
              Bộ lọc giao dịch (Từ ngày → Đến ngày / Danh mục)
            </div>

            {/* Quick date range presets */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                }}
                className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  !fromDate && !toDate
                    ? 'bg-amber-400 text-amber-950 border-amber-500 shadow-xs'
                    : 'bg-amber-50/70 text-amber-900 border-amber-200/80 hover:bg-amber-100'
                }`}
              >
                Tất cả thời gian ♾️
              </button>
              <button
                type="button"
                onClick={() => {
                  setFromDate(format(startOfMonth(new Date()), 'yyyy-MM-dd'));
                  setToDate(format(endOfMonth(new Date()), 'yyyy-MM-dd'));
                }}
                className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  fromDate === format(startOfMonth(new Date()), 'yyyy-MM-dd')
                    ? 'bg-amber-400 text-amber-950 border-amber-500 shadow-xs'
                    : 'bg-amber-50/70 text-amber-900 border-amber-200/80 hover:bg-amber-100'
                }`}
              >
                Tháng 8 / 2026 📅
              </button>
              <button
                type="button"
                onClick={() => {
                  const prevM = subMonths(new Date(), 1);
                  setFromDate(format(startOfMonth(prevM), 'yyyy-MM-dd'));
                  setToDate(format(endOfMonth(prevM), 'yyyy-MM-dd'));
                }}
                className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  fromDate === format(startOfMonth(subMonths(new Date(), 1)), 'yyyy-MM-dd')
                    ? 'bg-amber-400 text-amber-950 border-amber-500 shadow-xs'
                    : 'bg-amber-50/70 text-amber-900 border-amber-200/80 hover:bg-amber-100'
                }`}
              >
                Tháng 7 / 2026 ⏪
              </button>
              <button
                type="button"
                onClick={() => {
                  const todayStr = format(new Date(), 'yyyy-MM-dd');
                  setFromDate(todayStr);
                  setToDate(todayStr);
                }}
                className={`text-[10px] font-black px-2.5 py-1 rounded-lg border transition-all cursor-pointer ${
                  fromDate === format(new Date(), 'yyyy-MM-dd') && toDate === format(new Date(), 'yyyy-MM-dd')
                    ? 'bg-amber-400 text-amber-950 border-amber-500 shadow-xs'
                    : 'bg-amber-50/70 text-amber-900 border-amber-200/80 hover:bg-amber-100'
                }`}
              >
                Hôm nay ☀️
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {/* 1. From Date Filter */}
            <div>
              <label className="block text-[10px] font-black uppercase text-amber-800/80 mb-1 ml-1">Từ ngày</label>
              <input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="block w-full rounded-xl border-2 border-amber-100 bg-[#FFFDF9] py-1.5 px-2.5 text-xs font-semibold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none cursor-pointer"
              />
            </div>

            {/* 2. To Date Filter */}
            <div>
              <label className="block text-[10px] font-black uppercase text-amber-800/80 mb-1 ml-1">Đến ngày</label>
              <input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="block w-full rounded-xl border-2 border-amber-100 bg-[#FFFDF9] py-1.5 px-2.5 text-xs font-semibold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none cursor-pointer"
              />
            </div>

            {/* 3. Category Filter */}
            <div>
              <label className="block text-[10px] font-black uppercase text-amber-800/80 mb-1 ml-1">Theo danh mục</label>
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="block w-full rounded-xl border-2 border-amber-100 bg-[#FFFDF9] py-1.5 px-2.5 text-xs font-semibold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none cursor-pointer"
              >
                <option value="all">Tất cả danh mục</option>
                {categories.map(cat => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </div>

            {/* 4. Type Filter */}
            <div>
              <label className="block text-[10px] font-black uppercase text-amber-800/80 mb-1 ml-1">Thu nhập / Chi phí</label>
              <select
                value={selectedType}
                onChange={(e) => setSelectedType(e.target.value as any)}
                className="block w-full rounded-xl border-2 border-amber-100 bg-[#FFFDF9] py-1.5 px-2.5 text-xs font-semibold text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none cursor-pointer"
              >
                <option value="all">Tất cả thu & chi</option>
                <option value="expense">💸 Chỉ chi phí</option>
                <option value="income">💰 Chỉ thu nhập</option>
              </select>
            </div>
          </div>

          {/* Active Filter Clear Tag */}
          {(fromDate !== '' || toDate !== '' || selectedCategory !== 'all' || selectedType !== 'all') && (
            <div className="pt-2 border-t border-amber-100/50 flex items-center justify-between">
              <span className="text-[11px] font-bold text-amber-800/70">
                Đang lọc từ <span className="font-mono text-amber-950 font-black">{fromDate || 'bắt đầu'}</span> đến <span className="font-mono text-amber-950 font-black">{toDate || 'hiện tại'}</span>.
              </span>
              <button
                onClick={() => {
                  setFromDate('');
                  setToDate('');
                  setSelectedCategory('all');
                  setSelectedType('all');
                }}
                className="text-xs font-black text-rose-600 hover:text-rose-800 flex items-center gap-1 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
                Xóa tất cả bộ lọc (Xem tất cả)
              </button>
            </div>
          )}
        </div>

        {/* TRANSACTION ITEMS LIST */}
        <div className="bg-white rounded-3xl shadow-lg shadow-amber-150/5 border-4 border-[#FFF2D8] overflow-hidden">
          <div className="divide-y divide-amber-100/50">
            {groupedTransactions.length === 0 ? (
              <div className="p-12 text-center text-amber-800 flex flex-col items-center justify-center gap-3">
                <span className="text-4xl">🐾</span>
                <div>
                  <p className="font-black text-amber-950">
                    {transactions.length > 0 
                      ? `Có ${transactions.length} giao dịch nằm ngoài bộ lọc hiện tại` 
                      : 'Chưa có giao dịch nào'}
                  </p>
                  <div className="text-xs text-amber-700/70 mt-1">
                    {transactions.length > 0 ? (
                      <button
                        type="button"
                        onClick={() => {
                          setFromDate('');
                          setToDate('');
                          setSelectedCategory('all');
                          setSelectedType('all');
                          setSearchTerm('');
                        }}
                        className="text-amber-950 font-black bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] px-4 py-2.5 rounded-2xl border-b-2 border-amber-600 shadow-sm mt-3 inline-flex items-center gap-1.5 cursor-pointer hover:scale-[1.02] transition-all"
                      >
                        ⚡ Xem tất cả {transactions.length} giao dịch ngay (Khôi phục bộ lọc)
                      </button>
                    ) : (
                      'Hãy bấm nút "Ghi chép giao dịch mới" ở trên để tạo mới nhé!'
                    )}
                  </div>
                </div>
              </div>
            ) : (
              groupedTransactions.map((grp) => {
                const cat = catMap[grp.category_id];
                const Icon = cat && Icons[cat.icon as keyof typeof Icons] ? (Icons[cat.icon as keyof typeof Icons] as any) : Icons.Circle;
                const isGroupedMultiple = grp.items.length > 1;
                const isExpanded = !!expandedKeys[grp.key];

                return (
                  <div key={grp.key} className="transition-colors group divide-y divide-amber-100/60">
                    {/* Main Group Row */}
                    <div className="p-4 sm:p-5 flex items-center justify-between hover:bg-[#FFFDF9] gap-3">
                      <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                        <div 
                          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm border border-white"
                          style={{ backgroundColor: `${cat?.color || '#ffd000'}15`, color: cat?.color || '#b45309' }}
                        >
                          <Icon className="w-5.5 h-5.5 stroke-[2.25]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <p className="text-sm font-extrabold text-amber-950 tracking-tight leading-snug truncate">
                              {cat?.name || 'Không rõ danh mục'}
                            </p>
                            {isGroupedMultiple && (
                              <span className="bg-amber-100/90 text-amber-900 border border-amber-300/60 text-[10px] font-black px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                <Layers className="w-3 h-3 text-amber-700 shrink-0" />
                                {grp.items.length} mục đã cộng gộp
                              </span>
                            )}
                          </div>
                          <div className="flex items-center text-[11px] text-amber-800/60 space-x-2 mt-0.5 font-bold min-w-0">
                            <span className="flex items-center gap-1 shrink-0">
                              <Calendar className="w-3 h-3 text-amber-500/50" />
                              {format(new Date(grp.timestamp), 'dd/MM/yyyy')}
                            </span>
                            {grp.notesStr && (
                              <>
                                <span className="text-amber-200 shrink-0">&bull;</span>
                                <span className="truncate text-amber-900/80 font-semibold">{grp.notesStr}</span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
                        <span className={`font-bold font-mono tracking-tight text-sm sm:text-base tabular-nums shrink-0 ${grp.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                          {grp.type === 'income' ? '+' : '-'}{formatCurrency(grp.totalAmount)}
                        </span>
                        
                        {/* If single item: direct edit/delete. If multiple: toggle expansion */}
                        {!isGroupedMultiple ? (
                          <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                            <button 
                              onClick={() => handleStartEdit(grp.items[0])}
                              className="p-1.5 text-amber-700/60 hover:text-amber-900 hover:bg-amber-100/50 rounded-lg transition-all cursor-pointer"
                              title="Sửa giao dịch"
                            >
                              <Edit2 className="w-4 h-4 stroke-[2.5]" />
                            </button>
                            <button 
                              onClick={() => handleDelete(grp.items[0])}
                              className="p-1.5 text-rose-500/60 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all cursor-pointer"
                              title="Xóa giao dịch"
                            >
                              <Trash2 className="w-4 h-4 stroke-[2.5]" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => toggleExpandGroup(grp.key)}
                            className="p-1.5 sm:px-2.5 sm:py-1.5 bg-amber-100/80 hover:bg-amber-200/90 text-amber-950 rounded-xl text-xs font-black flex items-center gap-1 transition-all cursor-pointer border border-amber-300/80 shadow-2xs"
                            title={isExpanded ? "Thu gọn chi tiết" : "Xem chi tiết các giao dịch gộp"}
                          >
                            <span className="hidden sm:inline">{isExpanded ? 'Thu gọn' : 'Chi tiết'}</span>
                            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Expandable sub-items when aggregated */}
                    {isGroupedMultiple && isExpanded && (
                      <div className="bg-amber-50/50 p-3 sm:px-6 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-amber-800/80 mb-1.5">
                          Chi tiết {grp.items.length} khoản trong ngày:
                        </p>
                        {grp.items.map((subTx, idx) => (
                          <div key={subTx.id || idx} className="bg-white p-3 rounded-2xl border border-amber-200/80 flex items-center justify-between text-xs font-semibold shadow-2xs">
                            <div className="min-w-0 flex-1 pr-2">
                              <p className="font-bold text-amber-950 truncate">{subTx.note || 'Không có ghi chú'}</p>
                              <p className="text-[10px] text-amber-700/60 font-mono mt-0.5">
                                {format(new Date(subTx.date), 'dd/MM/yyyy HH:mm')}
                              </p>
                            </div>
                            <div className="flex items-center gap-3 shrink-0">
                              <span className={`font-mono font-bold ${subTx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                {subTx.type === 'income' ? '+' : '-'}{formatCurrency(subTx.amount)}
                              </span>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => handleStartEdit(subTx)}
                                  className="p-1 text-amber-700/70 hover:text-amber-950 hover:bg-amber-100 rounded-md transition-all cursor-pointer"
                                  title="Sửa khoản này"
                                >
                                  <Edit2 className="w-3.5 h-3.5" />
                                </button>
                                <button 
                                  onClick={() => handleDelete(subTx)}
                                  className="p-1 text-rose-500/70 hover:text-rose-800 hover:bg-rose-100 rounded-md transition-all cursor-pointer"
                                  title="Xóa khoản này"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* EDIT MODAL DIALOG OVERLAY */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#3A2A1A]/40 backdrop-blur-sm" onClick={() => setEditingTx(null)} />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-4 border-[#FFF2D8] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-amber-950 mb-4 tracking-tight leading-none">Sửa giao dịch 📝</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="flex bg-amber-50/50 p-1 rounded-xl border border-amber-100">
                <button
                  type="button"
                  onClick={() => setEditType('expense')}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    editType === 'expense' 
                      ? 'bg-rose-100/90 text-rose-700 border border-rose-200/50 shadow-sm' 
                      : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  💸 Chi phí
                </button>
                <button
                  type="button"
                  onClick={() => setEditType('income')}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    editType === 'income' 
                      ? 'bg-emerald-100/90 text-emerald-700 border border-emerald-200/50 shadow-sm' 
                      : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  💰 Thu nhập
                </button>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Số tiền (VND) 💰</label>
                <input
                  type="text"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(formatNumberInput(e.target.value))}
                  className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-850 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-mono font-semibold tabular-nums"
                  placeholder="Ví dụ: 100,000"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Danh mục 🐾</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    required
                    className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-xs font-bold cursor-pointer"
                  >
                    {categories.filter(c => c.type === editType).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Ngày 📅</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2 px-3 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-xs font-bold cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Ghi chú thêm ✍️</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-800 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold animate-none"
                  placeholder="Ghi chú cái gì đó..."
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-amber-100/50">
                <button 
                  type="button" 
                  onClick={() => setEditingTx(null)} 
                  className="px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-50 rounded-2xl transition-all cursor-pointer"
                >
                  Hủy nha
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-5 py-2.5 text-sm font-black text-amber-950 bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] rounded-2xl shadow-sm border-b-2 border-amber-600 hover:scale-[1.02] transition-all flex items-center gap-1 cursor-pointer"
                >
                  {isSaving ? 'Đợi bé...' : 'Lưu lại nè! ✨'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ADD CATEGORY MODAL DIALOG OVERLAY */}
      {showCategoryModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[#3A2A1A]/40 backdrop-blur-sm" onClick={() => setShowCategoryModal(false)} />
          <div className="relative bg-white rounded-3xl p-6 w-full max-w-md shadow-2xl border-4 border-[#FFF2D8] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-black text-amber-950 mb-4 tracking-tight leading-none">Thêm danh mục mới 🐾</h3>
            
            <form onSubmit={handleAddCategory} className="space-y-4">
              {/* Type selector */}
              <div className="flex bg-amber-50/50 p-1 rounded-xl border border-amber-100">
                <button
                  type="button"
                  onClick={() => setNewCatType('expense')}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    newCatType === 'expense' 
                      ? 'bg-rose-100/90 text-rose-700 border border-rose-200/50 shadow-sm' 
                      : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  💸 Chi phí
                </button>
                <button
                  type="button"
                  onClick={() => setNewCatType('income')}
                  className={`flex-1 py-2 text-xs font-black rounded-lg transition-all cursor-pointer ${
                    newCatType === 'income' 
                      ? 'bg-emerald-100/90 text-emerald-700 border border-emerald-200/50 shadow-sm' 
                      : 'text-amber-800/70 hover:text-amber-950'
                  }`}
                >
                  💰 Thu nhập
                </button>
              </div>

              {/* Name field */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Tên danh mục ✨</label>
                <input
                  type="text"
                  required
                  value={newCatName}
                  onChange={(e) => setNewCatName(e.target.value)}
                  className="block w-full rounded-2xl border-2 border-amber-100 bg-[#FFFDF9] py-2.5 px-3.5 text-slate-850 focus:border-[#FFC300] focus:ring-0 focus:outline-none text-sm font-semibold"
                  placeholder="Ví dụ: Ăn uống, Giải trí, Thưởng..."
                />
              </div>

              {/* Color selector */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Màu sắc đại diện 🎨</label>
                <div className="flex items-center gap-2 flex-wrap">
                  {['#FFD000', '#FF5722', '#4CAF50', '#2196F3', '#9C27B0', '#E91E63', '#FF9800', '#00BCD4', '#795548', '#607D8B'].map(color => (
                    <button
                      type="button"
                      key={color}
                      onClick={() => setNewCatColor(color)}
                      className={`w-7 h-7 rounded-full transition-transform cursor-pointer border-2 ${
                        newCatColor === color ? 'scale-125 border-slate-900 shadow-sm' : 'border-transparent hover:scale-110'
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                </div>
              </div>

              {/* Icon selector */}
              <div>
                <label className="block text-xs font-black uppercase tracking-widest text-amber-800/80 mb-1.5 ml-1">Icon minh họa 🖼️</label>
                <div className="grid grid-cols-8 gap-2 p-2 bg-amber-50/50 rounded-2xl border border-amber-100/80 max-h-32 overflow-y-auto">
                  {['ShoppingCart', 'Utensils', 'Coffee', 'Car', 'Home', 'Heart', 'Gift', 'Briefcase', 'Film', 'PiggyBank', 'Smile', 'Tag', 'Zap', 'BookOpen', 'Music', 'Plane'].map(iconName => {
                    const IconComp = (Icons as any)[iconName] || Icons.Tag;
                    const isSelected = newCatIcon === iconName;
                    return (
                      <button
                        type="button"
                        key={iconName}
                        onClick={() => setNewCatIcon(iconName)}
                        className={`p-2 rounded-xl flex items-center justify-center transition-all cursor-pointer ${
                          isSelected 
                            ? 'bg-amber-300 text-amber-950 font-black shadow-xs scale-105' 
                            : 'bg-white text-amber-800/70 hover:bg-amber-100'
                        }`}
                      >
                        <IconComp className="w-4 h-4" />
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-4 border-t border-amber-100/50">
                <button 
                  type="button" 
                  onClick={() => setShowCategoryModal(false)} 
                  className="px-4 py-2.5 text-sm font-bold text-amber-800 hover:bg-amber-50 rounded-2xl transition-all cursor-pointer"
                >
                  Hủy nha
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2.5 text-sm font-black text-amber-950 bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] rounded-2xl shadow-sm border-b-2 border-amber-600 hover:scale-[1.02] transition-all cursor-pointer"
                >
                  Thêm danh mục ngay ✨
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
