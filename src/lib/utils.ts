import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { startOfDay, addMonths, subMonths, format } from 'date-fns';
import { CustomCycle } from '../types';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatCurrency(amount: number) {
  return new Intl.NumberFormat('vi-VN').format(amount) + ' VND';
}

export function formatNumberInput(value: string | number): string {
  if (value === undefined || value === null || value === '') return '';
  const clean = String(value).replace(/\D/g, '');
  if (!clean) return '';
  return parseInt(clean, 10).toLocaleString('en-US');
}

export function parseNumberInput(value: string): number {
  if (!value) return 0;
  return parseFloat(value.replace(/,/g, '')) || 0;
}

export function getSettlementPeriod(settlementDay: number, date: Date = new Date()) {
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
  config: { settlement_day: number; mode: 'fixed' | 'flexible' },
  customCycles: CustomCycle[],
  referenceDate: Date = new Date()
) {
  if (config.mode === 'flexible' && customCycles.length > 0) {
    const refTime = referenceDate.getTime();
    const sorted = [...customCycles].sort((a, b) => b.start_date - a.start_date);
    
    // Find the cycle that contains referenceDate
    let activeCycle = sorted.find(c => {
      const start = c.start_date;
      const end = c.end_date || Infinity;
      return refTime >= start && refTime <= end;
    });

    if (!activeCycle) {
      // Fallback to the latest/current cycle
      activeCycle = sorted[0];
    }

    if (activeCycle) {
      const start = startOfDay(new Date(activeCycle.start_date));
      const end = activeCycle.end_date 
        ? new Date(activeCycle.end_date)
        : new Date(addMonths(start, 1).getTime() - 1); // fallback to 1 month later if not closed yet
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

  // Fallback to standard monthly settlement day
  const { start, end } = getSettlementPeriod(config.settlement_day, referenceDate);
  return { start, end, isCustom: false };
}
