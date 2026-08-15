import { db } from '../firebase';
import { ref, set, push, onValue, remove, update } from 'firebase/database';
import { Transaction, Category, Budget, DebtInstallment, CustomCycle, SavingTransaction } from '../types';

export const subscribeToTransactions = (uid: string, callback: (data: Transaction[]) => void) => {
  const transactionsRef = ref(db, `transactions/${uid}`);
  return onValue(transactionsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return callback([]);
    const formatted = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    callback(formatted.sort((a, b) => Number(b.date || 0) - Number(a.date || 0))); // descending
  }, (error) => {
    console.warn('Error subscribing to transactions:', error);
    callback([]);
  });
};

export const DEFAULT_CATEGORIES: Omit<Category, 'id'>[] = [
  { name: 'Ăn uống', type: 'expense', icon: 'Utensils', color: '#FF7043' },
  { name: 'Di chuyển', type: 'expense', icon: 'Car', color: '#42A5F5' },
  { name: 'Mua sắm', type: 'expense', icon: 'ShoppingBag', color: '#EC407A' },
  { name: 'Hóa đơn & Tiện ích', type: 'expense', icon: 'FileText', color: '#AB47BC' },
  { name: 'Giải trí', type: 'expense', icon: 'Gamepad2', color: '#7E57C2' },
  { name: 'Sức khỏe', type: 'expense', icon: 'HeartPulse', color: '#26A69A' },
  { name: 'Lương', type: 'income', icon: 'Banknote', color: '#66BB6A' },
  { name: 'Thưởng', type: 'income', icon: 'Gift', color: '#FFA726' },
  { name: 'Thu nhập khác', type: 'income', icon: 'Coins', color: '#26C6DA' },
];

export const deleteCategory = (uid: string, id: string) => {
  const itemRef = ref(db, `categories/${uid}/${id}`);
  return remove(itemRef);
};

export const subscribeToCategories = (uid: string, callback: (data: Category[]) => void) => {
  const refPath = ref(db, `categories/${uid}`);
  return onValue(refPath, (snapshot) => {
    const data = snapshot.val();
    if (!data) {
      // Seed default categories for new users
      try {
        DEFAULT_CATEGORIES.forEach(cat => {
          push(refPath, cat);
        });
      } catch (e) {
        console.warn('Failed to seed categories:', e);
      }
      return callback([]);
    }
    const list: Category[] = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    // Filter out and auto delete any 'Đi chợ' category
    const filtered = list.filter(cat => {
      const isDiCho = cat.name && (cat.name.trim().toLowerCase() === 'đi chợ' || cat.name.trim().toLowerCase() === 'di cho');
      if (isDiCho && cat.id) {
        deleteCategory(uid, cat.id).catch(() => {});
        return false;
      }
      return true;
    });
    callback(filtered);
  }, (error) => {
    console.warn('Error subscribing to categories:', error);
    callback([]);
  });
};

export const subscribeToBudgets = (uid: string, callback: (data: Budget[]) => void) => {
  const refPath = ref(db, `budgets/${uid}`);
  return onValue(refPath, (snapshot) => {
    const data = snapshot.val();
    if (!data) return callback([]);
    callback(Object.keys(data).map(key => ({ category_id: key, ...data[key] })));
  }, (error) => {
    console.warn('Error subscribing to budgets:', error);
    callback([]);
  });
};

export const subscribeToDebts = (uid: string, callback: (data: DebtInstallment[]) => void) => {
  const refPath = ref(db, `debts_installments/${uid}`);
  return onValue(refPath, (snapshot) => {
    const data = snapshot.val();
    if (!data) return callback([]);
    callback(Object.keys(data).map(key => ({ id: key, ...data[key] })));
  }, (error) => {
    console.warn('Error subscribing to debts:', error);
    callback([]);
  });
};

export const addTransaction = (uid: string, transaction: Omit<Transaction, 'id'>) => {
  const listRef = ref(db, `transactions/${uid}`);
  const newRef = push(listRef);
  return set(newRef, transaction);
};

export const updateTransaction = (uid: string, id: string, transaction: Partial<Transaction>) => {
  const itemRef = ref(db, `transactions/${uid}/${id}`);
  return update(itemRef, transaction);
};

export const deleteTransaction = (uid: string, id: string) => {
  const itemRef = ref(db, `transactions/${uid}/${id}`);
  return remove(itemRef);
};

export const addCategory = async (uid: string, category: Omit<Category, 'id'>) => {
  const listRef = ref(db, `categories/${uid}`);
  const newRef = push(listRef);
  await set(newRef, category);
  return { id: newRef.key!, ...category };
};

export const setBudget = (uid: string, categoryId: string, budget: Omit<Budget, 'category_id'>) => {
  const itemRef = ref(db, `budgets/${uid}/${categoryId}`);
  return set(itemRef, budget);
};

