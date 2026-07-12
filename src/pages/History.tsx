import React, { useState, useEffect } from 'react';
import { User } from 'firebase/auth';
import { subscribeToTransactions, subscribeToCategories, deleteTransaction, updateTransaction } from '../lib/db';
import { Transaction, Category, TransactionType } from '../types';
import { format } from 'date-fns';
import { Trash2, Edit2, Search } from 'lucide-react';
import * as Icons from 'lucide-react';
import { formatCurrency, formatNumberInput, parseNumberInput } from '../lib/utils';

export default function History({ user }: { user: User }) {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [searchTerm, setSearchTerm] = useState('');

  // Editing state
  const [editingTx, setEditingTx] = useState<Transaction | null>(null);
  const [editAmount, setEditAmount] = useState('');
  const [editType, setEditType] = useState<TransactionType>('expense');
  const [editCategoryId, setEditCategoryId] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editNote, setEditNote] = useState('');

  useEffect(() => {
    const unsubTx = subscribeToTransactions(user.uid, setTransactions);
    const unsubCat = subscribeToCategories(user.uid, setCategories);
    return () => {
      unsubTx();
      unsubCat();
    };
  }, [user.uid]);

  const catMap = categories.reduce((acc, cat) => {
    acc[cat.id!] = cat;
    return acc;
  }, {} as Record<string, Category>);

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
    if (!parsedAmount || !editCategoryId) return;

    await updateTransaction(user.uid, editingTx.id, {
      amount: parsedAmount,
      type: editType,
      category_id: editCategoryId,
      date: new Date(editDate).getTime(),
      note: editNote
    });

    setEditingTx(null);
  };

  const filtered = transactions.filter(t => 
    !t.is_split_pending && (
      t.note?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      (catMap[t.category_id]?.name.toLowerCase().includes(searchTerm.toLowerCase()))
    )
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-8 gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-gray-900">Lịch sử</h1>
          <p className="text-sm text-gray-500">Quản lý các giao dịch trước đây của bạn.</p>
        </div>
        <div className="relative max-w-sm w-full">
          <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
            <Search className="h-4 w-4 text-gray-400" />
          </div>
          <input
            type="text"
            className="block w-full rounded-lg border-0 py-2 pl-9 pr-3 text-gray-900 ring-1 ring-inset ring-gray-300 placeholder:text-gray-400 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm sm:leading-6"
            placeholder="Tìm kiếm theo ghi chú hoặc danh mục..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
        <div className="divide-y divide-gray-100">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-gray-500">Không tìm thấy giao dịch nào.</div>
          ) : (
            filtered.map((t) => {
              const cat = catMap[t.category_id];
              const Icon = cat && Icons[cat.icon as keyof typeof Icons] ? (Icons[cat.icon as keyof typeof Icons] as any) : Icons.Circle;
              return (
                <div key={t.id} className="p-4 sm:p-6 flex items-center justify-between hover:bg-gray-50 transition-colors group">
                  <div className="flex items-center space-x-4">
                    <div 
                      className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
                      style={{ backgroundColor: `${cat?.color || '#ccc'}20`, color: cat?.color || '#ccc' }}
                    >
                      <Icon className="w-5 h-5" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{cat?.name || 'Không rõ'}</p>
                      <div className="flex items-center text-xs text-gray-500 space-x-2 mt-0.5">
                        <span>{format(new Date(t.date), 'dd/MM/yyyy')}</span>
                        {t.note && (
                          <>
                            <span>&bull;</span>
                            <span className="truncate max-w-[120px] sm:max-w-xs">{t.note}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 sm:space-x-4">
                    <span className={`font-semibold text-sm sm:text-base ${t.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {t.type === 'income' ? '+' : '-'}{formatCurrency(t.amount)}
                    </span>
                    <button 
                      onClick={() => handleStartEdit(t)}
                      className="p-1 text-gray-400 hover:text-indigo-600 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                      title="Sửa giao dịch"
                    >
                      <Edit2 className="w-4 h-4" />
                    </button>
                    <button 
                      onClick={() => deleteTransaction(user.uid, t.id!)}
                      className="p-1 text-gray-400 hover:text-rose-600 transition-colors sm:opacity-0 sm:group-hover:opacity-100"
                      title="Xóa giao dịch"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Edit Modal */}
      {editingTx && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 animate-fade-in">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl border border-gray-100">
            <h3 className="text-lg font-bold text-gray-900 mb-4">Sửa giao dịch</h3>
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div className="flex bg-gray-100 p-1 rounded-lg">
                <button
                  type="button"
                  onClick={() => setEditType('expense')}
                  className={`flex-1 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-all ${editType === 'expense' ? 'bg-white shadow text-rose-600' : 'text-gray-500'}`}
                >
                  Chi phí
                </button>
                <button
                  type="button"
                  onClick={() => setEditType('income')}
                  className={`flex-1 py-1.5 text-xs sm:text-sm font-semibold rounded-md transition-all ${editType === 'income' ? 'bg-white shadow text-emerald-600' : 'text-gray-500'}`}
                >
                  Thu nhập
                </button>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Số tiền (VND)</label>
                <input
                  type="text"
                  required
                  value={editAmount}
                  onChange={(e) => setEditAmount(formatNumberInput(e.target.value))}
                  className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm font-mono"
                  placeholder="Ví dụ: 100,000"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Danh mục</label>
                  <select
                    value={editCategoryId}
                    onChange={(e) => setEditCategoryId(e.target.value)}
                    required
                    className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-xs"
                  >
                    {categories.filter(c => c.type === editType).map(cat => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-700 mb-1">Ngày</label>
                  <input
                    type="date"
                    required
                    value={editDate}
                    onChange={(e) => setEditDate(e.target.value)}
                    className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-xs"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 mb-1">Ghi chú (Tùy chọn)</label>
                <input
                  type="text"
                  value={editNote}
                  onChange={(e) => setEditNote(e.target.value)}
                  className="block w-full rounded-lg border-0 py-2 px-3 text-gray-900 ring-1 ring-inset ring-gray-300 focus:ring-2 focus:ring-inset focus:ring-indigo-600 sm:text-sm"
                  placeholder="Ghi chú gì đó..."
                />
              </div>

              <div className="flex justify-end space-x-3 mt-6 pt-2 border-t border-gray-100">
                <button 
                  type="button" 
                  onClick={() => setEditingTx(null)} 
                  className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-full border border-gray-200 transition-colors"
                >
                  Hủy
                </button>
                <button 
                  type="submit" 
                  className="px-5 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-full shadow-md hover:shadow-lg transition-all"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
