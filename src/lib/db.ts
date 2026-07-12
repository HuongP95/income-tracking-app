import { db } from '../firebase';
import { ref, set, push, onValue, remove, update } from 'firebase/database';
import { Transaction, Category, Budget, DebtInstallment, CustomCycle } from '../types';

export const subscribeToTransactions = (uid: string, callback: (data: Transaction[]) => void) => {
  const transactionsRef = ref(db, `transactions/${uid}`);
  return onValue(transactionsRef, (snapshot) => {
    const data = snapshot.val();
    if (!data) return callback([]);
    const formatted = Object.keys(data).map(key => ({ id: key, ...data[key] }));
    callback(formatted.sort((a, b) => b.date - a.date)); // descending
  });
};

export const subscribeToCategories = (uid: string, callback: (data: Category[]) => void) => {
  const refPath = ref(db, `categories/${uid}`);
  return onValue(refPath, (snapshot) => {
    const data = snapshot.val();
    if (!data) return callback([]);
    callback(Object.keys(data).map(key => ({ id: key, ...data[key] })));
  });
};

export const subscribeToBudgets = (uid: string, callback: (data: Budget[]) => void) => {
  const refPath = ref(db, `budgets/${uid}`);
  return onValue(refPath, (snapshot) => {
    const data = snapshot.val();
    if (!data) return callback([]);
    callback(Object.keys(data).map(key => ({ category_id: key, ...data[key] })));
  });
};

export const subscribeToDebts = (uid: string, callback: (data: DebtInstallment[]) => void) => {
  const refPath = ref(db, `debts_installments/${uid}`);
  return onValue(refPath, (snapshot) => {
    const data = snapshot.val();
    if (!data) return callback([]);
    callback(Object.keys(data).map(key => ({ id: key, ...data[key] })));
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
      callback(data.settlement_day);
    } else {
      callback(1); // default to 1st of the month
    }
  });
};

export const updateSettlementDay = (uid: string, day: number) => {
  const refPath = ref(db, `settlement_config/${uid}`);
  return update(refPath, { settlement_day: day, updated_at: new Date().getTime() });
};

export const subscribeToSettlementConfig = (uid: string, callback: (config: { settlement_day: number; mode: 'fixed' | 'flexible' }) => void) => {
  const refPath = ref(db, `settlement_config/${uid}`);
  return onValue(refPath, (snapshot) => {
    const data = snapshot.val() || {};
    callback({
      settlement_day: data.settlement_day !== undefined ? data.settlement_day : 1,
      mode: data.mode || 'fixed'
    });
  });
};

export const updateSettlementConfig = (uid: string, config: { settlement_day?: number; mode: 'fixed' | 'flexible' }) => {
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
    callback(formatted.sort((a, b) => b.start_date - a.start_date));
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
