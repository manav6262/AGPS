import React from 'react';
import { Outlet } from 'react-router-dom';
import { Header } from './Header.js';
import { Navbar } from './Navbar.js';

export const Layout: React.FC = () => {
  return (
    <div className="min-h-screen flex flex-col bg-stone-50 text-stone-800">
      <Header />
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <Outlet />
      </main>

      <footer className="bg-white border-t border-stone-300 py-4 mt-auto">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between text-xs text-stone-500 gap-2">
          <div className="flex items-center space-x-2">
            <span className="font-semibold text-stone-700">AGPS Core Platform</span>
            <span>•</span>
            <span>Automated Government Procurement & Cryptographic SAW Ranking</span>
          </div>
          <div className="font-mono text-[11px] text-stone-400">
            SHA-256 Immutable Audit Chain • IEEE / CPPP Compliant
          </div>
        </div>
      </footer>
    </div>
  );
};