export const addDebt = (uid: string, debt: Omit<DebtInstallment, 'id'>) => {
  const listRef = ref(db, `debts_installments/${uid}`);
  const newRef = push(listRef);
  return set(newRef, debt);
};

export const updateDebt = (uid: string, id: string, debt: Partial<DebtInstallment>) => {
  const itemRef = ref(db, `debts_installments/${uid}/${id}`);
  return update(itemRef, debt);
};

export const deleteDebt = (uid: string, id: string) => {
  const itemRef = ref(db, `debts_installments/${uid}/${id}`);
  return remove(itemRef);
};

export const subscribeToSettlementDay = (uid: string, callback: (day: number) => void) => {
  const refPath = ref(db, `settlement_config/${uid}`);
  return onValue(refPath, (snapshot) => {
    const data = snapshot.val();
    if (data && data.settlement_day !== undefined) {
      callback(Number(data.settlement_day) || 1);
    } else {
      callback(1); // default to 1st of the month
    }
  }, (error) => {
    console.warn('Error subscribing to settlement day:', error);
    callback(1);
  });
};

export const updateSettlementDay = (uid: string, day: number) => {
  const refPath = ref(db, `settlement_config/${uid}`);
  return update(refPath, { settlement_day: day, updated_at: new Date().getTime() });
};

export const subscribeToSettlementConfig = (uid: string, callback: (config: { settlement_day: number; mode: 'fixed' | 'flexible'; estimated_income?: number }) => void) => {
  const refPath = ref(db, `settlement_config/${uid}`);
  return onValue(refPath, (snapshot) => {
    const data = snapshot.val() || {};
    callback({
      settlement_day: data.settlement_day !== undefined ? (Number(data.settlement_day) || 1) : 1,
      mode: data.mode === 'flexible' ? 'flexible' : 'fixed',
      estimated_income: data.estimated_income !== undefined ? (Number(data.estimated_income) || 10000000) : 10000000
    });
  }, (error) => {
    console.warn('Error subscribing to settlement config:', error);
    callback({ settlement_day: 1, mode: 'fixed', estimated_income: 10000000 });
  });
};

export const updateSettlementConfig = (uid: string, config: { settlement_day?: number; mode?: 'fixed' | 'flexible'; estimated_income?: number }) => {
  const refPath = ref(db, `settlement_config/${uid}`);
  return update(refPath, {
    ...config,
    updated_at: new Date().getTime()
  });
};

export const subscribeToCustomCycles = (uid: string, callback: (cycles: CustomCycle[]) => void) => {
  const refPath = ref(db, `custom_cycles/${uid}`);
  return onValue(refPath, (snapshot) => {
    const data = snapshot.val();
    if (!data) return callback([]);
    const formatted = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    callback(formatted.sort((a, b) => Number(b.start_date || 0) - Number(a.start_date || 0)));
  }, (error) => {
    console.warn('Error subscribing to custom cycles:', error);
    callback([]);
  });
};

export const addCustomCycle = async (uid: string, cycle: Omit<CustomCycle, 'id'>) => {
  const listRef = ref(db, `custom_cycles/${uid}`);
  const newRef = push(listRef);
  await set(newRef, cycle);
  return { id: newRef.key!, ...cycle };
};

export const updateCustomCycle = (uid: string, id: string, cycle: Partial<CustomCycle>) => {
  const itemRef = ref(db, `custom_cycles/${uid}/${id}`);
  return update(itemRef, cycle);
};

export const deleteCustomCycle = (uid: string, id: string) => {
  const itemRef = ref(db, `custom_cycles/${uid}/${id}`);
  return remove(itemRef);
};

export const subscribeToSavings = (uid: string, callback: (data: SavingTransaction[]) => void) => {
  const savingsRef = ref(db, `savings/${uid}`);
  return onValue(savingsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return callback([]);
    const formatted = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    callback(formatted.sort((a, b) => Number(b.date || 0) - Number(a.date || 0))); // descending date order
  }, (error) => {
    console.warn('Error subscribing to savings:', error);
    callback([]);
  });
};

export const addSavingTransaction = (uid: string, transaction: Omit<SavingTransaction, 'id'>) => {
  const listRef = ref(db, `savings/${uid}`);
  const newRef = push(listRef);
  return set(newRef, transaction);
};

export const updateSavingTransaction = (uid: string, id: string, transaction: Partial<SavingTransaction>) => {
  const itemRef = ref(db, `savings/${uid}/${id}`);
  return update(itemRef, transaction);
};

export const deleteSavingTransaction = (uid: string, id: string) => {
  const itemRef = ref(db, `savings/${uid}/${id}`);
  return remove(itemRef);
};
