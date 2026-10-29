import { Briefcase, Building2, Car, Gavel, Handshake, Heart, House, IdCard, Landmark, Lightbulb, Library, Receipt, Scale, ScrollText, ShieldCheck, ShoppingCart, Users, Wallet, type LucideIcon } from 'lucide-react';

// Icon per top-level category code (taxonomy in docs/knowledge-base/taxonomy.yaml); unknown codes get the library icon.
const ICONS: Record<string, LucideIcon> = {
  FOUND: Landmark, PERSON: Users, CONTRACT: Handshake, PROPERTY: House, FAMILY: Heart, INHERIT: ScrollText,
  CRIMINAL: Gavel, LABOR: Briefcase, CONSUMER: ShoppingCart, BUSINESS: Building2, TAX: Receipt, ADMIN: Landmark,
  DIGITAL: ShieldCheck, TRAFFIC: Car, IP: Lightbulb, DEBT: Wallet, PROCEDURE: Scale, CIVREG: IdCard,
};

export const categoryIcon = (code: string): LucideIcon => ICONS[code] ?? Library;
