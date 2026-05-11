import { create } from "zustand";

// -- Auth Store ----------------------------------------------

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface AuthState {
  user: User | null;
  isLoading: boolean;
  setUser: (user: User | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  setUser: (user) => set({ user, isLoading: false }),
  setLoading: (isLoading) => set({ isLoading }),
}));

// -- Notebook Store ------------------------------------------

interface Notebook {
  id: string;
  user_id: string;
  title: string;
  subject: string | null;
  color: string;
  exam_date: string | null;
  created_at: string;
  updated_at: string;
}

interface NotebookState {
  notebooks: Notebook[];
  activeNotebook: Notebook | null;
  isLoading: boolean;
  setNotebooks: (notebooks: Notebook[]) => void;
  setActiveNotebook: (notebook: Notebook | null) => void;
  addNotebook: (notebook: Notebook) => void;
  removeNotebook: (id: string) => void;
  setLoading: (loading: boolean) => void;
}

export const useNotebookStore = create<NotebookState>((set) => ({
  notebooks: [],
  activeNotebook: null,
  isLoading: true,
  setNotebooks: (notebooks) => set({ notebooks, isLoading: false }),
  setActiveNotebook: (activeNotebook) => set({ activeNotebook }),
  addNotebook: (notebook) =>
    set((state) => ({ notebooks: [notebook, ...state.notebooks] })),
  removeNotebook: (id) =>
    set((state) => ({
      notebooks: state.notebooks.filter((n) => n.id !== id),
    })),
  setLoading: (isLoading) => set({ isLoading }),
}));

// -- Teacher Store ------------------------------------------─

import type { ClassAnalytics, ClassDetail, ClassListItem } from "./api";

interface TeacherState {
  classes: ClassListItem[];
  activeClass: ClassDetail | null;
  analytics: ClassAnalytics | null;
  isLoading: boolean;
  setClasses: (classes: ClassListItem[]) => void;
  addClass: (cls: ClassDetail) => void;
  removeClass: (id: string) => void;
  setActiveClass: (cls: ClassDetail | null) => void;
  setAnalytics: (data: ClassAnalytics | null) => void;
  setLoading: (loading: boolean) => void;
}

export const useTeacherStore = create<TeacherState>((set) => ({
  classes: [],
  activeClass: null,
  analytics: null,
  isLoading: false,
  setClasses: (classes) => set({ classes, isLoading: false }),
  addClass: (cls) =>
    set((state) => ({ classes: [cls, ...state.classes] })),
  removeClass: (id) =>
    set((state) => ({ classes: state.classes.filter((c) => c.id !== id) })),
  setActiveClass: (activeClass) => set({ activeClass }),
  setAnalytics: (analytics) => set({ analytics }),
  setLoading: (isLoading) => set({ isLoading }),
}));

