import React, { useState, useEffect, useMemo } from 'react';
import { User } from 'firebase/auth';
import { subscribeToTransactions, subscribeToCategories, deleteTransaction, updateTransaction, addTransaction } from '../lib/db';
import { Transaction, Category, TransactionType } from '../types';
import { format } from 'date-fns';
import { Trash2, Edit2, Search, Filter, Calendar, Tag, X } from 'lucide-react';
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

    return () => {
      unsubTx();
      unsubCat();
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

  const filtered = useMemo(() => {
    return transactions.filter(t => {
      if (t.is_split_pending) return false;

      // Filter by type
      if (selectedType !== 'all' && t.type !== selectedType) return false;

      // Filter by category
      if (selectedCategory !== 'all' && t.category_id !== selectedCategory) return false;

      // Search matches
      if (debouncedSearch) {
        const query = debouncedSearch.toLowerCase();
        const matchesNote = t.note?.toLowerCase().includes(query);
        const matchesCategory = catMap[t.category_id]?.name.toLowerCase().includes(query);
        return matchesNote || matchesCategory;
      }

      return true;
    });
  }, [transactions, selectedType, selectedCategory, debouncedSearch, catMap]);

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
    <div className="space-y-6">
      {/* HEADER SECTION WITH FILTER PREFERENCES */}
      <div className="flex flex-col xl:flex-row xl:items-center xl:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-slate-900 leading-tight">Lịch sử</h1>
          <p className="text-sm text-slate-500 font-medium">Tìm kiếm, lọc danh mục, và quản lý chi tiết mọi hoạt động thu chi.</p>
        </div>
        
        {/* Search controls */}
        <div className="relative max-w-sm w-full">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5">
            <Search className="h-4.5 w-4.5 text-slate-400" />
          </div>
          <input
            type="text"
            className="block w-full rounded-xl border-0 py-2.5 pl-10 pr-4 text-slate-800 ring-1 ring-inset ring-slate-200 placeholder:text-slate-400 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-medium transition-all"
            placeholder="Tìm theo ghi chú hoặc danh mục..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* QUICK FILTERS BAR */}
      <div className="flex flex-wrap items-center gap-3">
        {/* Type Filter Buttons */}
        <div className="flex bg-slate-100 p-1 rounded-xl">
          <button
            onClick={() => setSelectedType('all')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              selectedType === 'all' ? 'bg-white shadow text-slate-800' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Tất cả
          </button>
          <button
            onClick={() => setSelectedType('expense')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              selectedType === 'expense' ? 'bg-white shadow text-[#F0426B]' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Chi phí
          </button>
          <button
            onClick={() => setSelectedType('income')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              selectedType === 'income' ? 'bg-white shadow text-[#17B978]' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            Thu nhập
          </button>
        </div>

        {/* Category Filter Dropdown */}
        <div className="flex items-center gap-2 bg-white rounded-xl ring-1 ring-slate-200 px-3 py-1 text-xs font-bold text-slate-600 transition-all hover:bg-slate-50">
          <Filter className="w-3.5 h-3.5 text-slate-400" />
          <span>Danh mục:</span>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="bg-transparent border-none outline-none text-slate-800 font-semibold cursor-pointer"
          >
            <option value="all">Tất cả danh mục</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.name}</option>
            ))}
          </select>
        </div>

        {/* Clear active category filter helper indicator */}
        {selectedCategory !== 'all' && (
          <button
            onClick={() => setSelectedCategory('all')}
            className="flex items-center gap-1.5 bg-indigo-50 hover:bg-indigo-100 text-[#4F6EF7] px-3 py-1.5 rounded-xl text-xs font-bold cursor-pointer transition-colors"
          >
            <span>Đang lọc: {catMap[selectedCategory]?.name}</span>
            <X className="w-3.5 h-3.5 stroke-[2.5]" />
          </button>
        )}
      </div>

      {/* TRANSACTION ITEMS LIST */}
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100/60 overflow-hidden">
        <div className="divide-y divide-slate-100">
          {filtered.length === 0 ? (
            <div className="p-12 text-center text-slate-400 flex flex-col items-center justify-center gap-3">
              <Search className="w-12 h-12 text-slate-200 stroke-[1.5]" />
              <div>
                <p className="font-bold text-slate-800">Không tìm thấy giao dịch nào</p>
                <p className="text-xs text-slate-400 mt-1">Thử thay đổi bộ lọc hoặc từ khóa tìm kiếm của bạn.</p>
              </div>
            </div>
          ) : (
            filtered.map((t) => {
              const cat = catMap[t.category_id];
              const Icon = cat && Icons[cat.icon as keyof typeof Icons] ? (Icons[cat.icon as keyof typeof Icons] as any) : Icons.Circle;
              return (
                <div key={t.id} className="p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50/50 transition-colors group gap-3">
                  <div className="flex items-center space-x-3 sm:space-x-4 min-w-0 flex-1">
                    <div 
                      className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 shadow-sm"
                      style={{ backgroundColor: `${cat?.color || '#cbd5e1'}15`, color: cat?.color || '#94a3b8' }}
                    >
                      <Icon className="w-5.5 h-5.5 stroke-[2]" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-slate-900 tracking-tight leading-snug truncate">{cat?.name || 'Không rõ danh mục'}</p>
                      <div className="flex items-center text-xs text-slate-400 space-x-2 mt-1 font-semibold min-w-0">
                        <span className="flex items-center gap-1 shrink-0">
                          <Calendar className="w-3 h-3 text-slate-300" />
                          {format(new Date(t.date), 'dd/MM/yyyy')}
                        </span>
                        {t.note && (
                          <>
                            <span className="text-slate-300 shrink-0">&bull;</span>
                            <span className="truncate text-slate-500 font-medium">{t.note}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 sm:space-x-4 shrink-0">
                    <span className={`font-bold font-mono tracking-tight text-sm sm:text-base tabular-nums shrink-0 ${t.type === 'income' ? 'text-[#17B978]' : 'text-[#F0426B]'}`}>
                      {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                    
                    {/* Action buttons on hover */}
                    <div className="flex items-center gap-1 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity duration-150">
                      <button 
                        onClick={() => handleStartEdit(t)}
                        className="p-1.5 text-slate-400 hover:text-[#4F6EF7] hover:bg-[#4F6EF7]/10 rounded-lg transition-all cursor-pointer"
                        title="Sửa giao dịch"
                      >
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button 
                        onClick={() => handleDelete(t)}
                        className="p-1.5 text-slate-400 hover:text-[#F0426B] hover:bg-[#F0426B]/10 rounded-lg transition-all cursor-pointer"
                        title="Xóa giao dịch"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* EDIT MODAL DIALOG OVERLAY */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" onClick={() => setEditingTx(null)} />
          <div className="relative bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-lg font-bold text-slate-900 mb-4 tracking-tight leading-none">Sửa giao dịch</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setEditType('expense')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    editType === 'expense' ? 'bg-white shadow text-[#F0426B]' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Chi phí
                </button>
                <button
                  type="button"
                  onClick={() => setEditType('income')}
                  className={`flex-1 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                    editType === 'income' ? 'bg-white shadow text-[#17B978]' : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  Thu nhập
                </button>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Số tiền (VND)</label>
                <input
                  type="text"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(formatNumberInput(e.target.value))}
                  className="block w-full rounded-xl border-0 py-2.5 px-3.5 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-mono font-semibold tabular-nums"
                  placeholder="Ví dụ: 100,000"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Danh mục</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    required
                    className="block w-full rounded-xl border-0 py-2.5 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-xs font-semibold bg-white cursor-pointer"
                  >
                    {categories.filter(c => c.type === editType).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Ngày</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="block w-full rounded-xl border-0 py-2 px-3 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-xs font-semibold bg-white cursor-pointer"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-1">Ghi chú thêm</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="block w-full rounded-xl border-0 py-2.5 px-3.5 text-slate-800 ring-1 ring-inset ring-slate-200 focus:ring-2 focus:ring-inset focus:ring-[#4F6EF7] text-sm font-medium"
                  placeholder="Ghi chú cái gì đó..."
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-3 border-t border-slate-100">
                <button 
                  type="button" 
                  onClick={() => setEditingTx(null)} 
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50 rounded-xl transition-colors cursor-pointer"
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  disabled={isSaving}
                  className="px-5 py-2 text-sm font-semibold text-white bg-[#4F6EF7] hover:bg-[#4F6EF7]/90 rounded-xl shadow-md shadow-indigo-100 hover:scale-[1.02] transition-all flex items-center gap-1 cursor-pointer"
                >
                  {isSaving ? 'Đang lưu...' : 'Lưu thay đổi'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
