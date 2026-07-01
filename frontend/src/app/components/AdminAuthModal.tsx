'use client';

import React, { useState } from 'react';
import { Lock, X, Eye, EyeOff, Loader2 } from 'lucide-react';
import { verifyAdminPassword } from '../../lib/api';

interface AdminAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export default function AdminAuthModal({ isOpen, onClose, onSuccess }: AdminAuthModalProps) {
  const [password, setPassword] = useState('');
  const [rememberSession, setRememberSession] = useState(true);
  const [rememberDevice, setRememberDevice] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim()) {
      setError('Password is required');
      return;
    }

    setIsSaving(true);
    setError('');

    try {
      const isValid = await verifyAdminPassword(password);
      if (isValid) {
        if (rememberDevice) {
          localStorage.setItem('admin_authenticated', 'true');
          sessionStorage.setItem('admin_authenticated', 'true');
        } else if (rememberSession) {
          sessionStorage.setItem('admin_authenticated', 'true');
          localStorage.removeItem('admin_authenticated');
        } else {
          sessionStorage.removeItem('admin_authenticated');
          localStorage.removeItem('admin_authenticated');
        }
        // Let's also trigger an event so other parts of the app know immediately
        window.dispatchEvent(new Event('admin_auth_changed'));
        onSuccess();
        onClose();
      } else {
        setError('Incorrect password. Please try again.');
      }
    } catch (err) {
      console.error(err);
      setError('An error occurred during verification');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-9999 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-2xl max-w-sm w-full overflow-hidden animate-in zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="flex justify-between items-center px-5 py-4 border-b border-slate-100 bg-slate-50">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-50 text-indigo-600 rounded-lg">
              <Lock size={16} />
            </div>
            <h3 className="font-extrabold text-slate-800 text-sm">Security Verification</h3>
          </div>
          <button 
            onClick={onClose} 
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-150 transition cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <p className="text-xs text-slate-500 leading-relaxed">
            This operation is protected. Please enter the Administrator password to authorize changes.
          </p>

          <div className="space-y-1.5">
            <label className="text-[10px] font-black text-slate-400 uppercase tracking-wider block">Admin Password</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Enter admin password"
                className="w-full text-xs border border-slate-200 rounded-xl px-3.5 py-2.5 pr-10 focus:outline-none focus:ring-2 focus:ring-indigo-100 focus:border-indigo-500 transition"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition"
              >
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {error && (
            <div className="p-2.5 bg-rose-50 border border-rose-150 text-[11px] font-semibold text-rose-600 rounded-xl">
              {error}
            </div>
          )}

          {/* Remember Checkboxes */}
          <div className="flex flex-col gap-2 pt-1">
            <label className="flex items-center gap-2 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={rememberSession}
                onChange={(e) => {
                  setRememberSession(e.target.checked);
                  if (!e.target.checked) setRememberDevice(false);
                }}
                className="w-3.5 h-3.5 border-slate-355 rounded text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-[11px] font-semibold text-slate-500">Remember for this session</span>
            </label>
            <label className="flex items-center gap-2 select-none cursor-pointer">
              <input
                type="checkbox"
                checked={rememberDevice}
                onChange={(e) => {
                  setRememberDevice(e.target.checked);
                  if (e.target.checked) setRememberSession(true);
                }}
                className="w-3.5 h-3.5 border-slate-355 rounded text-indigo-600 focus:ring-0 focus:ring-offset-0 cursor-pointer"
              />
              <span className="text-[11px] font-semibold text-slate-550">Keep me logged in on this device</span>
            </label>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2 text-xs font-bold text-slate-500 bg-white border border-slate-200 hover:bg-slate-50 transition rounded-xl cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex-1 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 transition rounded-xl shadow-sm flex items-center justify-center gap-1.5 cursor-pointer"
            >
              {isSaving && <Loader2 size={13} className="animate-spin" />}
              {isSaving ? 'Verifying...' : 'Authorize'}
            </button>
          </div>
        </form>

      </div>
    </div>
  );
}
