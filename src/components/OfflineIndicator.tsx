import React from 'react';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

export const OfflineIndicator: React.FC = () => {
  const isOnline = useOnlineStatus();

  if (isOnline) return null;

  return (
    <div className="fixed bottom-[80px] md:bottom-4 left-4 z-[100] flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-medium text-white shadow-lg">
      <span className="h-2 w-2 rounded-full bg-white animate-pulse" />
      Chế độ ngoại tuyến (Sử dụng dữ liệu tạm)
    </div>
  );
};
