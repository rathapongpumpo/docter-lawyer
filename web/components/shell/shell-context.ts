'use client';
import { createContext, useContext } from 'react';

export type ShellRole = 'guest' | 'member' | 'editor' | 'reviewer' | 'admin';
export type ShellUser = { id: string; name: string; isGuest: boolean; role: ShellRole };
export const ShellContext = createContext<{ user: ShellUser }>({ user: { id: '', name: '', isGuest: true, role: 'guest' } });
export const useShell = () => useContext(ShellContext);
