import { create } from 'zustand';

interface CompanyState {
  name_ar: string;
  name: string;
  phone: string;
  address: string;
  loaded: boolean;
  setCompany: (data: Partial<Omit<CompanyState, 'setCompany'>>) => void;
}

export const useCompanyStore = create<CompanyState>((set) => ({
  name_ar:  'نظام إدارة العقارات',
  name:     'Real Estate System',
  phone:    '',
  address:  '',
  loaded:   false,
  setCompany: (data) => set({ ...data, loaded: true }),
}));