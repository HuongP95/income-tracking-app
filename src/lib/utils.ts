import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { startOfDay, addMonths, subMonths, format } from 'date-fns';
import { CustomCycle } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number | string | undefined | null) {
  const num = Number(amount);
  if (isNaN(num)) return '0 VND';
  return new Intl.NumberFormat('vi-VN').format(num) + ' VND';
}

export function formatNumberInput(value: string | number | undefined | null): string {
  if (value === undefined || value === null || value === '') return '';
  const clean = String(value).replace(/\D/g, '');
  if (!clean) return '';
  return parseInt(clean, 10).toLocaleString('en-US');
}

export function parseNumberInput(value: string | number | undefined | null): number {
  if (value === undefined || value === null || value === '') return 0;
  if (typeof value === 'number') return isNaN(value) ? 0 : value;
  return parseFloat(String(value).replace(/,/g, '')) || 0;
}

export function isDateWithinIntervalSafely(dateInput: any, start: Date, end: Date): boolean {
  try {
    if (!dateInput || !start || !end) return false;
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const time = d.getTime();
    const startTime = start.getTime();
    const endTime = end.getTime();
    if (isNaN(time) || isNaN(startTime) || isNaN(endTime)) return false;
    return time >= startTime && time <= endTime;
  } catch {
    return false;
  }
}

export function getSettlementPeriod(settlementDayInput: any, dateInput: any = new Date()) {
  let date: Date;
  try {
    date = dateInput instanceof Date && !isNaN(dateInput.getTime()) ? dateInput : new Date(dateInput);
    if (isNaN(date.getTime())) date = new Date();
  } catch {
    date = new Date();
  }

  let settlementDay = parseInt(String(settlementDayInput || 1), 10);
  if (isNaN(settlementDay) || settlementDay < 1 || settlementDay > 31) {
    settlementDay = 1;
  }

  let start: Date;
  let end: Date;

  const currentYear = date.getFullYear();
  const currentMonth = date.getMonth(); // 0-indexed
  const currentDay = date.getDate();

  if (currentDay >= settlementDay) {
    start = startOfDay(new Date(currentYear, currentMonth, settlementDay));
    const nextMonth = addMonths(start, 1);
    const nextYearNum = nextMonth.getFullYear();
    const nextMonthNum = nextMonth.getMonth();
    const nextSettlementDate = new Date(nextYearNum, nextMonthNum, settlementDay);
    end = new Date(nextSettlementDate.getTime() - 1);
  } else {
    const prevMonth = subMonths(new Date(currentYear, currentMonth, settlementDay), 1);
    const prevYearNum = prevMonth.getFullYear();
    const prevMonthNum = prevMonth.getMonth();
    
    start = startOfDay(new Date(prevYearNum, prevMonthNum, settlementDay));
    const currentSettlementDate = new Date(currentYear, currentMonth, settlementDay);
    end = new Date(currentSettlementDate.getTime() - 1);
  }

  return { start, end };
}

export function getCurrentPeriod(
  configInput?: { settlement_day?: number; mode?: 'fixed' | 'flexible' },
  customCycles: CustomCycle[] = [],
  referenceDate: any = new Date()
) {
  const config = {
    settlement_day: Number(configInput?.settlement_day) || 1,
    mode: configInput?.mode || 'fixed'
  };

  let refDate: Date;
  try {
    refDate = referenceDate instanceof Date && !isNaN(referenceDate.getTime()) ? referenceDate : new Date(referenceDate);
    if (isNaN(refDate.getTime())) refDate = new Date();
  } catch {
    refDate = new Date();
  }

  if (config.mode === 'flexible' && Array.isArray(customCycles) && customCycles.length > 0) {
    const refTime = refDate.getTime();
    const validCycles = customCycles.filter(c => c && c.start_date && !isNaN(Number(c.start_date)));
    const sorted = [...validCycles].sort((a, b) => Number(b.start_date) - Number(a.start_date));
    
    if (sorted.length > 0) {
      // Find the cycle that contains referenceDate
      let activeCycle = sorted.find(c => {
        const start = Number(c.start_date);
        const end = c.end_date ? Number(c.end_date) : Infinity;
        return refTime >= start && refTime <= end;
      });

      if (!activeCycle) {
        // Fallback to the latest/current cycle
        activeCycle = sorted[0];
      }

      if (activeCycle) {
        const start = startOfDay(new Date(Number(activeCycle.start_date)));
        const end = activeCycle.end_date 
          ? new Date(Number(activeCycle.end_date))
          : new Date(addMonths(start, 1).getTime() - 1);
        return { 
          start, 
          end, 
          isCustom: true, 
          cycleId: activeCycle.id, 
          cycleName: activeCycle.name || `Chu kỳ từ ${format(start, 'dd/MM')}`, 
          salaryAmount: activeCycle.salary_amount 
        };
      }
    }
  }

  // Fallback to standard monthly settlement day
  const { start, end } = getSettlementPeriod(config.settlement_day, refDate);
  return { start, end, isCustom: false };
}

