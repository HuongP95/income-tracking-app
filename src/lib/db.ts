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
  const budgetsMap: Record<string, Budget> = {};

  const emit = () => {
    callback(Object.values(budgetsMap));
  };

  const processSnapshot = (data: any) => {
    if (!data || typeof data !== 'object') return;
    Object.keys(data).forEach(key => {
      const item = data[key];
      if (!item) return;
      
      let catId = '';
      if (typeof item === 'object') {
        catId = item.category_id || item.categoryId || item.id || key;
      } else if (typeof item === 'number') {
        catId = key;
      }

      if (!catId) return;

      const limitAmount = typeof item === 'object' 
        ? Number(item.limit_amount || item.limit || item.amount || item.budget || 0)
        : Number(item || 0);

      const percentage = typeof item === 'object'
        ? Number(item.percentage || item.percent || 0)
        : 0;

      if (!budgetsMap[catId] || (limitAmount > 0 && (budgetsMap[catId].limit_amount === 0 || !budgetsMap[catId].limit_amount))) {
        budgetsMap[catId] = {
          category_id: catId,
          limit_amount: limitAmount,
          percentage: percentage
        };
      } else if (budgetsMap[catId]) {
        // Update existing if new value has limit
        if (limitAmount > 0) {
          budgetsMap[catId].limit_amount = limitAmount;
        }
        if (percentage > 0) {
          budgetsMap[catId].percentage = percentage;
        }
      }
    });
    emit();
  };

  // 1. Primary path: budgets/${uid}
  const refBudgets = ref(db, `budgets/${uid}`);
  const unsubBudgets = onValue(refBudgets, (snapshot) => {
    processSnapshot(snapshot.val());
  }, (error) => {
    console.warn('Error subscribing to budgets:', error);
  });

  // 2. Singular fallback path: budget/${uid}
  let unsubBudgetSingular: (() => void) | null = null;
  try {
    const refBudgetSingular = ref(db, `budget/${uid}`);
    unsubBudgetSingular = onValue(refBudgetSingular, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
  } catch (e) {}

  // 3. Monthly plans embedded budgets: monthly_plans/${uid}/budgets
  let unsubMonthlyPlansBudgets: (() => void) | null = null;
  try {
    const refPlansBudgets = ref(db, `monthly_plans/${uid}/budgets`);
    unsubMonthlyPlansBudgets = onValue(refPlansBudgets, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
  } catch (e) {}

  // 4. Categories with embedded limit_amount: categories/${uid}
  let unsubCategories: (() => void) | null = null;
  try {
    const refCats = ref(db, `categories/${uid}`);
    unsubCategories = onValue(refCats, (snapshot) => {
      const catData = snapshot.val();
      if (catData && typeof catData === 'object') {
        Object.keys(catData).forEach(catId => {
          const cat = catData[catId];
          if (cat && (cat.limit_amount || cat.budget || cat.limit)) {
            const lim = Number(cat.limit_amount || cat.budget || cat.limit || 0);
            if (lim > 0 && (!budgetsMap[catId] || !budgetsMap[catId].limit_amount)) {
              budgetsMap[catId] = {
                category_id: catId,
                limit_amount: lim,
                percentage: Number(cat.percentage || 0)
              };
            }
          }
        });
        emit();
      }
    }, () => {});
  } catch (e) {}

  return () => {
    unsubBudgets();
    if (unsubBudgetSingular) unsubBudgetSingular();
    if (unsubMonthlyPlansBudgets) unsubMonthlyPlansBudgets();
    if (unsubCategories) unsubCategories();
  };
};

export const subscribeToDebts = (uid: string, callback: (data: DebtInstallment[]) => void) => {
  let debtsMap: Record<string, DebtInstallment> = {};
  let unsub2: (() => void) | null = null;

  const debtsRef = ref(db, `debts/${uid}`);
  const unsub1 = onValue(debtsRef, (snapshot) => {
    const data = snapshot.val() || {};
    Object.keys(data).forEach(key => {
      debtsMap[key] = { id: key, ...data[key] };
    });
    callback(Object.values(debtsMap));
  }, (error) => {
    console.warn('Error subscribing to debts:', error);
  });

  // Also check debts_installments for legacy data
  try {
    const legacyRef = ref(db, `debts_installments/${uid}`);
    unsub2 = onValue(legacyRef, (snapshot) => {
      const data = snapshot.val() || {};
      Object.keys(data).forEach(key => {
        if (!debtsMap[key]) {
          debtsMap[key] = { id: key, ...data[key] };
        }
      });
      callback(Object.values(debtsMap));
    }, () => {});
  } catch (e) {}

  return () => {
    unsub1();
    if (unsub2) unsub2();
  };
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

export const setBudget = async (uid: string, categoryId: string, budget: Omit<Budget, 'category_id'>) => {
  if (!uid || !categoryId) return;

  const limitAmount = Math.max(0, Number(budget.limit_amount) || 0);
  const percentage = Math.max(0, Math.min(100, Number(budget.percentage) || 0));

  const cleanBudget = {
    limit_amount: limitAmount,
    percentage: percentage,
    category_id: categoryId,
    updated_at: Date.now()
  };

  let writeSuccess = false;

  // Try writing to budgets/${uid}/${categoryId}
  try {
    const itemRef = ref(db, `budgets/${uid}/${categoryId}`);
    await set(itemRef, cleanBudget);
    writeSuccess = true;
  } catch (e) {
    console.warn('Could not write to budgets path, trying fallback paths...', e);
  }

  // Also write to fallback path budget/${uid}/${categoryId}
  try {
    const fallbackRef = ref(db, `budget/${uid}/${categoryId}`);
    await set(fallbackRef, cleanBudget);
    writeSuccess = true;
  } catch (e) {}

  // Also write to monthly_plans/${uid}/budgets/${categoryId}
  try {
    const planRef = ref(db, `monthly_plans/${uid}/budgets/${categoryId}`);
    await set(planRef, cleanBudget);
    writeSuccess = true;
  } catch (e) {}

  // Also update category limit directly in categories/${uid}/${categoryId}
  try {
    const catItemRef = ref(db, `categories/${uid}/${categoryId}`);
    await update(catItemRef, { 
      limit_amount: limitAmount,
      budget: limitAmount,
      percentage: percentage 
    });
    writeSuccess = true;
  } catch (e) {}

  if (!writeSuccess) {
    throw new Error('Không thể lưu ngân sách vào máy chủ.');
  }
};

export const addDebt = async (uid: string, debt: Omit<DebtInstallment, 'id'>) => {
  const cleanDebt = {
    name: String(debt.name || '').trim(),
    total_amount: Number(debt.total_amount) || 0,
    paid_amount: Number(debt.paid_amount) || 0,
    monthly_payment: Number(debt.monthly_payment) || 0,
    term_months: Number(debt.term_months) || 1,
    start_date: Number(debt.start_date) || Date.now(),
    type: debt.type === 'loan' ? 'loan' : debt.type === 'installment' ? 'installment' : 'debt'
  };

  try {
    const listRef = ref(db, `debts/${uid}`);
    const newRef = push(listRef);
    await set(newRef, cleanDebt);
    return newRef;
  } catch (err: any) {
    if (err?.code === 'PERMISSION_DENIED' || err?.message?.includes('Permission denied')) {
      // Try fallback to debts_installments
      const legacyListRef = ref(db, `debts_installments/${uid}`);
      const newLegacyRef = push(legacyListRef);
      await set(newLegacyRef, cleanDebt);
      return newLegacyRef;
    }
    throw err;
  }
};

export const updateDebt = async (uid: string, id: string, debt: Partial<DebtInstallment>) => {
  const cleanDebt: any = {};
  if (debt.name !== undefined) cleanDebt.name = String(debt.name).trim();
  if (debt.total_amount !== undefined) cleanDebt.total_amount = Number(debt.total_amount) || 0;
  if (debt.paid_amount !== undefined) cleanDebt.paid_amount = Number(debt.paid_amount) || 0;
  if (debt.monthly_payment !== undefined) cleanDebt.monthly_payment = Number(debt.monthly_payment) || 0;
  if (debt.term_months !== undefined) cleanDebt.term_months = Number(debt.term_months) || 1;
  if (debt.start_date !== undefined) cleanDebt.start_date = Number(debt.start_date) || Date.now();
  if (debt.type !== undefined) cleanDebt.type = debt.type === 'loan' ? 'loan' : debt.type === 'installment' ? 'installment' : 'debt';

  try {
    const itemRef = ref(db, `debts/${uid}/${id}`);
    await update(itemRef, cleanDebt);
  } catch (err: any) {
    const legacyItemRef = ref(db, `debts_installments/${uid}/${id}`);
    await update(legacyItemRef, cleanDebt);
  }
};

export const deleteDebt = async (uid: string, id: string) => {
  try {
    const itemRef = ref(db, `debts/${uid}/${id}`);
    await remove(itemRef);
  } catch (err) {}
  try {
    const legacyItemRef = ref(db, `debts_installments/${uid}/${id}`);
    await remove(legacyItemRef);
  } catch (err) {}
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
