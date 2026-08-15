import { Component, ErrorInfo, ReactNode } from 'react';
import { RefreshCw, AlertCircle } from 'lucide-react';

interface Props {
  children?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public override state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public override componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('Uncaught error in app:', error, errorInfo);
  }

  private handleReload = () => {
    window.location.reload();
  };

  public override render() {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen w-full flex-col items-center justify-center bg-gradient-to-b from-[#FFFDF9] via-[#FFF9F2] to-[#FFF3E3] p-6 text-center font-sans text-slate-800">
          <div className="w-full max-w-md rounded-3xl bg-white p-8 shadow-xl border-4 border-[#FFF2D8] flex flex-col items-center">
            <div className="w-16 h-16 rounded-full bg-rose-100 flex items-center justify-center text-rose-500 mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-slate-900 tracking-tight">
              Ối! Đã có chút sự cố xảy ra rồi 😿
            </h2>
            <p className="mt-2 text-xs text-amber-800/80 font-medium leading-relaxed">
              Bé Coin xin lỗi nha! Vui lòng bấm nút dưới đây để tải lại trang hoặc kiểm tra kết nối mạng nhé.
            </p>
            {this.state.error?.message && (
              <div className="mt-4 w-full p-3 bg-rose-50 rounded-xl text-[11px] font-mono text-rose-700 text-left overflow-auto max-h-24">
                {this.state.error.message}
              </div>
            )}
            <button
              onClick={this.handleReload}
              className="mt-6 flex items-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFD000] to-[#FFB700] hover:from-[#FFD61A] hover:to-[#FFC41A] px-6 py-3.5 text-sm font-black text-amber-950 shadow-md border-b-4 border-amber-600 transition-all cursor-pointer"
            >
              <RefreshCw className="w-4 h-4" />
              <span>Tải lại trang ngay 🐾</span>
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
