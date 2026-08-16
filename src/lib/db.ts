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

export const isIncomeCategory = (cat: Category | { name?: string; type?: string; id?: string }) => {
  if (!cat) return false;
  const type = (cat.type || '').toLowerCase().trim();
  const name = (cat.name || '').toLowerCase().trim();
  if (type === 'income') return true;
  return (
    name === 'lương' ||
    name === 'luong' ||
    name.includes('tiền lương') ||
    name.includes('tien luong') ||
    name.includes('lương') ||
    name.includes('luong') ||
    name.includes('thu nhập') ||
    name.includes('thu nhap') ||
    name.includes('thưởng') ||
    name.includes('thuong') ||
    name.includes('salary') ||
    name.includes('income') ||
    name.includes('wage') ||
    name.includes('bonus')
  );
};

export const isExpenseCategory = (cat: Category | { name?: string; type?: string; id?: string }) => {
  if (!cat) return false;
  if (isIncomeCategory(cat)) return false;
  const name = (cat.name || '').toLowerCase().trim();
  if (name === 'đi chợ' || name === 'di cho' || name.includes('đi chợ')) return false;
  return true;
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
    // Filter out and auto delete any 'Đi chợ' category, auto-correct income categories
    const filtered = list.filter(cat => {
      const isDiCho = cat.name && (cat.name.trim().toLowerCase() === 'đi chợ' || cat.name.trim().toLowerCase() === 'di cho');
      if (isDiCho && cat.id) {
        deleteCategory(uid, cat.id).catch(() => {});
        return false;
      }
      // If category is an Income category (e.g. Tiền lương), ensure its type is 'income'
      if (isIncomeCategory(cat) && cat.type !== 'income' && cat.id) {
        cat.type = 'income';
        update(ref(db, `categories/${uid}/${cat.id}`), { type: 'income', limit_amount: 0, budget: 0, percentage: 0 }).catch(() => {});
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
  if (!uid) {
    callback([]);
    return () => {};
  }

  const localKey = `finly_budgets_${uid}`;
  const cachedBudgets: Budget[] = getLocalJSON(localKey, []);

  const budgetsMap: Record<string, Budget> = {};
  cachedBudgets.forEach(b => {
    if (b.category_id) budgetsMap[b.category_id] = b;
  });

  const emit = () => {
    const list = Object.values(budgetsMap);
    setLocalJSON(localKey, list);
    callback(list);
  };

  // Immediate emit from cache
  emit();

  let unsubs: (() => void)[] = [];

  const processSnapshot = (data: any) => {
    if (!data || typeof data !== 'object') return;
    let hasChanged = false;

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
        ? Number(item.limit_amount !== undefined ? item.limit_amount : (item.limit !== undefined ? item.limit : (item.amount !== undefined ? item.amount : (item.budget !== undefined ? item.budget : 0))))
        : Number(item || 0);

      const percentage = typeof item === 'object'
        ? Number(item.percentage || item.percent || 0)
        : 0;

      if (!budgetsMap[catId] || budgetsMap[catId].limit_amount !== limitAmount || budgetsMap[catId].percentage !== percentage) {
        budgetsMap[catId] = {
          category_id: catId,
          limit_amount: limitAmount,
          percentage: percentage
        };
        hasChanged = true;
      }
    });

    if (hasChanged) {
      emit();
    }
  };

  // 1. Categories with embedded limits: categories/${uid} (always permitted)
  try {
    const refCats = ref(db, `categories/${uid}`);
    const unsubCategories = onValue(refCats, (snapshot) => {
      const catData = snapshot.val();
      if (catData && typeof catData === 'object') {
        let hasChanged = false;
        Object.keys(catData).forEach(catId => {
          const cat = catData[catId];
          if (cat && (cat.limit_amount !== undefined || cat.budget !== undefined || cat.limit !== undefined)) {
            const lim = Number(cat.limit_amount !== undefined ? cat.limit_amount : (cat.budget !== undefined ? cat.budget : (cat.limit !== undefined ? cat.limit : 0)));
            const pct = Number(cat.percentage || 0);
            if (!budgetsMap[catId] || budgetsMap[catId].limit_amount !== lim || budgetsMap[catId].percentage !== pct) {
              budgetsMap[catId] = {
                category_id: catId,
                limit_amount: lim,
                percentage: pct
              };
              hasChanged = true;
            }
          }
        });
        if (hasChanged) emit();
      }
    }, () => {});
    unsubs.push(unsubCategories);
  } catch (e) {}

  // 2. Monthly plans embedded budgets: monthly_plans/${uid}/budgets
  try {
    const refPlans = ref(db, `monthly_plans/${uid}/budgets`);
    const unsubMonthlyPlans = onValue(refPlans, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsubMonthlyPlans);
  } catch (e) {}

  // 3. User root: users/${uid}/budgets
  try {
    const refUserBudgets = ref(db, `users/${uid}/budgets`);
    const unsubUserBudgets = onValue(refUserBudgets, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsubUserBudgets);
  } catch (e) {}

  // 4. Primary path: budgets/${uid} (silent error handling if not permitted)
  try {
    const refBudgets = ref(db, `budgets/${uid}`);
    const unsubBudgets = onValue(refBudgets, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsubBudgets);
  } catch (e) {}

  // 5. Singular fallback path: budget/${uid}
  try {
    const refBudgetSingular = ref(db, `budget/${uid}`);
    const unsubBudgetSingular = onValue(refBudgetSingular, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsubBudgetSingular);
  } catch (e) {}

  return () => {
    unsubs.forEach(u => {
      try { u(); } catch (e) {}
    });
  };
};

export const subscribeToDebts = (uid: string, callback: (data: DebtInstallment[]) => void) => {
  if (!uid) {
    callback([]);
    return () => {};
  }

  const localKey = `finly_debts_${uid}`;
  const cachedDebts: DebtInstallment[] = getLocalJSON(localKey, []);

  const debtsMap: Record<string, DebtInstallment> = {};
  cachedDebts.forEach(d => {
    if (d.id) debtsMap[d.id] = d;
  });

  const emit = () => {
    const list = Object.values(debtsMap);
    setLocalJSON(localKey, list);
    callback(list);
  };

  // Immediate emit from cache
  emit();

  let unsubs: (() => void)[] = [];

  const processSnapshot = (data: any) => {
    if (!data || typeof data !== 'object') return;
    let hasChanged = false;
    Object.keys(data).forEach(key => {
      const item = data[key];
      if (item && typeof item === 'object') {
        debtsMap[key] = { id: key, ...item };
        hasChanged = true;
      }
    });
    if (hasChanged) emit();
  };

  // 1. debts/${uid}
  try {
    const debtsRef = ref(db, `debts/${uid}`);
    const unsub1 = onValue(debtsRef, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsub1);
  } catch (e) {}

  // 2. debts_installments/${uid}
  try {
    const legacyRef = ref(db, `debts_installments/${uid}`);
    const unsub2 = onValue(legacyRef, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsub2);
  } catch (e) {}

  // 3. monthly_plans/${uid}/debts
  try {
    const planDebtsRef = ref(db, `monthly_plans/${uid}/debts`);
    const unsub3 = onValue(planDebtsRef, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsub3);
  } catch (e) {}

  // 4. users/${uid}/debts
  try {
    const userDebtsRef = ref(db, `users/${uid}/debts`);
    const unsub4 = onValue(userDebtsRef, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsub4);
  } catch (e) {}

  return () => {
    unsubs.forEach(u => {
      try { u(); } catch (e) {}
    });
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

  const cleanBudget: Budget = {
    limit_amount: limitAmount,
    percentage: percentage,
    category_id: categoryId
  };

  // 1. Immediately update localStorage cache
  const localKey = `finly_budgets_${uid}`;
  const cachedBudgets: Budget[] = getLocalJSON(localKey, []);
  const remaining = cachedBudgets.filter(b => b.category_id !== categoryId);
  const updatedBudgets = [...remaining, cleanBudget];
  setLocalJSON(localKey, updatedBudgets);

  let writeSuccess = false;

  // 2. Update category limit directly in categories/${uid}/${categoryId} (always permitted)
  try {
    const catItemRef = ref(db, `categories/${uid}/${categoryId}`);
    await update(catItemRef, { 
      limit_amount: limitAmount,
      budget: limitAmount,
      percentage: percentage 
    });
    writeSuccess = true;
  } catch (e) {}

  // 3. Write to monthly_plans/${uid}/budgets/${categoryId}
  try {
    const planRef = ref(db, `monthly_plans/${uid}/budgets/${categoryId}`);
    await set(planRef, cleanBudget);
    writeSuccess = true;
  } catch (e) {}

  // 4. Write to users/${uid}/budgets/${categoryId}
  try {
    const userRef = ref(db, `users/${uid}/budgets/${categoryId}`);
    await set(userRef, cleanBudget);
    writeSuccess = true;
  } catch (e) {}

  // 5. Try writing to budgets/${uid}/${categoryId} (silent fallback)
  try {
    const itemRef = ref(db, `budgets/${uid}/${categoryId}`);
    await set(itemRef, cleanBudget);
    writeSuccess = true;
  } catch (e) {}

  // 6. Also write to fallback path budget/${uid}/${categoryId}
  try {
    const fallbackRef = ref(db, `budget/${uid}/${categoryId}`);
    await set(fallbackRef, cleanBudget);
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

// Helper for localStorage caching
const getLocalJSON = <T>(key: string, fallback: T): T => {
  try {
    const item = localStorage.getItem(key);
    return item ? JSON.parse(item) : fallback;
  } catch (e) {
    return fallback;
  }
};

const setLocalJSON = (key: string, value: any) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {}
};

export const subscribeToSettlementDay = (uid: string, callback: (day: number) => void) => {
  return subscribeToSettlementConfig(uid, (config) => {
    callback(config.settlement_day);
  });
};

export const updateSettlementDay = (uid: string, day: number) => {
  return updateSettlementConfig(uid, { settlement_day: day });
};

export const subscribeToSettlementConfig = (
  uid: string,
  callback: (config: { settlement_day: number; mode: 'fixed' | 'flexible'; estimated_income?: number }) => void
) => {
  if (!uid) {
    callback({ settlement_day: 1, mode: 'fixed', estimated_income: 10000000 });
    return () => {};
  }

  const localKey = `finly_settlement_config_${uid}`;
  const cached = getLocalJSON<{ settlement_day: number; mode: 'fixed' | 'flexible'; estimated_income: number }>(
    localKey,
    { settlement_day: 1, mode: 'fixed', estimated_income: 10000000 }
  );
  
  let currentConfig: { settlement_day: number; mode: 'fixed' | 'flexible'; estimated_income: number } = {
    settlement_day: Number(cached.settlement_day) || 1,
    mode: cached.mode === 'flexible' ? 'flexible' : 'fixed',
    estimated_income: Number(cached.estimated_income) || 10000000
  };
  // Initial emit from local cache for instant UI response
  callback(currentConfig);

  let unsubs: (() => void)[] = [];

  const handleConfigUpdate = (data: any) => {
    if (!data || typeof data !== 'object') return;
    let changed = false;
    if (data.settlement_day !== undefined) {
      currentConfig.settlement_day = Number(data.settlement_day) || 1;
      changed = true;
    }
    if (data.mode !== undefined) {
      currentConfig.mode = data.mode === 'flexible' ? 'flexible' : 'fixed';
      changed = true;
    }
    if (data.estimated_income !== undefined) {
      currentConfig.estimated_income = Number(data.estimated_income) || 10000000;
      changed = true;
    }
    if (changed) {
      setLocalJSON(localKey, currentConfig);
      callback({ ...currentConfig });
    }
  };

  // 1. Listen to monthly_plans/${uid}/settlement_config
  try {
    const refPlanConfig = ref(db, `monthly_plans/${uid}/settlement_config`);
    const unsub1 = onValue(refPlanConfig, (snapshot) => {
      handleConfigUpdate(snapshot.val());
    }, () => {});
    unsubs.push(unsub1);
  } catch (e) {}

  // 2. Listen to monthly_plans/${uid} directly (in case settlement_day is stored there)
  try {
    const refPlan = ref(db, `monthly_plans/${uid}`);
    const unsub2 = onValue(refPlan, (snapshot) => {
      const val = snapshot.val();
      if (val && typeof val === 'object') {
        if (val.settlement_day !== undefined || val.settlement_config) {
          handleConfigUpdate(val.settlement_config || { settlement_day: val.settlement_day });
        }
      }
    }, () => {});
    unsubs.push(unsub2);
  } catch (e) {}

  // 3. Listen to users/${uid}/settlement_config
  try {
    const refUserConfig = ref(db, `users/${uid}/settlement_config`);
    const unsub3 = onValue(refUserConfig, (snapshot) => {
      handleConfigUpdate(snapshot.val());
    }, () => {});
    unsubs.push(unsub3);
  } catch (e) {}

  // 4. Try root settlement_config/${uid} silently with error suppression
  try {
    const refRoot = ref(db, `settlement_config/${uid}`);
    const unsub4 = onValue(refRoot, (snapshot) => {
      handleConfigUpdate(snapshot.val());
    }, (err) => {
      // Silently ignore permission denied for undefined root paths
    });
    unsubs.push(unsub4);
  } catch (e) {}

  return () => {
    unsubs.forEach(u => {
      try { u(); } catch (e) {}
    });
  };
};

export const updateSettlementConfig = async (
  uid: string,
  config: { settlement_day?: number; mode?: 'fixed' | 'flexible'; estimated_income?: number }
) => {
  if (!uid) return;

  const localKey = `finly_settlement_config_${uid}`;
  const current = getLocalJSON(localKey, { settlement_day: 1, mode: 'fixed', estimated_income: 10000000 });
  const updated = {
    ...current,
    ...config,
    updated_at: Date.now()
  };
  setLocalJSON(localKey, updated);

  // 1. Write to users/${uid}/settlement_config (always authorized)
  try {
    const refUserConfig = ref(db, `users/${uid}/settlement_config`);
    await update(refUserConfig, updated);
  } catch (e) {}

  // 2. Also update monthly plan in users/${uid}
  try {
    const refUserPlan = ref(db, `users/${uid}/monthly_plan`);
    await update(refUserPlan, { 
      settlement_day: updated.settlement_day,
      planned_income: updated.estimated_income,
      updated_at: Date.now()
    });
  } catch (e) {}

  // 3. Try monthly_plans/${uid}/settlement_config silently
  try {
    const refPlanConfig = ref(db, `monthly_plans/${uid}/settlement_config`);
    await update(refPlanConfig, updated);
  } catch (e) {}

  // 4. Try root settlement_config/${uid} silently
  try {
    const refRoot = ref(db, `settlement_config/${uid}`);
    await update(refRoot, updated);
  } catch (e) {}
};

export const subscribeToMonthlyPlan = (
  uid: string,
  callback: (plan: { planned_income: number; planned_expense: number; settlement_day?: number }) => void
) => {
  if (!uid) {
    callback({ planned_income: 10000000, planned_expense: 0 });
    return () => {};
  }

  const localKey = `finly_monthly_plan_${uid}`;
  const cached = getLocalJSON<{ planned_income: number; planned_expense: number; settlement_day?: number }>(
    localKey,
    { planned_income: 10000000, planned_expense: 0 }
  );

  let currentPlan = {
    planned_income: Number(cached.planned_income) || 10000000,
    planned_expense: Number(cached.planned_expense) || 0,
    settlement_day: cached.settlement_day ? Number(cached.settlement_day) : undefined
  };

  callback({ ...currentPlan });

  let unsubs: (() => void)[] = [];

  const handlePlanUpdate = (data: any) => {
    if (!data || typeof data !== 'object') return;
    let changed = false;
    if (data.planned_income !== undefined) {
      currentPlan.planned_income = Number(data.planned_income) || 0;
      changed = true;
    }
    if (data.planned_expense !== undefined) {
      currentPlan.planned_expense = Number(data.planned_expense) || 0;
      changed = true;
    }
    if (data.settlement_day !== undefined) {
      currentPlan.settlement_day = Number(data.settlement_day) || 1;
      changed = true;
    }
    if (changed) {
      setLocalJSON(localKey, currentPlan);
      callback({ ...currentPlan });
    }
  };

  // 1. Primary path: users/${uid}/monthly_plan
  try {
    const userPlanRef = ref(db, `users/${uid}/monthly_plan`);
    const unsub1 = onValue(userPlanRef, (snapshot) => {
      handlePlanUpdate(snapshot.val());
    }, () => {});
    unsubs.push(unsub1);
  } catch (e) {}

  // 2. Also listen to users/${uid}/settlement_config for estimated_income
  try {
    const userConfigRef = ref(db, `users/${uid}/settlement_config`);
    const unsub2 = onValue(userConfigRef, (snapshot) => {
      const val = snapshot.val();
      if (val && val.estimated_income !== undefined) {
        handlePlanUpdate({ planned_income: val.estimated_income });
      }
    }, () => {});
    unsubs.push(unsub2);
  } catch (e) {}

  // 3. Fallback: monthly_plans/${uid} (silence error)
  try {
    const planRef = ref(db, `monthly_plans/${uid}`);
    const unsub3 = onValue(planRef, (snapshot) => {
      handlePlanUpdate(snapshot.val());
    }, () => {});
    unsubs.push(unsub3);
  } catch (e) {}

  return () => {
    unsubs.forEach(u => {
      try { u(); } catch (e) {}
    });
  };
};

export const updateMonthlyPlan = async (
  uid: string,
  plan: { planned_income?: number; planned_expense?: number; settlement_day?: number }
) => {
  if (!uid) return;

  const localKey = `finly_monthly_plan_${uid}`;
  const current = getLocalJSON<{ planned_income: number; planned_expense: number; settlement_day?: number }>(
    localKey,
    { planned_income: 10000000, planned_expense: 0 }
  );

  const updated = {
    ...current,
    ...plan,
    updated_at: Date.now()
  };
  setLocalJSON(localKey, updated);

  // 1. Always write to users/${uid}/monthly_plan first (authorized)
  try {
    const userPlanRef = ref(db, `users/${uid}/monthly_plan`);
    await update(userPlanRef, updated);
  } catch (e) {}

  // 2. If planned_income is provided, also sync to users/${uid}/settlement_config
  if (plan.planned_income !== undefined) {
    try {
      const userConfigRef = ref(db, `users/${uid}/settlement_config`);
      await update(userConfigRef, { estimated_income: Number(plan.planned_income) || 0, updated_at: Date.now() });
    } catch (e) {}
  }

  // 3. If settlement_day is provided, also sync to users/${uid}/settlement_config
  if (plan.settlement_day !== undefined) {
    try {
      const userConfigRef = ref(db, `users/${uid}/settlement_config`);
      await update(userConfigRef, { settlement_day: Number(plan.settlement_day) || 1, updated_at: Date.now() });
    } catch (e) {}
  }

  // 4. Try writing to monthly_plans/${uid} silently (catch permission error)
  try {
    const planRef = ref(db, `monthly_plans/${uid}`);
    await update(planRef, updated);
  } catch (e) {}
};

export const subscribeToCustomCycles = (uid: string, callback: (cycles: CustomCycle[]) => void) => {
  if (!uid) {
    callback([]);
    return () => {};
  }

  const localKey = `finly_custom_cycles_${uid}`;
  const cachedCycles: CustomCycle[] = getLocalJSON(localKey, []);
  
  const cyclesMap: Record<string, CustomCycle> = {};
  cachedCycles.forEach(c => {
    if (c.id) cyclesMap[c.id] = c;
  });

  const emit = () => {
    const list = Object.values(cyclesMap).sort((a, b) => Number(b.start_date || 0) - Number(a.start_date || 0));
    setLocalJSON(localKey, list);
    callback(list);
  };

  // Immediate emit from local cache
  emit();

  let unsubs: (() => void)[] = [];

  const processSnapshot = (data: any) => {
    if (!data || typeof data !== 'object') return;
    Object.keys(data).forEach(key => {
      const item = data[key];
      if (item && typeof item === 'object') {
        cyclesMap[key] = { id: key, ...item };
      }
    });
    emit();
  };

  // 1. Listen to monthly_plans/${uid}/custom_cycles
  try {
    const refPlanCycles = ref(db, `monthly_plans/${uid}/custom_cycles`);
    const unsub1 = onValue(refPlanCycles, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsub1);
  } catch (e) {}

  // 2. Listen to users/${uid}/custom_cycles
  try {
    const refUserCycles = ref(db, `users/${uid}/custom_cycles`);
    const unsub2 = onValue(refUserCycles, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsub2);
  } catch (e) {}

  // 3. Try root custom_cycles/${uid} silently with error suppression
  try {
    const refRoot = ref(db, `custom_cycles/${uid}`);
    const unsub3 = onValue(refRoot, (snapshot) => {
      processSnapshot(snapshot.val());
    }, (err) => {
      // Silently ignore permission denied for undefined root paths
    });
    unsubs.push(unsub3);
  } catch (e) {}

  return () => {
    unsubs.forEach(u => {
      try { u(); } catch (e) {}
    });
  };
};

export const addCustomCycle = async (uid: string, cycle: Omit<CustomCycle, 'id'>) => {
  if (!uid) return { id: Date.now().toString(), ...cycle };

  const id = `cycle_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cleanCycle: CustomCycle = {
    id,
    ...cycle
  };

  // Local storage update
  const localKey = `finly_custom_cycles_${uid}`;
  const cached: CustomCycle[] = getLocalJSON(localKey, []);
  setLocalJSON(localKey, [cleanCycle, ...cached]);

  // Try monthly_plans/${uid}/custom_cycles/${id}
  try {
    const refItem = ref(db, `monthly_plans/${uid}/custom_cycles/${id}`);
    await set(refItem, cycle);
  } catch (e) {}

  // Try users/${uid}/custom_cycles/${id}
  try {
    const refUserItem = ref(db, `users/${uid}/custom_cycles/${id}`);
    await set(refUserItem, cycle);
  } catch (e) {}

  // Try root custom_cycles/${uid}/${id}
  try {
    const refRoot = ref(db, `custom_cycles/${uid}/${id}`);
    await set(refRoot, cycle);
  } catch (e) {}

  return cleanCycle;
};

export const updateCustomCycle = async (uid: string, id: string, cycle: Partial<CustomCycle>) => {
  if (!uid || !id) return;

  // Local storage update
  const localKey = `finly_custom_cycles_${uid}`;
  const cached: CustomCycle[] = getLocalJSON(localKey, []);
  const updatedList = cached.map(c => c.id === id ? { ...c, ...cycle } : c);
  setLocalJSON(localKey, updatedList);

  // Try monthly_plans
  try {
    const refItem = ref(db, `monthly_plans/${uid}/custom_cycles/${id}`);
    await update(refItem, cycle);
  } catch (e) {}

  // Try users
  try {
    const refUserItem = ref(db, `users/${uid}/custom_cycles/${id}`);
    await update(refUserItem, cycle);
  } catch (e) {}

  // Try root
  try {
    const refRoot = ref(db, `custom_cycles/${uid}/${id}`);
    await update(refRoot, cycle);
  } catch (e) {}
};

export const deleteCustomCycle = async (uid: string, id: string) => {
  if (!uid || !id) return;

  // Local storage update
  const localKey = `finly_custom_cycles_${uid}`;
  const cached: CustomCycle[] = getLocalJSON(localKey, []);
  setLocalJSON(localKey, cached.filter(c => c.id !== id));

  // Try monthly_plans
  try {
    const refItem = ref(db, `monthly_plans/${uid}/custom_cycles/${id}`);
    await remove(refItem);
  } catch (e) {}

  // Try users
  try {
    const refUserItem = ref(db, `users/${uid}/custom_cycles/${id}`);
    await remove(refUserItem);
  } catch (e) {}

  // Try root
  try {
    const refRoot = ref(db, `custom_cycles/${uid}/${id}`);
    await remove(refRoot);
  } catch (e) {}
};

export const subscribeToSavings = (uid: string, callback: (data: SavingTransaction[]) => void) => {
  if (!uid) {
    callback([]);
    return () => {};
  }

  const localKey = `finly_savings_${uid}`;
  const cachedSavings: SavingTransaction[] = getLocalJSON(localKey, []);

  const savingsMap: Record<string, SavingTransaction> = {};
  cachedSavings.forEach(s => {
    if (s.id) savingsMap[s.id] = s;
  });

  const emit = () => {
    const list = Object.values(savingsMap).sort((a, b) => Number(b.date || 0) - Number(a.date || 0));
    setLocalJSON(localKey, list);
    callback(list);
  };

  // Immediate emit from cache
  emit();

  let unsubs: (() => void)[] = [];

  const processSnapshot = (data: any) => {
    if (!data || typeof data !== 'object') return;
    let hasChanged = false;
    Object.keys(data).forEach(key => {
      const item = data[key];
      if (item && typeof item === 'object') {
        savingsMap[key] = { id: key, ...item };
        hasChanged = true;
      }
    });
    if (hasChanged) emit();
  };

  // 1. savings/${uid}
  try {
    const savingsRef = ref(db, `savings/${uid}`);
    const unsub1 = onValue(savingsRef, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsub1);
  } catch (e) {}

  // 2. users/${uid}/savings
  try {
    const userSavingsRef = ref(db, `users/${uid}/savings`);
    const unsub2 = onValue(userSavingsRef, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsub2);
  } catch (e) {}

  // 3. monthly_plans/${uid}/savings
  try {
    const planSavingsRef = ref(db, `monthly_plans/${uid}/savings`);
    const unsub3 = onValue(planSavingsRef, (snapshot) => {
      processSnapshot(snapshot.val());
    }, () => {});
    unsubs.push(unsub3);
  } catch (e) {}

  return () => {
    unsubs.forEach(u => {
      try { u(); } catch (e) {}
    });
  };
};

export const addSavingTransaction = async (uid: string, transaction: Omit<SavingTransaction, 'id'>) => {
  const id = `saving_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const cleanItem: SavingTransaction = {
    id,
    ...transaction
  };

  const localKey = `finly_savings_${uid}`;
  const cached: SavingTransaction[] = getLocalJSON(localKey, []);
  setLocalJSON(localKey, [cleanItem, ...cached]);

  try {
    const listRef = ref(db, `savings/${uid}/${id}`);
    await set(listRef, transaction);
  } catch (e) {}

  try {
    const userRef = ref(db, `users/${uid}/savings/${id}`);
    await set(userRef, transaction);
  } catch (e) {}

  try {
    const planRef = ref(db, `monthly_plans/${uid}/savings/${id}`);
    await set(planRef, transaction);
  } catch (e) {}

  return cleanItem;
};

export const updateSavingTransaction = async (uid: string, id: string, transaction: Partial<SavingTransaction>) => {
  const localKey = `finly_savings_${uid}`;
  const cached: SavingTransaction[] = getLocalJSON(localKey, []);
  setLocalJSON(localKey, cached.map(s => s.id === id ? { ...s, ...transaction } : s));

  try {
    const itemRef = ref(db, `savings/${uid}/${id}`);
    await update(itemRef, transaction);
  } catch (e) {}

  try {
    const userRef = ref(db, `users/${uid}/savings/${id}`);
    await update(userRef, transaction);
  } catch (e) {}
};

export const deleteSavingTransaction = async (uid: string, id: string) => {
  const localKey = `finly_savings_${uid}`;
  const cached: SavingTransaction[] = getLocalJSON(localKey, []);
  setLocalJSON(localKey, cached.filter(s => s.id !== id));

  try {
    const itemRef = ref(db, `savings/${uid}/${id}`);
    await remove(itemRef);
  } catch (e) {}

  try {
    const userRef = ref(db, `users/${uid}/savings/${id}`);
    await remove(userRef);
  } catch (e) {}
};
