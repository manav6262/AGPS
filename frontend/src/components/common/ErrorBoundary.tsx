import { Component, ErrorInfo, ReactNode } from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  public state: State = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error('AGPS UI Uncaught Error:', error, errorInfo);
  }

  public handleReset = () => {
    this.setState({ hasError: false, error: null });
    window.location.reload();
  };

  public render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-[400px] flex items-center justify-center p-6">
          <div className="gov-panel max-w-lg w-full border-status-failedBorder bg-status-failedBg/20 space-y-4 p-6 text-center">
            <div className="w-10 h-10 rounded-full bg-[#FEF2F2] border border-[#FECACA] flex items-center justify-center mx-auto text-[#B91C1C]">
              <AlertCircle className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-base font-bold text-stone-900">
                Application Interface Error Encountered
              </h2>
              <p className="text-xs text-stone-600 mt-1">
                An unexpected condition occurred while rendering this procurement view. Your audit session remains cryptographically secure.
              </p>
            </div>

            {this.state.error && (
              <div className="bg-white p-3 rounded-sm border border-stone-300 text-left font-mono text-[11px] text-status-failedText overflow-x-auto">
                {this.state.error.message}
              </div>
            )}

            <div>
              <button
                onClick={this.handleReset}
                className="btn-primary text-xs inline-flex items-center gap-1.5 px-4 py-2"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Reload Application View</span>
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
