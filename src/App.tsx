import React, { useState, useMemo, useEffect } from 'react';
import {
  LayoutDashboard,
  Truck,
  Wrench,
  DollarSign,
  TrendingUp,
  TrendingDown,
  Plus,
  Trash2,
  X,
  Calculator,
  Scale,
  MapPin,
  ChevronDown,
  ChevronUp,
  Upload,
  Clock,
  CalendarDays,
  FileText
} from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer
} from 'recharts';
import { MapContainer, TileLayer, Marker, Popup, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { v4 as uuidv4 } from 'uuid';
import * as pdfjsLib from 'pdfjs-dist';

// pdf.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Fix leaflet default icons
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// === CONSTANTS ===
const COMPANY_DRIVER_RATE = 0.65;
const VEHICLE_VALUE = 85000;
const THREE_YEAR_MILES = 360000;
const CASCADIA_DEPR_RATE = VEHICLE_VALUE / THREE_YEAR_MILES;
const CASCADIA_MAINT_RESERVE = 0.15;
const MPG = 7.0; // actual reported MPG

// Tax constants (1099 self-employment)
const SE_TAX_RATE = 0.153; // 15.3% (SS 12.4% + Medicare 2.9%)
const FED_TAX_RATE = 0.12; // estimated federal bracket
const TOTAL_TAX_RATE = SE_TAX_RATE + FED_TAX_RATE; // ~27.3%

// Seasonal rate multipliers (spot market averages)
const SEASONAL_RATES: Record<string, { label: string; multiplier: number; months: string }> = {
  low: { label: 'Low Season (Feb-May)', multiplier: 0.85, months: '02,03,04,05' },
  mid: { label: 'Shoulder (Jun-Sep)', multiplier: 1.0, months: '06,07,08,09' },
  high: { label: 'Peak Season (Oct-Jan)', multiplier: 1.20, months: '10,11,12,01' },
};

// Regional diesel prices ($/gal, Feb 2026 estimates)
const REGIONAL_DIESEL: Record<string, { price: number; label: string }> = {
  'UT': { price: 3.80, label: 'Utah ($3.80/gal)' },
  'TX': { price: 3.40, label: 'Texas ($3.40/gal)' },
  'OH': { price: 3.60, label: 'Midwest/OH ($3.60/gal)' },
  'NV': { price: 4.10, label: 'Nevada ($4.10/gal)' },
  'CA': { price: 5.20, label: 'California ($5.20/gal)' },
  'PA': { price: 4.05, label: 'Pennsylvania ($4.05/gal)' },
  'NM': { price: 3.65, label: 'New Mexico ($3.65/gal)' },
  'AZ': { price: 3.75, label: 'Arizona ($3.75/gal)' },
  'CO': { price: 3.70, label: 'Colorado ($3.70/gal)' },
  'OK': { price: 3.35, label: 'Oklahoma ($3.35/gal)' },
  'AR': { price: 3.40, label: 'Arkansas ($3.40/gal)' },
  'TN': { price: 3.45, label: 'Tennessee ($3.45/gal)' },
  'IN': { price: 3.55, label: 'Indiana ($3.55/gal)' },
  'WV': { price: 3.70, label: 'West Virginia ($3.70/gal)' },
  'AVG': { price: 3.85, label: 'National Avg ($3.85/gal)' },
};

// Midpoint region mapping for multi-region fuel averaging
const ROUTE_MIDPOINTS: Record<string, string> = {
  'UT-TX': 'NM', 'TX-OH': 'TN', 'OH-NV': 'CO', 'NV-CA': 'NV',
  'CA-TX': 'AZ', 'TX-TX': 'TX', 'TX-PA': 'TN', 'TX-NV': 'NM',
  'OH-TX': 'TN', 'PA-TX': 'TN', 'NV-TX': 'NM',
};

// Fuel cost — averages origin, midpoint, and destination prices
const fuelCostForMiles = (miles: number, originRegion: string, destRegion?: string) => {
  const oPrice = REGIONAL_DIESEL[originRegion]?.price ?? REGIONAL_DIESEL['AVG'].price;
  if (!destRegion) return (miles / MPG) * oPrice;
  const dPrice = REGIONAL_DIESEL[destRegion]?.price ?? REGIONAL_DIESEL['AVG'].price;
  const midKey = `${originRegion}-${destRegion}`;
  const midRegion = ROUTE_MIDPOINTS[midKey] ?? 'AVG';
  const mPrice = REGIONAL_DIESEL[midRegion]?.price ?? REGIONAL_DIESEL['AVG'].price;
  const avgPrice = (oPrice + mPrice + dPrice) / 3;
  return (miles / MPG) * avgPrice;
};

// === TYPES ===
type Income = {
  id: string;
  date: string;
  loadId: string;
  broker: string;
  distance: number;
  ratePerMile: number;
  totalPayout: number;
  originCity?: string;
  destCity?: string;
  originCoords?: [number, number];
  destCoords?: [number, number];
  fuelRegion?: string;
  destFuelRegion?: string;
  deadheadMiles?: number;
  deadheadFrom?: string;
  departureTime?: string;
  arrivalTime?: string;
};

type Expense = {
  id: string;
  date: string;
  category: 'Fuel' | 'Maintenance' | 'Insurance' | 'Tolls' | 'Other' | 'Deadhead' | 'Permits' | 'Truck Payment' | 'Parking' | 'ELD' | 'Lumper' | 'IFTA' | 'Dispatch' | 'Lock Box' | 'Trailer' | 'Registration' | 'Food';
  description: string;
  amount: number;
};

type PersonalExpense = {
  id: string;
  category: string;
  description: string;
  monthlyAmount: number;
};

const INITIAL_PERSONAL: PersonalExpense[] = [
  { id: 'p1', category: 'Housing', description: 'House Payment', monthlyAmount: 2000 },
  { id: 'p2', category: 'Utilities', description: 'Utilities', monthlyAmount: 300 },
  { id: 'p3', category: 'Family', description: 'Afghanistan Family Support', monthlyAmount: 1000 },
  { id: 'p4', category: 'Phone', description: 'Mobile Phone', monthlyAmount: 100 },
  { id: 'p5', category: 'Food', description: 'Food & Groceries', monthlyAmount: 1200 },
  { id: 'p6', category: 'Clothing', description: 'Clothing', monthlyAmount: 200 },
  { id: 'p7', category: 'Debt', description: 'Debt Payments', monthlyAmount: 1000 },
];

// === PERSONAL DEBTS ===
type Debt = {
  id: string;
  to: string;
  amount: number;
  dateBorrowed: string;
  dueDate?: string;
  notes?: string;
};

const INITIAL_DEBTS: Debt[] = [
  { id: 'd1', to: 'Cousin', amount: 3500, dateBorrowed: '2023', dueDate: '2024', notes: 'Overdue' },
  { id: 'd2', to: 'Person in Afghanistan', amount: 4000, dateBorrowed: '2022', dueDate: '2023', notes: 'Oldest — overdue' },
  { id: 'd3', to: 'Fellow Truck Driver', amount: 4000, dateBorrowed: '2024', notes: '' },
  { id: 'd4', to: 'Person #4', amount: 1000, dateBorrowed: '2024', notes: '' },
  { id: 'd5', to: 'Person #5', amount: 2000, dateBorrowed: '2024', notes: '' },
];

// === REAL TRIP DATA ===
const INITIAL_TRIPS: Income[] = [
  {
    id: 't1', date: '2026-02-09',
    loadId: 'SLC-AUS-001', broker: 'Spot Market',
    distance: 1330, ratePerMile: 2700 / 1330, totalPayout: 2700,
    originCity: 'Salt Lake City, UT', destCity: 'Austin, TX',
    originCoords: [40.7608, -111.8910], destCoords: [30.2672, -97.7431],
    fuelRegion: 'UT', destFuelRegion: 'TX',
    departureTime: '2026-02-09T06:00', arrivalTime: '2026-02-10T18:00',
  },
  {
    id: 't2', date: '2026-02-11',
    loadId: 'TMP-MRG-002', broker: 'Spot Market',
    distance: 1200, ratePerMile: 2200 / 1200, totalPayout: 2200,
    originCity: 'Temple, TX', destCity: 'Marengo, OH',
    originCoords: [31.0982, -97.3428], destCoords: [40.4006, -81.4468],
    fuelRegion: 'TX', destFuelRegion: 'OH',
    deadheadMiles: 70, deadheadFrom: 'Austin, TX → Temple, TX',
    departureTime: '2026-02-11T05:00', arrivalTime: '2026-02-12T20:00',
  },
  {
    id: 't3', date: '2026-02-13',
    loadId: 'OH-LV-003', broker: 'Spot Market',
    distance: 2000, ratePerMile: 4000 / 2000, totalPayout: 4000,
    originCity: 'Ashland, OH 44805', destCity: 'Las Vegas, NV 89139',
    originCoords: [40.8687, -82.3182], destCoords: [36.1699, -115.1398],
    fuelRegion: 'OH', destFuelRegion: 'NV',
    deadheadMiles: 20, deadheadFrom: 'Marengo → Ashland, OH',
    departureTime: '2026-02-13T04:00', arrivalTime: '2026-02-15T14:00',
  },
  {
    id: 't4', date: '2026-02-16',
    loadId: 'LV-CA-004', broker: 'Spot Market',
    distance: 275, ratePerMile: 700 / 275, totalPayout: 700,
    originCity: 'Las Vegas, NV 89139', destCity: 'La Mirada, CA 90631',
    originCoords: [36.1699, -115.1398], destCoords: [33.9172, -118.0120],
    fuelRegion: 'NV', destFuelRegion: 'CA',
    departureTime: '2026-02-16T07:00', arrivalTime: '2026-02-16T12:00',
  },
  {
    id: 't5', date: '2026-02-17',
    loadId: 'CA-GP-005', broker: 'Spot Market',
    distance: 1435, ratePerMile: 3050 / 1435, totalPayout: 3050,
    originCity: 'Walnut, CA 91789', destCity: 'Grand Prairie, TX 75050',
    originCoords: [34.0203, -117.8654], destCoords: [32.7460, -96.9978],
    fuelRegion: 'CA', destFuelRegion: 'TX',
    deadheadMiles: 5, deadheadFrom: 'La Mirada → Walnut, CA',
    departureTime: '2026-02-17T03:00', arrivalTime: '2026-02-18T22:00',
  },
  {
    id: 't6', date: '2026-02-20',
    loadId: 'FW-HOU-006', broker: 'Spot Market',
    distance: 250, ratePerMile: 700 / 250, totalPayout: 700,
    originCity: 'Fort Worth, TX 76137', destCity: 'Houston, TX 77038',
    originCoords: [32.7555, -97.3308], destCoords: [29.8543, -95.4147],
    fuelRegion: 'TX', destFuelRegion: 'TX',
    deadheadMiles: 15, deadheadFrom: 'Grand Prairie → Fort Worth, TX',
    departureTime: '2026-02-20T06:00', arrivalTime: '2026-02-20T10:30',
  },
  {
    id: 't7', date: '2026-02-27',
    loadId: 'RSB-EST-007', broker: 'Spot Market',
    distance: 1620, ratePerMile: 3400 / 1620, totalPayout: 3400,
    originCity: 'Rosenberg, TX 77471', destCity: 'Easton, PA 18040',
    originCoords: [29.5569, -95.8088], destCoords: [40.6910, -75.2207],
    fuelRegion: 'TX', destFuelRegion: 'PA',
    deadheadMiles: 35, deadheadFrom: 'Houston 77038 → Rosenberg, TX',
    departureTime: '2026-02-27T04:00', arrivalTime: '2026-03-01T08:00',
  },
];

// Build fuel + deadhead expenses from trip data
const buildExpenses = (): Expense[] => {
  const exps: Expense[] = [];
  INITIAL_TRIPS.forEach(trip => {
    const fuelCost = fuelCostForMiles(trip.distance, trip.fuelRegion ?? 'AVG', trip.destFuelRegion);
    const oLabel = REGIONAL_DIESEL[trip.fuelRegion ?? 'AVG']?.label ?? '';
    const dLabel = trip.destFuelRegion ? REGIONAL_DIESEL[trip.destFuelRegion]?.label ?? '' : '';
    exps.push({
      id: `fuel-${trip.id}`, date: trip.date, category: 'Fuel',
      description: `Fuel: ${trip.originCity} → ${trip.destCity} (avg: ${oLabel.split('(')[0]}→ ${dLabel.split('(')[0]})`,
      amount: Math.round(fuelCost * 100) / 100,
    });
    if (trip.deadheadMiles && trip.deadheadMiles > 0) {
      const dhFuel = fuelCostForMiles(trip.deadheadMiles, trip.fuelRegion ?? 'AVG');
      exps.push({
        id: `dh-${trip.id}`, date: trip.date, category: 'Deadhead',
        description: `Deadhead (empty): ${trip.deadheadFrom} (${trip.deadheadMiles} mi)`,
        amount: Math.round(dhFuel * 100) / 100,
      });
    }
  });

  // === RECURRING MONTHLY BUSINESS EXPENSES (Feb 2026) ===
  const totalRevenue = INITIAL_TRIPS.reduce((s, t) => s + t.totalPayout, 0);
  const tripDays = INITIAL_TRIPS.length > 0 ? Math.max(1, Math.ceil((new Date(INITIAL_TRIPS[INITIAL_TRIPS.length - 1].date).getTime() - new Date(INITIAL_TRIPS[0].date).getTime()) / 86400000) + 1) : 30;
  exps.push(
    { id: 'ins-feb', date: '2026-02-01', category: 'Insurance', description: 'Truck Insurance (monthly)', amount: 2400 },
    { id: 'reg-feb', date: '2026-02-01', category: 'Registration', description: 'Truck Registration ($1,600/yr ÷ 12)', amount: Math.round(1600 / 12 * 100) / 100 },
    { id: 'toll-feb', date: '2026-02-01', category: 'Tolls', description: 'Tolls & Scales (monthly avg)', amount: 250 },
    { id: 'disp-feb', date: '2026-02-01', category: 'Dispatch', description: `Dispatch Fee (10% of $${totalRevenue.toLocaleString()} revenue)`, amount: Math.round(totalRevenue * 0.10 * 100) / 100 },
    { id: 'lock-feb', date: '2026-02-01', category: 'Lock Box', description: 'Lock Box (monthly)', amount: 100 },
    { id: 'trlr-feb', date: '2026-02-01', category: 'Trailer', description: 'Trailer Rental (monthly)', amount: 600 },
    { id: 'food-feb', date: '2026-02-01', category: 'Food', description: `Road Food (~$20/day × ${tripDays} days)`, amount: tripDays * 20 },
  );

  return exps;
};

const INITIAL_EXPENSES: Expense[] = buildExpenses();

// === MAIN APP ===
// Data versioning — bump this to force-reset cached data when defaults change
const DATA_VERSION = 4;
const loadState = <T,>(key: string, fallback: T): T => {
  try {
    const savedVer = Number(localStorage.getItem('rl_version') || '0');
    if (savedVer < DATA_VERSION) {
      // Clear all cached data on version bump
      localStorage.removeItem('rl_incomes');
      localStorage.removeItem('rl_expenses');
      localStorage.removeItem('rl_personal');
      localStorage.removeItem('rl_debts');
      localStorage.setItem('rl_version', String(DATA_VERSION));
      return fallback;
    }
    const s = localStorage.getItem(key);
    return s ? JSON.parse(s) : fallback;
  } catch { return fallback; }
};

function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'income' | 'expenses' | 'map' | 'calendar' | 'reports' | 'personal'>('dashboard');
  const [incomes, setIncomes] = useState<Income[]>(() => loadState('rl_incomes', INITIAL_TRIPS));
  const [expenses, setExpenses] = useState<Expense[]>(() => loadState('rl_expenses', INITIAL_EXPENSES));
  const [personalExpenses, setPersonalExpenses] = useState<PersonalExpense[]>(() => loadState('rl_personal', INITIAL_PERSONAL));
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isManifestModalOpen, setIsManifestModalOpen] = useState(false);
  const [pdfText, setPdfText] = useState<string>('');
  const [pdfLoading, setPdfLoading] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);

  // Persist to localStorage on change
  useEffect(() => { localStorage.setItem('rl_incomes', JSON.stringify(incomes)); }, [incomes]);
  useEffect(() => { localStorage.setItem('rl_expenses', JSON.stringify(expenses)); }, [expenses]);
  useEffect(() => { localStorage.setItem('rl_personal', JSON.stringify(personalExpenses)); }, [personalExpenses]);

  // Personal expense totals
  const totalPersonalMonthly = useMemo(() => personalExpenses.reduce((s, p) => s + p.monthlyAmount, 0), [personalExpenses]);

  // Future/pending trip check
  const isFutureTrip = (date: string) => new Date(date) > new Date();

  // Derived — EXCLUDE pending (future) trips from revenue
  const completedIncomes = useMemo(() => incomes.filter(i => !isFutureTrip(i.date)), [incomes]);
  const pendingIncomes = useMemo(() => incomes.filter(i => isFutureTrip(i.date)), [incomes]);
  const totalIncome = useMemo(() => completedIncomes.reduce((s, i) => s + i.totalPayout, 0), [completedIncomes]);
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const totalMiles = useMemo(() => completedIncomes.reduce((s, i) => s + i.distance, 0), [completedIncomes]);
  const totalDeadhead = useMemo(() => completedIncomes.reduce((s, i) => s + (i.deadheadMiles || 0), 0), [completedIncomes]);
  const pendingRevenue = useMemo(() => pendingIncomes.reduce((s, i) => s + i.totalPayout, 0), [pendingIncomes]);

  // Debts
  const [debts, setDebts] = useState<Debt[]>(() => loadState('rl_debts', INITIAL_DEBTS));
  useEffect(() => { localStorage.setItem('rl_debts', JSON.stringify(debts)); }, [debts]);
  const totalDebt = useMemo(() => debts.reduce((s, d) => s + d.amount, 0), [debts]);

  const analysis = useMemo(() => {
    const expectedFuelCost = totalMiles * (REGIONAL_DIESEL['AVG'].price / MPG);
    const trackedFuelCost = expenses.filter(e => e.category === 'Fuel').reduce((s, e) => s + e.amount, 0);
    const maintReserve = totalMiles * CASCADIA_MAINT_RESERVE;
    const vehicleDepreciation = totalMiles * CASCADIA_DEPR_RATE;
    const totalHiddenCosts = maintReserve + vehicleDepreciation;
    const ownerOperatorCashProfit = totalIncome - totalExpenses;
    const ownerOperatorTrueProfit = ownerOperatorCashProfit - totalHiddenCosts;
    const companyEquivalentEarnings = totalMiles * COMPANY_DRIVER_RATE;
    // Tax estimates (1099)
    const estimatedTax = Math.max(0, ownerOperatorTrueProfit) * TOTAL_TAX_RATE;
    const afterTaxProfit = ownerOperatorTrueProfit - estimatedTax;
    // Seasonal projections
    const currentMonth = new Date().toISOString().substring(5, 7);
    const currentSeason = Object.values(SEASONAL_RATES).find(s => s.months.includes(currentMonth)) ?? SEASONAL_RATES.mid;
    const annualMilesProjection = totalMiles * (12 / Math.max(1, incomes.length > 0 ? new Set(incomes.map(i => i.date.substring(0, 7))).size : 1));
    return {
      totalMiles, expectedFuelCost, trackedFuelCost, maintReserve,
      vehicleDepreciation, totalHiddenCosts, ownerOperatorCashProfit,
      ownerOperatorTrueProfit, companyEquivalentEarnings,
      isBeatingCompanyRate: ownerOperatorTrueProfit > companyEquivalentEarnings,
      estimatedTax, afterTaxProfit, currentSeason, annualMilesProjection,
    };
  }, [totalIncome, totalExpenses, totalMiles, expenses, incomes]);

  const chartData = useMemo(() => {
    const m: Record<string, { income: number; expense: number }> = {};
    incomes.forEach(i => { const k = i.date.substring(0, 7); if (!m[k]) m[k] = { income: 0, expense: 0 }; m[k].income += i.totalPayout; });
    expenses.forEach(e => { const k = e.date.substring(0, 7); if (!m[k]) m[k] = { income: 0, expense: 0 }; m[k].expense += e.amount; });
    return Object.entries(m).map(([name, d]) => ({ name, Income: d.income, Expenses: d.expense })).sort((a, b) => a.name.localeCompare(b.name));
  }, [incomes, expenses]);

  // Map data
  const mapPoints = useMemo(() => {
    const pts: { lat: number; lng: number; label: string; type: 'origin' | 'dest' }[] = [];
    const lines: [number, number][][] = [];
    incomes.forEach(inc => {
      if (inc.originCoords && inc.destCoords) {
        pts.push({ lat: inc.originCoords[0], lng: inc.originCoords[1], label: `${inc.originCity} (${inc.loadId})`, type: 'origin' });
        pts.push({ lat: inc.destCoords[0], lng: inc.destCoords[1], label: `${inc.destCity} (${inc.loadId})`, type: 'dest' });
        lines.push([inc.originCoords, inc.destCoords]);
      }
    });
    return { pts, lines };
  }, [incomes]);

  // Handlers
  const handleAddIncome = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    const distance = Number(fd.get('distance'));
    const totalPayout = Number(fd.get('totalPayout'));
    setIncomes([...incomes, {
      id: uuidv4(), date: fd.get('date') as string, loadId: fd.get('loadId') as string,
      broker: fd.get('broker') as string, distance, ratePerMile: distance > 0 ? totalPayout / distance : 0, totalPayout,
    }].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setIsIncomeModalOpen(false);
  };

  const handleAddExpense = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setExpenses([...expenses, {
      id: uuidv4(), date: fd.get('date') as string, category: fd.get('category') as Expense['category'],
      description: fd.get('description') as string, amount: Number(fd.get('amount')),
    }].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setIsExpenseModalOpen(false);
  };

  const deleteIncome = (id: string) => setIncomes(incomes.filter(i => i.id !== id));
  const deleteExpense = (id: string) => setExpenses(expenses.filter(e => e.id !== id));
  const formatCurrency = (n: number) => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n);

  // Edit trip inline
  const [editingTrip, setEditingTrip] = useState<string | null>(null);
  const handleEditTrip = (id: string, field: keyof Income, value: string | number) => {
    setIncomes(prev => prev.map(inc => {
      if (inc.id !== id) return inc;
      const updated = { ...inc, [field]: value };
      if (field === 'distance' || field === 'totalPayout') {
        const d = field === 'distance' ? Number(value) : inc.distance;
        const p = field === 'totalPayout' ? Number(value) : inc.totalPayout;
        updated.ratePerMile = d > 0 ? p / d : 0;
      }
      return updated;
    }));
  };

  // Per-trip cost detail
  const getTripExpenses = (tripId: string) => expenses.filter(e => e.id.includes(tripId));

  // Duration helper
  const getTripDuration = (dep?: string, arr?: string) => {
    if (!dep || !arr) return null;
    const ms = new Date(arr).getTime() - new Date(dep).getTime();
    const hrs = Math.floor(ms / 3600000);
    const mins = Math.round((ms % 3600000) / 60000);
    return `${hrs}h ${mins}m`;
  };

  // Manifest upload handler (CSV: date,origin,destination,miles,pay,broker)
  const handleManifestUpload = (text: string) => {
    const lines = text.trim().split('\n').filter(l => l.trim() && !l.startsWith('date'));
    const newTrips: Income[] = [];
    const newExps: Expense[] = [];
    lines.forEach(line => {
      const parts = line.split(',').map(s => s.trim());
      if (parts.length < 5) return;
      const [date, origin, dest, milesStr, payStr, broker] = parts;
      const miles = Number(milesStr);
      const pay = Number(payStr);
      if (!miles || !pay) return;
      const id = uuidv4();
      newTrips.push({
        id, date: date || new Date().toISOString().split('T')[0],
        loadId: `MAN-${id.slice(0, 4).toUpperCase()}`, broker: broker || 'Manifest Import',
        distance: miles, ratePerMile: pay / miles, totalPayout: pay,
        originCity: origin, destCity: dest,
      });
      const fuel = fuelCostForMiles(miles, 'AVG');
      newExps.push({
        id: `fuel-${id}`, date: date || new Date().toISOString().split('T')[0],
        category: 'Fuel', description: `Fuel: ${origin} → ${dest} (avg estimate)`,
        amount: Math.round(fuel * 100) / 100,
      });
    });
    if (newTrips.length) {
      setIncomes(prev => [...prev, ...newTrips].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setExpenses(prev => [...prev, ...newExps].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
      setIsManifestModalOpen(false);
    }
  };

  // PDF text extraction
  const handlePdfUpload = async (file: File) => {
    setPdfLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = '';
      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const content = await page.getTextContent();
        const pageText = content.items.map((item: any) => item.str).join(' ');
        fullText += pageText + '\n';
      }
      setPdfText(fullText);
    } catch (err) {
      console.error('PDF parse error:', err);
      setPdfText('Error reading PDF. Try a different file or paste the text manually.');
    }
    setPdfLoading(false);
  };

  return (
    <div className="app-container">
      {/* Sidebar */}
      <aside className="sidebar glass-panel" style={{ borderRadius: 0, borderTop: 0, borderBottom: 0, borderLeft: 0 }}>
        <div className="brand"><Truck size={28} className="text-accent" /><span>Road Ledger</span></div>
        <nav className="nav-links mt-8">
          {([
            { tab: 'dashboard' as const, icon: <LayoutDashboard size={20} />, label: 'Dashboard' },
            { tab: 'income' as const, icon: <TrendingUp size={20} className={activeTab === 'income' ? 'text-accent' : 'text-success'} />, label: 'Income & Loads' },
            { tab: 'expenses' as const, icon: <TrendingDown size={20} className={activeTab === 'expenses' ? 'text-accent' : 'text-danger'} />, label: 'Expenses' },
            { tab: 'calendar' as const, icon: <CalendarDays size={20} className={activeTab === 'calendar' ? 'text-accent' : 'text-secondary'} />, label: 'Calendar' },
            { tab: 'reports' as const, icon: <FileText size={20} className={activeTab === 'reports' ? 'text-accent' : 'text-secondary'} />, label: 'Reports' },
            { tab: 'personal' as const, icon: <DollarSign size={20} className={activeTab === 'personal' ? 'text-accent' : 'text-secondary'} />, label: 'Personal' },
            { tab: 'map' as const, icon: <MapPin size={20} className={activeTab === 'map' ? 'text-accent' : 'text-secondary'} />, label: 'Route Map' },
          ]).map(n => (
            <button key={n.tab} className={`nav-item ${activeTab === n.tab ? 'active' : ''}`} onClick={() => setActiveTab(n.tab)}>
              {n.icon}<span>{n.label}</span>
            </button>
          ))}
        </nav>
      </aside>

      {/* Main */}
      <main className="main-content">
        {/* ====== DASHBOARD ====== */}
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in">
            <header className="mb-6">
              <h1 className="text-3xl font-bold">Owner-Operator Command Center</h1>
              <p className="text-secondary mt-1">2023 Freightliner Cascadia · 290k mi · {analysis.totalMiles.toLocaleString()} mi this cycle · {totalDeadhead} mi deadhead</p>
            </header>

            {/* Pending Trips Banner */}
            {(() => {
              const pending = incomes.filter(i => isFutureTrip(i.date));
              return pending.length > 0 ? (
                <div style={{ background: 'rgba(234,179,8,0.08)', border: '1px solid rgba(234,179,8,0.3)', borderRadius: '12px', padding: '1rem 1.25rem', marginBottom: '1.25rem', display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                  <CalendarDays size={20} style={{ color: '#eab308', marginTop: '0.1rem', flexShrink: 0 }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, color: '#eab308', fontSize: '0.85rem', marginBottom: '0.35rem' }}>⏳ {pending.length} Pending Trip{pending.length > 1 ? 's' : ''}</div>
                    {pending.map(t => (
                      <div key={t.id} style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', display: 'flex', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.15rem' }}>
                        <span><strong style={{ color: 'var(--text-primary)' }}>{t.originCity?.split(',')[0]} → {t.destCity?.split(',')[0]}</strong> · {t.date}</span>
                        <span className="text-success" style={{ fontWeight: 700 }}>{formatCurrency(t.totalPayout)}</span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}

            {/* Row 1: Big Picture */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <div className="stat-title text-success justify-center" style={{ marginBottom: '0.25rem' }}><TrendingUp size={14} /> Gross Revenue</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatCurrency(totalIncome)}</div>
                <div className="text-secondary" style={{ fontSize: '0.8rem' }}>{analysis.totalMiles.toLocaleString()} loaded mi + {totalDeadhead} deadhead</div>
                {pendingRevenue > 0 && <div style={{ fontSize: '0.7rem', color: '#eab308', marginTop: '0.2rem' }}>+ {formatCurrency(pendingRevenue)} pending ({pendingIncomes.length} trip{pendingIncomes.length > 1 ? 's' : ''})</div>}
              </div>
              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <div className="stat-title text-danger justify-center" style={{ marginBottom: '0.25rem' }}><TrendingDown size={14} /> Total True Costs</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatCurrency(totalExpenses + analysis.totalHiddenCosts)}</div>
                <div className="text-secondary" style={{ fontSize: '0.8rem' }}>Fuel + Deadhead + Reserves</div>
              </div>
              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', borderTop: `4px solid ${analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)'}` }}>
                <div className="stat-title justify-center" style={{ color: analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)', marginBottom: '0.25rem' }}><DollarSign size={14} /> True Net Profit</div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(analysis.ownerOperatorTrueProfit)}</div>
                <div className="text-secondary" style={{ fontSize: '0.8rem' }}>After ALL costs & reserves</div>
              </div>
            </div>

            {/* Row 2: Two panels */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* LEFT: Per-Mile & Buckets */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calculator size={18} className="text-accent" /> Where Every Dollar Goes (Per Mile)
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  {[
                    { label: 'Avg Rate', value: `$${(totalIncome / Math.max(1, totalMiles)).toFixed(2)}`, color: 'var(--success)', sub: 'per loaded mi' },
                    { label: 'Fuel', value: `-$${(analysis.trackedFuelCost / Math.max(1, totalMiles)).toFixed(2)}`, color: 'var(--danger)', sub: 'regional diesel' },
                    { label: 'Depreciation', value: `-$${CASCADIA_DEPR_RATE.toFixed(3)}`, color: 'var(--danger)', sub: '$85k / 3yr' },
                    { label: 'Maint Reserve', value: `-$${CASCADIA_MAINT_RESERVE.toFixed(2)}`, color: '#eab308', sub: 'tires/repairs' },
                    { label: 'TRUE Net/mi', value: `$${(analysis.ownerOperatorTrueProfit / Math.max(1, totalMiles)).toFixed(3)}`, color: 'var(--accent)', sub: 'per loaded mi' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '12px', padding: '0.75rem', textAlign: 'center', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{item.label}</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{item.sub}</div>
                    </div>
                  ))}
                </div>

                <h4 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Wrench size={14} /> Expense Buckets (Filling Up)
                </h4>
                {[
                  { name: 'Diesel & DEF (Regional)', tracked: analysis.trackedFuelCost, expected: analysis.expectedFuelCost, color: analysis.trackedFuelCost > analysis.expectedFuelCost ? 'var(--danger)' : 'var(--success)' },
                  { name: 'Deadhead (Empty Miles)', tracked: expenses.filter(e => e.category === 'Deadhead').reduce((s, e) => s + e.amount, 0), expected: totalDeadhead * (REGIONAL_DIESEL['AVG'].price / MPG), color: '#f97316' },
                  { name: 'Truck Depreciation Reserve', tracked: analysis.vehicleDepreciation, expected: analysis.vehicleDepreciation, color: 'var(--danger)' },
                  { name: 'Maintenance & Tires Reserve', tracked: analysis.maintReserve, expected: analysis.maintReserve, color: '#eab308' },
                ].map((b, i) => (
                  <div key={i} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                      <span>{b.name}</span>
                      <span>{formatCurrency(b.tracked)} / {formatCurrency(b.expected)}</span>
                    </div>
                    <div className="bucket-bar-bg">
                      <div className="bucket-bar-fill" style={{ background: b.color, width: `${Math.min(100, (b.tracked / Math.max(1, b.expected)) * 100)}%`, opacity: 0.8 }}></div>
                    </div>
                  </div>
                ))}

                <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-secondary" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Hidden Reserves Set Aside:</span>
                  <span className="text-danger" style={{ fontSize: '1.1rem', fontWeight: 800 }}>-{formatCurrency(analysis.totalHiddenCosts)}</span>
                </div>
              </div>

              {/* RIGHT: Head-to-Head */}
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}><Scale size={18} className="text-accent" /> Head-to-Head</h3>
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{ position: 'absolute', top: 8, right: 8, opacity: 0.08 }}><DollarSign size={56} /></div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Company Driver</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatCurrency(analysis.companyEquivalentEarnings)}</div>
                  <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Guaranteed @ ${COMPANY_DRIVER_RATE.toFixed(2)}/mi · {analysis.totalMiles.toLocaleString()} mi</div>
                </div>
                <div style={{ display: 'flex', justifyContent: 'center', margin: '-0.25rem 0', position: 'relative', zIndex: 1 }}>
                  <span style={{ background: '#000', color: 'var(--text-secondary)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 800, padding: '0.2rem 0.75rem', borderRadius: '20px', border: '1px solid var(--border)' }}>VS</span>
                </div>
                <div style={{ background: analysis.isBeatingCompanyRate ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', borderRadius: '12px', padding: '1.25rem', border: `1px solid ${analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)'}`, position: 'relative', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{ position: 'absolute', top: 8, right: 8, opacity: 0.08 }}><Truck size={56} /></div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Owner-Operator True Net</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(analysis.ownerOperatorTrueProfit)}</div>
                  <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>After all costs + {formatCurrency(analysis.totalHiddenCosts)} reserves</div>
                </div>
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', borderRadius: '12px', padding: '1rem', border: '1px solid var(--border)', textAlign: 'center' }}>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.25rem' }}>You're making</div>
                    <div style={{ fontSize: '1.5rem', fontWeight: 800, color: analysis.ownerOperatorTrueProfit - analysis.companyEquivalentEarnings >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {formatCurrency(analysis.ownerOperatorTrueProfit - analysis.companyEquivalentEarnings)}
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.15rem' }}>{analysis.ownerOperatorTrueProfit - analysis.companyEquivalentEarnings >= 0 ? 'MORE' : 'LESS'} than a company driver</div>
                  </div>
                </div>
              </div>
            </div>

            {/* Revenue Waterfall — Money Flow Animation */}
            {(() => {
              const bizExpenses = totalExpenses + analysis.totalHiddenCosts;
              const debtPayment = personalExpenses.find(p => p.category === 'Debt')?.monthlyAmount ?? 0;
              const personalCosts = totalPersonalMonthly - debtPayment;
              const taxCosts = analysis.estimatedTax;
              const afterBiz = totalIncome - bizExpenses;
              const afterPersonal = afterBiz - personalCosts;
              const afterTax = afterPersonal - taxCosts;
              const afterDebt = afterTax - debtPayment;
              const buckets = [
                { label: '🏢 Business', amount: bizExpenses, filled: Math.min(totalIncome, bizExpenses), color: '#ef4444', details: 'Fuel · Dispatch · Insurance · Trailer · Tolls', delay: '0s' },
                { label: '🏠 Personal', amount: personalCosts, filled: Math.max(0, Math.min(afterBiz, personalCosts)), color: '#eab308', details: 'Housing · Family · Food · Utilities', delay: '0.4s' },
                { label: '🏛 Taxes', amount: taxCosts, filled: Math.max(0, Math.min(afterPersonal, taxCosts)), color: '#f97316', details: `SE ${(SE_TAX_RATE * 100).toFixed(0)}% + Fed ~${(FED_TAX_RATE * 100).toFixed(0)}%`, delay: '0.8s' },
                { label: '💳 Debt Payoff', amount: debtPayment, filled: Math.max(0, Math.min(afterTax, debtPayment)), color: '#a855f7', details: `${formatCurrency(totalDebt)} remaining`, delay: '1.2s' },
                { label: '💰 Profit', amount: Math.max(0, afterDebt), filled: Math.max(0, afterDebt), color: '#10b981', details: afterDebt >= 0 ? 'Savings & Growth' : 'In the red', delay: '1.6s' },
              ];

              // Reserve fund targets — how much you SHOULD be saving
              const truckTarget = 85000; // replacement cost
              const truckLifetimeSaved = totalMiles * CASCADIA_DEPR_RATE; // total set aside
              const tireTarget = 4500; // full tire set cost
              const tireLifetimeSaved = totalMiles * CASCADIA_MAINT_RESERVE;

              const CircleFill = ({ pct, color, size, icon }: { pct: number; color: string; size: number; icon: string }) => {
                const r = (size - 8) / 2;
                const circ = 2 * Math.PI * r;
                const offset = circ - (Math.min(pct, 100) / 100) * circ;
                return (
                  <div style={{ position: 'relative', width: size, height: size, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                    <svg width={size} height={size} style={{ position: 'absolute', transform: 'rotate(-90deg)' }}>
                      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.06)" strokeWidth="6" />
                      <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="6" strokeLinecap="round"
                        strokeDasharray={circ} strokeDashoffset={offset}
                        style={{ transition: 'stroke-dashoffset 2s ease-out' }} />
                    </svg>
                    <span style={{ fontSize: size * 0.35, zIndex: 1 }}>{icon}</span>
                  </div>
                );
              };

              return (
                <div className="glass-panel" style={{ padding: '1.5rem', marginBottom: '1.5rem' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <TrendingDown size={18} style={{ color: '#3b82f6' }} /> Where Your Revenue Goes
                  </h3>
                  <p className="text-secondary" style={{ fontSize: '0.75rem', marginBottom: '1.25rem' }}>{formatCurrency(totalIncome)} revenue → filling buckets in order of priority</p>

                  {/* Horizontal bar breakdown */}
                  <div style={{ display: 'flex', height: '28px', borderRadius: '8px', overflow: 'hidden', marginBottom: '1.5rem', border: '1px solid var(--border)' }}>
                    {totalIncome > 0 && buckets.map((b, i) => {
                      const pct = (b.filled / totalIncome) * 100;
                      return pct > 0 ? (
                        <div key={i} style={{ width: `${pct}%`, background: b.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700, color: '#fff' }}>{pct > 8 ? `${pct.toFixed(0)}%` : ''}</div>
                      ) : null;
                    })}
                    {afterDebt < 0 && <div style={{ flex: 1, background: 'rgba(239,68,68,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '0.55rem', fontWeight: 700, color: 'var(--danger)' }}>DEFICIT</div>}
                  </div>

                  {/* Bucket columns — 5 */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.6rem' }}>
                    {buckets.map((b, i) => {
                      const fillPct = b.amount > 0 ? Math.min(100, (b.filled / b.amount) * 100) : 0;
                      const isFunded = b.filled >= b.amount && b.amount > 0;
                      const isPartial = b.filled > 0 && b.filled < b.amount;
                      return (
                        <div key={i} style={{ textAlign: 'center' }}>
                          <div style={{ height: '100px', position: 'relative', background: 'rgba(0,0,0,0.25)', borderRadius: '0 0 10px 10px', border: '1px solid var(--border)', borderTop: `3px solid ${b.color}`, overflow: 'hidden' }}>
                            <div className="waterfall-fill" style={{ '--fill-pct': `${fillPct}%`, '--fill-delay': b.delay, background: `linear-gradient(to top, ${b.color}, ${b.color}88)`, width: '100%', position: 'absolute', bottom: 0, borderRadius: '0 0 9px 9px' } as React.CSSProperties} />
                            <div style={{ position: 'relative', zIndex: 1, padding: '0.35rem', fontSize: '0.9rem', fontWeight: 800, color: '#fff', textShadow: '0 1px 4px rgba(0,0,0,0.5)', height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
                              {formatCurrency(b.filled)}
                            </div>
                          </div>
                          <div style={{ marginTop: '0.4rem', fontSize: '0.7rem', fontWeight: 700 }}>{b.label}</div>
                          <div style={{ fontSize: '0.5rem', color: b.color, marginTop: '0.15rem' }}>
                            {isFunded ? '✓ Funded' : isPartial ? `⚠ ${formatCurrency(b.amount - b.filled)} short` : i === 4 ? (afterDebt >= 0 ? '✓ Take home' : formatCurrency(afterDebt)) : '✗ Empty'}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* Reserve Savings — Fill-up Icons */}
                  <div style={{ marginTop: '1.25rem', padding: '1rem', background: 'rgba(0,0,0,0.15)', borderRadius: '12px', border: '1px solid var(--border)' }}>
                    <h4 style={{ fontSize: '0.8rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                      🏦 Reserve Funds Building Up
                    </h4>
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                      {/* Truck Replacement Fund */}
                      <div style={{ textAlign: 'center' }}>
                        <CircleFill pct={(truckLifetimeSaved / truckTarget) * 100} color="#3b82f6" size={80} icon="🚛" />
                        <div style={{ fontWeight: 700, fontSize: '0.8rem', marginTop: '0.35rem' }}>Truck Fund</div>
                        <div style={{ fontWeight: 800, color: '#3b82f6', fontSize: '0.9rem' }}>{formatCurrency(truckLifetimeSaved)}</div>
                        <div className="text-secondary" style={{ fontSize: '0.6rem' }}>of {formatCurrency(truckTarget)} goal</div>
                        <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '0.3rem', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, (truckLifetimeSaved / truckTarget) * 100)}%`, height: '100%', background: '#3b82f6', borderRadius: '2px', transition: 'width 2s ease-out' }} />
                        </div>
                        <div className="text-secondary" style={{ fontSize: '0.5rem', marginTop: '0.15rem' }}>{((truckLifetimeSaved / truckTarget) * 100).toFixed(1)}% saved</div>
                      </div>

                      {/* Tires & Maintenance Fund */}
                      <div style={{ textAlign: 'center' }}>
                        <CircleFill pct={(tireLifetimeSaved / tireTarget) * 100} color="#eab308" size={80} icon="🔧" />
                        <div style={{ fontWeight: 700, fontSize: '0.8rem', marginTop: '0.35rem' }}>Tires & Maint</div>
                        <div style={{ fontWeight: 800, color: '#eab308', fontSize: '0.9rem' }}>{formatCurrency(tireLifetimeSaved)}</div>
                        <div className="text-secondary" style={{ fontSize: '0.6rem' }}>of {formatCurrency(tireTarget)} next set</div>
                        <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '0.3rem', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, (tireLifetimeSaved / tireTarget) * 100)}%`, height: '100%', background: '#eab308', borderRadius: '2px', transition: 'width 2s ease-out' }} />
                        </div>
                        <div className="text-secondary" style={{ fontSize: '0.5rem', marginTop: '0.15rem' }}>{((tireLifetimeSaved / tireTarget) * 100).toFixed(1)}% saved</div>
                      </div>

                      {/* Debt Payoff Progress */}
                      <div style={{ textAlign: 'center' }}>
                        <CircleFill pct={totalDebt > 0 ? ((14500 - totalDebt) / 14500) * 100 : 100} color="#a855f7" size={80} icon="💳" />
                        <div style={{ fontWeight: 700, fontSize: '0.8rem', marginTop: '0.35rem' }}>Debt Freedom</div>
                        <div style={{ fontWeight: 800, color: '#a855f7', fontSize: '0.9rem' }}>{formatCurrency(14500 - totalDebt)} paid</div>
                        <div className="text-secondary" style={{ fontSize: '0.6rem' }}>{formatCurrency(totalDebt)} remaining</div>
                        <div style={{ width: '100%', height: '4px', background: 'rgba(255,255,255,0.06)', borderRadius: '2px', marginTop: '0.3rem', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.min(100, ((14500 - totalDebt) / 14500) * 100)}%`, height: '100%', background: '#a855f7', borderRadius: '2px', transition: 'width 2s ease-out' }} />
                        </div>
                        <div className="text-secondary" style={{ fontSize: '0.5rem', marginTop: '0.15rem' }}>~{Math.ceil(totalDebt / Math.max(1, debtPayment))} months to go</div>
                      </div>
                    </div>
                  </div>

                  {/* Summary line */}
                  <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: afterDebt >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', borderRadius: '10px', border: `1px solid ${afterDebt >= 0 ? 'rgba(16,185,129,0.3)' : 'rgba(239,68,68,0.3)'}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: afterDebt >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                      {afterDebt >= 0 ? '✓ All buckets funded — profit remaining' : `⚠ ${formatCurrency(Math.abs(afterDebt))} short — need more loads or cut expenses`}
                    </span>
                    <span style={{ fontSize: '1.1rem', fontWeight: 800, color: afterDebt >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(afterDebt)}</span>
                  </div>
                </div>
              );
            })()}

            {/* Compact Expense Breakdown on Dashboard */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: '0.6rem', marginBottom: '1.5rem' }}>
              {[
                { label: '🛡 Insurance', val: '$2,400/mo', type: 'fixed' },
                { label: '🚛 Trailer', val: '$600/mo', type: 'fixed' },
                { label: '🛣 Tolls', val: '$250/mo', type: 'fixed' },
                { label: '🔒 Lock Box', val: '$100/mo', type: 'fixed' },
                { label: '📋 Registration', val: '$133/mo', type: 'fixed' },
                { label: '⛽ Fuel', val: formatCurrency(analysis.trackedFuelCost), type: 'variable' },
                { label: '📞 Dispatch 10%', val: formatCurrency(totalIncome * 0.10), type: 'variable' },
                { label: '📉 Depreciation', val: formatCurrency(analysis.vehicleDepreciation), type: 'variable' },
                { label: '🔧 Maintenance', val: formatCurrency(analysis.maintReserve), type: 'variable' },
                { label: '🍔 Road Food', val: formatCurrency(expenses.filter(e => e.category === 'Food').reduce((s, e) => s + e.amount, 0)), type: 'variable' },
              ].map((e, i) => (
                <div key={i} style={{ background: 'rgba(0,0,0,0.2)', border: `1px solid ${e.type === 'fixed' ? 'rgba(239,68,68,0.2)' : 'rgba(249,115,22,0.2)'}`, borderRadius: '8px', padding: '0.5rem 0.6rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.7rem' }}>
                  <span>{e.label}</span>
                  <span style={{ fontWeight: 700, color: e.type === 'fixed' ? 'var(--danger)' : '#f97316', fontSize: '0.75rem' }}>{e.val}</span>
                </div>
              ))}
            </div>

            {/* Row 3: Tax & Seasonal */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>
              {/* Tax Estimate */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <DollarSign size={18} className="text-danger" /> 1099 Tax Estimate
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>SE Tax (15.3%)</div>
                    <div className="text-danger" style={{ fontWeight: 700, marginTop: '0.25rem' }}>-{formatCurrency(Math.max(0, analysis.ownerOperatorTrueProfit) * SE_TAX_RATE)}</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Federal (~12%)</div>
                    <div className="text-danger" style={{ fontWeight: 700, marginTop: '0.25rem' }}>-{formatCurrency(Math.max(0, analysis.ownerOperatorTrueProfit) * FED_TAX_RATE)}</div>
                  </div>
                  <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Total Tax Reserve</div>
                    <div className="text-danger" style={{ fontWeight: 800, fontSize: '1.1rem', marginTop: '0.25rem' }}>-{formatCurrency(analysis.estimatedTax)}</div>
                  </div>
                  <div style={{ background: analysis.afterTaxProfit >= 0 ? 'rgba(16,185,129,0.08)' : 'rgba(239,68,68,0.08)', padding: '0.75rem', borderRadius: '10px', border: `1px solid ${analysis.afterTaxProfit >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
                    <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: analysis.afterTaxProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>After-Tax Profit</div>
                    <div style={{ fontWeight: 800, fontSize: '1.1rem', marginTop: '0.25rem', color: analysis.afterTaxProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(analysis.afterTaxProfit)}</div>
                  </div>
                </div>
                <div className="text-secondary" style={{ fontSize: '0.7rem', marginTop: '0.75rem' }}>Set aside ~{(TOTAL_TAX_RATE * 100).toFixed(1)}% of true profit for quarterly 1099-NEC estimated payments.</div>
              </div>

              {/* Seasonal Projections */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <TrendingUp size={18} style={{ color: '#eab308' }} /> Seasonal Rate Outlook
                </h3>
                <div style={{ background: 'rgba(234,179,8,0.08)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(234,179,8,0.3)', marginBottom: '0.75rem' }}>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: '#eab308' }}>Current: {analysis.currentSeason.label}</div>
                  <div style={{ fontWeight: 700, marginTop: '0.25rem' }}>Rates are ~{((analysis.currentSeason.multiplier - 1) * 100).toFixed(0)}% {analysis.currentSeason.multiplier >= 1 ? 'above' : 'below'} average</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                  {Object.entries(SEASONAL_RATES).map(([key, s]) => {
                    const avgRate = totalIncome / Math.max(1, totalMiles);
                    const projRate = avgRate * s.multiplier / (analysis.currentSeason.multiplier || 1);
                    const projRevenue = analysis.annualMilesProjection / 3 * projRate;
                    return (
                      <div key={key} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '8px', border: '1px solid var(--border)', textAlign: 'center' }}>
                        <div style={{ fontSize: '0.6rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>{s.label.split('(')[0]}</div>
                        <div style={{ fontSize: '1rem', fontWeight: 800, color: s.multiplier >= 1 ? 'var(--success)' : 'var(--danger)', marginTop: '0.2rem' }}>${projRate.toFixed(2)}/mi</div>
                        <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>~{formatCurrency(projRevenue)} rev</div>
                      </div>
                    );
                  })}
                </div>
                <div className="text-secondary" style={{ fontSize: '0.7rem', marginTop: '0.75rem' }}>Peak season (Oct-Jan) typically sees 15-20% higher spot rates. Plan to save during peaks for low-season dips.</div>
              </div>
            </div>

            {/* Row 4: Chart */}
            <div className="glass-panel chart-container">
              <h3 style={{ marginBottom: '1rem', fontWeight: 600, fontSize: '1rem' }}>Income vs Expenses (Monthly)</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-secondary)" />
                    <YAxis stroke="var(--text-secondary)" tickFormatter={(v) => `$${v}`} />
                    <RechartsTooltip contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', color: 'white' }} itemStyle={{ color: 'white' }} formatter={(value: any) => formatCurrency(Number(value))} />
                    <Legend />
                    <Bar dataKey="Income" fill="var(--success)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill="var(--danger)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-secondary">No data yet.</div>
              )}
            </div>
          </div>
        )}

        {/* ====== INCOME / LOADS ====== */}
        {activeTab === 'income' && (
          <div className="animate-fade-in">
            <header className="mb-8 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-bold">Income & Loads</h1>
                <p className="text-secondary mt-2">Click a trip to see per-trip cost breakdown</p>
              </div>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button style={{ background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', padding: '0.75rem 1.25rem', borderRadius: '8px', fontWeight: 600, border: '1px solid rgba(59,130,246,0.3)', display: 'flex', alignItems: 'center', gap: '0.5rem' }} onClick={() => setIsManifestModalOpen(true)}><Upload size={18} /> Upload Manifest</button>
                <button className="btn-primary flex items-center gap-2" onClick={() => setIsIncomeModalOpen(true)}><Plus size={18} /> Add Load</button>
              </div>
            </header>

            <div className="glass-panel p-0 overflow-hidden">
              <div className="table-container">
                {incomes.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Route</th>
                        <th>Miles</th>
                        <th>Rate/Mi</th>
                        <th>Payout</th>
                        <th>Fuel Cost</th>
                        <th>Net</th>
                        <th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomes.map(inc => {
                        const tripExpenses = getTripExpenses(inc.id);
                        const tripFuel = tripExpenses.filter(e => e.category === 'Fuel').reduce((s, e) => s + e.amount, 0);
                        const tripDH = tripExpenses.filter(e => e.category === 'Deadhead').reduce((s, e) => s + e.amount, 0);
                        const tripDepr = inc.distance * CASCADIA_DEPR_RATE;
                        const tripMaint = inc.distance * CASCADIA_MAINT_RESERVE;
                        const tripTrueNet = inc.totalPayout - tripFuel - tripDH - tripDepr - tripMaint;
                        const isExpanded = expandedTrip === inc.id;
                        const regionInfo = REGIONAL_DIESEL[inc.fuelRegion ?? 'AVG'];

                        const isEditing = editingTrip === inc.id;
                        const inputStyle = { background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.2rem 0.4rem', color: 'var(--text-primary)', width: '100%', fontSize: '0.85rem' } as const;
                        const tripTax = Math.max(0, tripTrueNet) * TOTAL_TAX_RATE;

                        return (
                          <React.Fragment key={inc.id}>
                            <tr onClick={() => !isEditing && setExpandedTrip(isExpanded ? null : inc.id)} style={{ cursor: isEditing ? 'default' : 'pointer' }}>
                              <td>
                                {isEditing ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <input type="date" defaultValue={inc.date} style={inputStyle} onChange={e => handleEditTrip(inc.id, 'date', e.target.value)} />
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 700, marginTop: '0.15rem' }}>PICKUP</div>
                                    <input type="datetime-local" defaultValue={inc.departureTime ?? ''} style={{ ...inputStyle, fontSize: '0.75rem' }} onChange={e => handleEditTrip(inc.id, 'departureTime', e.target.value)} />
                                    <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', fontWeight: 700 }}>DROP-OFF</div>
                                    <input type="datetime-local" defaultValue={inc.arrivalTime ?? ''} style={{ ...inputStyle, fontSize: '0.75rem' }} onChange={e => handleEditTrip(inc.id, 'arrivalTime', e.target.value)} />
                                  </div>
                                ) : (
                                  <>
                                    <div>{inc.date}</div>
                                    {inc.departureTime && inc.arrivalTime ? <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}><Clock size={10} /> {getTripDuration(inc.departureTime, inc.arrivalTime)}</div> : null}
                                  </>
                                )}
                              </td>
                              <td>
                                {isEditing ? (
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
                                    <input defaultValue={inc.originCity ?? ''} placeholder="Origin" style={inputStyle} onChange={e => handleEditTrip(inc.id, 'originCity', e.target.value)} />
                                    <input defaultValue={inc.destCity ?? ''} placeholder="Destination" style={inputStyle} onChange={e => handleEditTrip(inc.id, 'destCity', e.target.value)} />
                                  </div>
                                ) : (
                                  <>
                                    <div className="font-medium text-accent">{inc.originCity}</div>
                                    <div className="text-secondary" style={{ fontSize: '0.75rem' }}>→ {inc.destCity}</div>
                                    {inc.deadheadMiles ? <div style={{ fontSize: '0.65rem', color: '#f97316' }}>+{inc.deadheadMiles} mi deadhead</div> : null}
                                    {isFutureTrip(inc.date) ? <span style={{ fontSize: '0.55rem', background: 'rgba(234,179,8,0.15)', color: '#eab308', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700, marginTop: '0.15rem', display: 'inline-block' }}>⏳ PENDING</span> : null}
                                  </>
                                )}
                              </td>
                              <td>{isEditing ? <input type="number" defaultValue={inc.distance} style={{ ...inputStyle, width: '70px' }} onChange={e => handleEditTrip(inc.id, 'distance', Number(e.target.value))} /> : inc.distance.toLocaleString()}</td>
                              <td>{formatCurrency(inc.ratePerMile)}</td>
                              <td>{isEditing ? <input type="number" step="0.01" defaultValue={inc.totalPayout} style={{ ...inputStyle, width: '80px' }} onChange={e => handleEditTrip(inc.id, 'totalPayout', Number(e.target.value))} /> : <span className="text-success font-semibold">{formatCurrency(inc.totalPayout)}</span>}</td>
                              <td className="text-danger">{formatCurrency(tripFuel)}</td>
                              <td style={{ color: tripTrueNet >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{formatCurrency(tripTrueNet)}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                                  <button style={{ background: isEditing ? 'rgba(16,185,129,0.15)' : 'rgba(59,130,246,0.15)', color: isEditing ? 'var(--success)' : 'var(--accent)', border: 'none', borderRadius: '4px', padding: '0.2rem 0.5rem', fontSize: '0.7rem', fontWeight: 700, cursor: 'pointer' }} onClick={(e) => { e.stopPropagation(); setEditingTrip(isEditing ? null : inc.id); }}>{isEditing ? '✓ Save' : '✎ Edit'}</button>
                                  {!isEditing && (isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />)}
                                  <button className="btn-icon text-danger" onClick={(e) => { e.stopPropagation(); deleteIncome(inc.id); }}><Trash2 size={16} /></button>
                                </div>
                              </td>
                            </tr>
                            {isExpanded && (
                              <tr>
                                <td colSpan={8} style={{ background: 'rgba(0,0,0,0.2)', padding: '1rem 1.5rem' }}>
                                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '0.75rem' }}>
                                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Fuel Region (3-pt avg)</div>
                                      <div style={{ fontWeight: 700, marginTop: '0.25rem' }}>{regionInfo?.label ?? 'N/A'}</div>
                                      {inc.destFuelRegion ? <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>→ {REGIONAL_DIESEL[inc.destFuelRegion]?.label ?? ''}</div> : null}
                                    </div>
                                    {inc.departureTime && inc.arrivalTime ? (
                                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(59,130,246,0.3)' }}>
                                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--accent)', fontWeight: 700 }}>Drive Time</div>
                                        <div style={{ fontWeight: 700, marginTop: '0.25rem' }}>{getTripDuration(inc.departureTime, inc.arrivalTime)}</div>
                                        <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)' }}>{new Date(inc.departureTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })} → {new Date(inc.arrivalTime).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</div>
                                      </div>
                                    ) : null}
                                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Fuel Cost</div>
                                      <div className="text-danger" style={{ fontWeight: 700, marginTop: '0.25rem' }}>-{formatCurrency(tripFuel)}</div>
                                    </div>
                                    {inc.deadheadMiles ? (
                                      <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(249,115,22,0.3)' }}>
                                        <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#f97316', fontWeight: 700 }}>Deadhead</div>
                                        <div style={{ fontWeight: 700, marginTop: '0.25rem', color: '#f97316' }}>{inc.deadheadMiles} mi · -{formatCurrency(tripDH)}</div>
                                        <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)' }}>{inc.deadheadFrom}</div>
                                      </div>
                                    ) : null}
                                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700 }}>Depreciation</div>
                                      <div className="text-danger" style={{ fontWeight: 700, marginTop: '0.25rem' }}>-{formatCurrency(tripDepr)}</div>
                                    </div>
                                    <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '10px', border: '1px solid var(--border)' }}>
                                      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: '#eab308', fontWeight: 700 }}>Maint Reserve</div>
                                      <div style={{ fontWeight: 700, marginTop: '0.25rem', color: '#eab308' }}>-{formatCurrency(tripMaint)}</div>
                                    </div>
                                    <div style={{ background: analysis.isBeatingCompanyRate ? 'rgba(16,185,129,0.1)' : 'rgba(239,68,68,0.1)', padding: '0.75rem', borderRadius: '10px', border: `1px solid ${tripTrueNet >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
                                      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: tripTrueNet >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>True Trip Net</div>
                                      <div style={{ fontWeight: 800, marginTop: '0.25rem', fontSize: '1.1rem', color: tripTrueNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(tripTrueNet)}</div>
                                    </div>
                                    <div style={{ background: 'rgba(239,68,68,0.06)', padding: '0.75rem', borderRadius: '10px', border: '1px solid rgba(239,68,68,0.2)' }}>
                                      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--danger)', fontWeight: 700 }}>1099 Tax (~{(TOTAL_TAX_RATE * 100).toFixed(0)}%)</div>
                                      <div className="text-danger" style={{ fontWeight: 700, marginTop: '0.25rem' }}>-{formatCurrency(tripTax)}</div>
                                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>After tax: {formatCurrency(tripTrueNet - tripTax)}</div>
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center text-secondary">
                    <Truck size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-lg">No loads recorded yet.</p>
                    <button className="btn-primary mt-4" onClick={() => setIsIncomeModalOpen(true)}>Add Your First Load</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ====== EXPENSES ====== */}
        {activeTab === 'expenses' && (
          <div className="animate-fade-in">
            <header className="mb-6 flex justify-between items-center flex-wrap gap-4">
              <div><h1 className="text-3xl font-bold">Business Expenses</h1><p className="text-secondary mt-2">Fuel, deadhead, maintenance, and operational costs</p></div>
              <button className="btn-primary flex items-center gap-2" onClick={() => setIsExpenseModalOpen(true)}><Plus size={18} /> Add Expense</button>
            </header>

            {/* Fixed vs Variable Breakdown */}
            {(() => {
              const fixedItems = [
                { name: 'Truck Insurance', monthly: 2400, icon: '🛡' },
                { name: 'Trailer Rental', monthly: 600, icon: '🚛' },
                { name: 'Tolls & Scales', monthly: 250, icon: '🛣' },
                { name: 'Registration', monthly: Math.round(1600 / 12 * 100) / 100, icon: '📋' },
                { name: 'Lock Box', monthly: 100, icon: '🔒' },
              ];
              const totalFixed = fixedItems.reduce((s, f) => s + f.monthly, 0);

              const variableItems = [
                { name: 'Fuel (Diesel + DEF)', amount: analysis.trackedFuelCost, rate: `$${(analysis.trackedFuelCost / Math.max(1, totalMiles)).toFixed(2)}/mi`, icon: '⛽' },
                { name: 'Dispatch (10%)', amount: totalIncome * 0.10, rate: '10% of revenue', icon: '📞' },
                { name: 'Depreciation Reserve', amount: analysis.vehicleDepreciation, rate: `$${CASCADIA_DEPR_RATE.toFixed(3)}/mi`, icon: '📉' },
                { name: 'Maintenance Reserve', amount: analysis.maintReserve, rate: `$${CASCADIA_MAINT_RESERVE.toFixed(2)}/mi`, icon: '🔧' },
                { name: 'Deadhead Fuel', amount: expenses.filter(e => e.category === 'Deadhead').reduce((s, e) => s + e.amount, 0), rate: `${totalDeadhead} empty mi`, icon: '🔄' },
                { name: 'Road Food', amount: expenses.filter(e => e.category === 'Food').reduce((s, e) => s + e.amount, 0), rate: '~$20/day on road', icon: '🍔' },
              ];
              const totalVariable = variableItems.reduce((s, v) => s + v.amount, 0);

              return (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>

                  {/* Fixed */}
                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem' }}>🔒</span> Fixed Costs
                      <span className="text-secondary" style={{ fontSize: '0.65rem', fontWeight: 500, marginLeft: 'auto' }}>Same every month</span>
                    </h3>
                    {fixedItems.map((f, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                        <span>{f.icon} {f.name}</span>
                        <span className="text-danger" style={{ fontWeight: 700 }}>{formatCurrency(f.monthly)}/mo</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(239,68,68,0.08)', borderRadius: '8px', border: '1px solid rgba(239,68,68,0.2)' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>Monthly Nut</span>
                      <span className="text-danger" style={{ fontWeight: 800, fontSize: '1rem' }}>{formatCurrency(totalFixed)}/mo</span>
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.65rem', marginTop: '0.35rem', textAlign: 'right' }}>{formatCurrency(totalFixed * 12)}/year</div>
                  </div>

                  {/* Variable */}
                  <div className="glass-panel" style={{ padding: '1.25rem' }}>
                    <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                      <span style={{ fontSize: '1.1rem' }}>📈</span> Variable Costs
                      <span className="text-secondary" style={{ fontSize: '0.65rem', fontWeight: 500, marginLeft: 'auto' }}>Scale with miles/trips</span>
                    </h3>
                    {variableItems.map((v, i) => (
                      <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.4rem 0', borderBottom: '1px solid rgba(255,255,255,0.04)', fontSize: '0.8rem' }}>
                        <span style={{ display: 'flex', flexDirection: 'column' }}>
                          <span>{v.icon} {v.name}</span>
                          <span className="text-secondary" style={{ fontSize: '0.6rem' }}>{v.rate}</span>
                        </span>
                        <span className="text-danger" style={{ fontWeight: 700 }}>{formatCurrency(v.amount)}</span>
                      </div>
                    ))}
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '0.75rem', padding: '0.5rem 0.75rem', background: 'rgba(249,115,22,0.08)', borderRadius: '8px', border: '1px solid rgba(249,115,22,0.2)' }}>
                      <span style={{ fontWeight: 800, fontSize: '0.85rem' }}>This Cycle Total</span>
                      <span style={{ fontWeight: 800, fontSize: '1rem', color: '#f97316' }}>{formatCurrency(totalVariable)}</span>
                    </div>
                    <div className="text-secondary" style={{ fontSize: '0.65rem', marginTop: '0.35rem', textAlign: 'right' }}>{formatCurrency(totalVariable / Math.max(1, totalMiles))}/mi all-in variable</div>
                  </div>
                </div>
              );
            })()}

            {/* Total Burn Rate Summary */}
            <div className="glass-panel" style={{ padding: '1rem 1.25rem', marginBottom: '1.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '0.75rem', borderTop: '3px solid var(--danger)' }}>
              <div>
                <div style={{ fontWeight: 800, fontSize: '0.9rem' }}>Total Business Burn Rate</div>
                <div className="text-secondary" style={{ fontSize: '0.7rem' }}>Fixed monthly + variable this cycle + hidden reserves</div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <div className="text-danger" style={{ fontWeight: 800, fontSize: '1.3rem' }}>{formatCurrency(totalExpenses + analysis.totalHiddenCosts)}</div>
                <div className="text-secondary" style={{ fontSize: '0.65rem' }}>vs {formatCurrency(totalIncome)} revenue = <span style={{ color: totalIncome > totalExpenses + analysis.totalHiddenCosts ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{formatCurrency(totalIncome - totalExpenses - analysis.totalHiddenCosts)}</span></div>
              </div>
            </div>

            <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '0.75rem' }}>📋 All Expense Transactions</h3>
            <div className="glass-panel p-0 overflow-hidden">
              <div className="table-container">
                {expenses.length > 0 ? (
                  <table>
                    <thead><tr><th>Date</th><th>Category</th><th>Description</th><th>Amount</th><th></th></tr></thead>
                    <tbody>
                      {expenses.map(exp => (
                        <tr key={exp.id}>
                          <td>{exp.date}</td>
                          <td>
                            <span style={{
                              padding: '0.25rem 0.5rem', borderRadius: '6px', fontSize: '0.8rem', fontWeight: 600,
                              background: exp.category === 'Deadhead' ? 'rgba(249,115,22,0.15)' : exp.category === 'Fuel' ? 'rgba(239,68,68,0.15)' : 'rgba(0,0,0,0.3)',
                              color: exp.category === 'Deadhead' ? '#f97316' : exp.category === 'Fuel' ? 'var(--danger)' : 'var(--text-primary)',
                              border: `1px solid ${exp.category === 'Deadhead' ? 'rgba(249,115,22,0.3)' : 'rgba(255,255,255,0.1)'}`,
                            }}>
                              {exp.category}
                            </span>
                          </td>
                          <td>{exp.description}</td>
                          <td className="text-danger font-semibold">{formatCurrency(exp.amount)}</td>
                          <td><button className="btn-icon" onClick={() => deleteExpense(exp.id)}><Trash2 size={18} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="p-8 text-center text-secondary">
                    <Wrench size={48} className="mx-auto mb-4 opacity-50" />
                    <p className="text-lg">No expenses recorded yet.</p>
                    <button className="btn-primary mt-4" onClick={() => setIsExpenseModalOpen(true)}>Add Your First Expense</button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ====== CALENDAR ====== */}
        {activeTab === 'calendar' && (() => {
          const [calYear, calMonth] = [new Date().getFullYear(), new Date().getMonth()];
          const firstDay = new Date(calYear, calMonth, 1).getDay();
          const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
          const monthLabel = new Date(calYear, calMonth).toLocaleString('en-US', { month: 'long', year: 'numeric' });
          const days = Array.from({ length: 42 }, (_, i) => {
            const dayNum = i - firstDay + 1;
            return dayNum >= 1 && dayNum <= daysInMonth ? dayNum : null;
          });
          const tripsByDate = new Map<number, Income[]>();
          incomes.forEach(inc => {
            const d = new Date(inc.date);
            if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
              const day = d.getDate();
              if (!tripsByDate.has(day)) tripsByDate.set(day, []);
              tripsByDate.get(day)!.push(inc);
            }
          });
          const expensesByDate = new Map<number, number>();
          expenses.forEach(exp => {
            const d = new Date(exp.date);
            if (d.getFullYear() === calYear && d.getMonth() === calMonth) {
              const day = d.getDate();
              expensesByDate.set(day, (expensesByDate.get(day) || 0) + exp.amount);
            }
          });
          return (
            <div className="animate-fade-in">
              <header className="mb-6">
                <h1 className="text-3xl font-bold">Calendar</h1>
                <p className="text-secondary mt-1">{monthLabel} · {incomes.filter(i => { const d = new Date(i.date); return d.getFullYear() === calYear && d.getMonth() === calMonth; }).length} trips this month</p>
              </header>
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: '2px', textAlign: 'center' }}>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(d => (
                    <div key={d} style={{ padding: '0.5rem', fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase' }}>{d}</div>
                  ))}
                  {days.map((day, i) => {
                    const trips = day ? tripsByDate.get(day) : undefined;
                    const expTotal = day ? expensesByDate.get(day) : undefined;
                    return (
                      <div key={i} style={{ minHeight: '80px', padding: '0.35rem', background: day ? 'rgba(0,0,0,0.15)' : 'transparent', borderRadius: '8px', border: day ? '1px solid rgba(255,255,255,0.04)' : 'none', display: 'flex', flexDirection: 'column', gap: '0.15rem' }}>
                        {day && <div style={{ fontSize: '0.75rem', fontWeight: 600, color: trips ? 'var(--accent)' : 'var(--text-secondary)' }}>{day}</div>}
                        {trips?.map(t => (
                          <div key={t.id} style={{ fontSize: '0.55rem', background: 'rgba(59,130,246,0.15)', color: 'var(--accent)', padding: '0.15rem 0.3rem', borderRadius: '4px', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer' }} title={`${t.originCity} → ${t.destCity} | ${formatCurrency(t.totalPayout)}`}>
                            {t.originCity?.split(',')[0]} → {t.destCity?.split(',')[0]}
                          </div>
                        ))}
                        {expTotal && !trips ? <div style={{ fontSize: '0.55rem', color: 'var(--danger)', fontWeight: 600 }}>-{formatCurrency(expTotal)}</div> : null}
                        {trips && <div style={{ fontSize: '0.5rem', color: 'var(--success)', fontWeight: 700 }}>{formatCurrency(trips.reduce((s, t) => s + t.totalPayout, 0))}</div>}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ====== REPORTS ====== */}
        {activeTab === 'reports' && (() => {
          const months = [...new Set([...incomes.map(i => i.date.substring(0, 7)), ...expenses.map(e => e.date.substring(0, 7))])].sort().reverse();
          return (
            <div className="animate-fade-in">
              <header className="mb-6">
                <h1 className="text-3xl font-bold">Profit & Loss Reports</h1>
                <p className="text-secondary mt-1">Monthly breakdown with 1099 tax estimates</p>
              </header>

              {/* Summary Cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
                <div className="glass-panel stat-card"><div className="stat-title"><TrendingUp size={16} /> Revenue YTD</div><div className="stat-value text-success" style={{ fontSize: '1.8rem' }}>{formatCurrency(totalIncome)}</div></div>
                <div className="glass-panel stat-card"><div className="stat-title"><TrendingDown size={16} /> Expenses YTD</div><div className="stat-value text-danger" style={{ fontSize: '1.8rem' }}>{formatCurrency(totalExpenses + analysis.totalHiddenCosts)}</div></div>
                <div className="glass-panel stat-card"><div className="stat-title"><Calculator size={16} /> Tax Liability</div><div className="stat-value text-danger" style={{ fontSize: '1.8rem' }}>{formatCurrency(analysis.estimatedTax)}</div></div>
                <div className="glass-panel stat-card"><div className="stat-title"><DollarSign size={16} /> Take-Home</div><div className="stat-value" style={{ fontSize: '1.8rem', color: analysis.afterTaxProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(analysis.afterTaxProfit)}</div></div>
              </div>

              {/* Monthly P&L Table */}
              <div className="glass-panel p-0 overflow-hidden">
                <div className="table-container">
                  <table>
                    <thead>
                      <tr><th>Month</th><th>Trips</th><th>Miles</th><th>Revenue</th><th>Fuel</th><th>Other Exp</th><th>Depr + Maint</th><th>Tax Est</th><th>Net</th></tr>
                    </thead>
                    <tbody>
                      {months.map(month => {
                        const mInc = incomes.filter(i => i.date.startsWith(month));
                        const mExp = expenses.filter(e => e.date.startsWith(month));
                        const mRevenue = mInc.reduce((s, i) => s + i.totalPayout, 0);
                        const mMiles = mInc.reduce((s, i) => s + i.distance, 0);
                        const mFuel = mExp.filter(e => e.category === 'Fuel' || e.category === 'Deadhead').reduce((s, e) => s + e.amount, 0);
                        const mOther = mExp.filter(e => e.category !== 'Fuel' && e.category !== 'Deadhead').reduce((s, e) => s + e.amount, 0);
                        const mHidden = mMiles * (CASCADIA_DEPR_RATE + CASCADIA_MAINT_RESERVE);
                        const mProfit = mRevenue - mFuel - mOther - mHidden;
                        const mTax = Math.max(0, mProfit) * TOTAL_TAX_RATE;
                        const mNet = mProfit - mTax;
                        return (
                          <tr key={month}>
                            <td style={{ fontWeight: 700 }}>{new Date(month + '-01').toLocaleString('en-US', { month: 'short', year: 'numeric' })}</td>
                            <td>{mInc.length}</td>
                            <td>{mMiles.toLocaleString()}</td>
                            <td className="text-success">{formatCurrency(mRevenue)}</td>
                            <td className="text-danger">{formatCurrency(mFuel)}</td>
                            <td className="text-danger">{formatCurrency(mOther)}</td>
                            <td className="text-danger">{formatCurrency(mHidden)}</td>
                            <td className="text-danger">{formatCurrency(mTax)}</td>
                            <td style={{ fontWeight: 800, color: mNet >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(mNet)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Tax Reminder */}
              <div className="glass-panel" style={{ padding: '1.25rem', marginTop: '1.5rem', borderLeft: '3px solid var(--danger)' }}>
                <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', color: 'var(--danger)' }}>1099-NEC Quarterly Estimated Tax</h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.75rem', fontSize: '0.8rem' }}>
                  {[{ q: 'Q1 (Jan-Mar)', due: 'Apr 15' }, { q: 'Q2 (Apr-Jun)', due: 'Jun 15' }, { q: 'Q3 (Jul-Sep)', due: 'Sep 15' }, { q: 'Q4 (Oct-Dec)', due: 'Jan 15' }].map(q => (
                    <div key={q.q} style={{ background: 'rgba(0,0,0,0.2)', padding: '0.6rem', borderRadius: '8px', textAlign: 'center' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.75rem' }}>{q.q}</div>
                      <div className="text-danger" style={{ fontWeight: 800, marginTop: '0.25rem' }}>{formatCurrency(analysis.estimatedTax / 4)}</div>
                      <div className="text-secondary" style={{ fontSize: '0.65rem', marginTop: '0.15rem' }}>Due {q.due}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          );
        })()}

        {/* ====== PERSONAL ====== */}
        {activeTab === 'personal' && (
          <div className="animate-fade-in">
            <header className="mb-6">
              <h1 className="text-3xl font-bold">Personal Expenses</h1>
              <p className="text-secondary mt-1">Monthly personal budget — {formatCurrency(totalPersonalMonthly)}/mo · {formatCurrency(totalPersonalMonthly * 12)}/yr</p>
            </header>

            {/* Summary */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="glass-panel stat-card"><div className="stat-title"><DollarSign size={16} /> Monthly Personal</div><div className="stat-value text-danger" style={{ fontSize: '1.8rem' }}>{formatCurrency(totalPersonalMonthly)}</div></div>
              <div className="glass-panel stat-card"><div className="stat-title"><TrendingUp size={16} /> Monthly Business Net</div><div className="stat-value" style={{ fontSize: '1.8rem', color: analysis.afterTaxProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(analysis.afterTaxProfit)}</div><div className="text-secondary" style={{ fontSize: '0.7rem' }}>After tax & all biz expenses</div></div>
              <div className="glass-panel stat-card"><div className="stat-title"><Scale size={16} /> Remaining After All</div><div className="stat-value" style={{ fontSize: '1.8rem', color: (analysis.afterTaxProfit - totalPersonalMonthly) >= 0 ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(analysis.afterTaxProfit - totalPersonalMonthly)}</div><div className="text-secondary" style={{ fontSize: '0.7rem' }}>Business profit minus personal</div></div>
            </div>

            {/* Personal Expense Table */}
            <div className="glass-panel p-0 overflow-hidden">
              <div className="table-container">
                <table>
                  <thead>
                    <tr><th>Category</th><th>Description</th><th>Monthly</th><th>Annual</th><th></th></tr>
                  </thead>
                  <tbody>
                    {personalExpenses.map(pe => (
                      <tr key={pe.id}>
                        <td style={{ fontWeight: 700 }}>{pe.category}</td>
                        <td>{pe.description}</td>
                        <td>
                          <input type="number" step="0.01" defaultValue={pe.monthlyAmount} style={{ background: 'rgba(0,0,0,0.3)', border: '1px solid var(--border)', borderRadius: '4px', padding: '0.3rem 0.5rem', color: 'var(--text-primary)', width: '100px', fontSize: '0.85rem' }} onChange={e => setPersonalExpenses(prev => prev.map(p => p.id === pe.id ? { ...p, monthlyAmount: Number(e.target.value) || 0 } : p))} />
                        </td>
                        <td className="text-danger">{formatCurrency(pe.monthlyAmount * 12)}</td>
                        <td><button className="btn-icon text-danger" onClick={() => setPersonalExpenses(prev => prev.filter(p => p.id !== pe.id))}><Trash2 size={16} /></button></td>
                      </tr>
                    ))}
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td colSpan={2} style={{ fontWeight: 800, textAlign: 'right' }}>TOTAL</td>
                      <td style={{ fontWeight: 800 }} className="text-danger">{formatCurrency(totalPersonalMonthly)}</td>
                      <td style={{ fontWeight: 800 }} className="text-danger">{formatCurrency(totalPersonalMonthly * 12)}</td>
                      <td></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>

            {/* Add personal expense */}
            <button className="btn-primary" style={{ marginTop: '1rem' }} onClick={() => {
              const cat = prompt('Category (e.g. Savings, Gym, Entertainment)');
              const desc = prompt('Description');
              const amt = prompt('Monthly amount ($)');
              if (cat && desc && amt) setPersonalExpenses(prev => [...prev, { id: `p-${Date.now()}`, category: cat, description: desc, monthlyAmount: Number(amt) || 0 }]);
            }}><Plus size={18} /> Add Personal Expense</button>

            {/* Break-even analysis */}
            <div className="glass-panel" style={{ padding: '1.25rem', marginTop: '1.5rem', borderLeft: '3px solid var(--accent)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.75rem' }}>Break-Even Analysis</h3>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem', fontSize: '0.85rem' }}>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                  <div className="text-secondary" style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700 }}>Need Monthly</div>
                  <div style={{ fontWeight: 800, marginTop: '0.25rem' }}>{formatCurrency(totalPersonalMonthly + totalExpenses + analysis.totalHiddenCosts)}</div>
                  <div className="text-secondary" style={{ fontSize: '0.6rem' }}>Biz + Personal + Tax</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                  <div className="text-secondary" style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700 }}>Min Miles/Mo</div>
                  <div style={{ fontWeight: 800, marginTop: '0.25rem' }}>{Math.ceil((totalPersonalMonthly + totalExpenses + analysis.totalHiddenCosts) / (totalIncome / Math.max(1, analysis.totalMiles))).toLocaleString()}</div>
                  <div className="text-secondary" style={{ fontSize: '0.6rem' }}>at current $/mi rate</div>
                </div>
                <div style={{ background: 'rgba(0,0,0,0.2)', padding: '0.75rem', borderRadius: '8px', textAlign: 'center' }}>
                  <div className="text-secondary" style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700 }}>Min Trips/Mo</div>
                  <div style={{ fontWeight: 800, marginTop: '0.25rem' }}>{Math.ceil(Math.ceil((totalPersonalMonthly + totalExpenses + analysis.totalHiddenCosts) / (totalIncome / Math.max(1, analysis.totalMiles))) / (analysis.totalMiles / Math.max(1, incomes.length)))}</div>
                  <div className="text-secondary" style={{ fontSize: '0.6rem' }}>at avg trip length</div>
                </div>
              </div>
            </div>

            {/* Debt Tracker */}
            <div className="glass-panel" style={{ padding: '1.25rem', marginTop: '1.5rem', borderLeft: '3px solid var(--danger)' }}>
              <h3 style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ color: 'var(--danger)' }}>Outstanding Debts</span>
                <span style={{ fontSize: '1.1rem' }}>{formatCurrency(totalDebt)}</span>
              </h3>
              <div className="table-container">
                <table>
                  <thead><tr><th>Owed To</th><th>Amount</th><th>Since</th><th>Due</th><th>Status</th><th></th></tr></thead>
                  <tbody>
                    {debts.map(d => {
                      const isOverdue = d.dueDate && Number(d.dueDate) < new Date().getFullYear();
                      return (
                        <tr key={d.id}>
                          <td style={{ fontWeight: 700 }}>{d.to}</td>
                          <td className="text-danger" style={{ fontWeight: 700 }}>{formatCurrency(d.amount)}</td>
                          <td className="text-secondary">{d.dateBorrowed}</td>
                          <td>{d.dueDate || '\u2014'}</td>
                          <td>{isOverdue ? <span style={{ fontSize: '0.7rem', background: 'rgba(239,68,68,0.15)', color: 'var(--danger)', padding: '0.1rem 0.4rem', borderRadius: '4px', fontWeight: 700 }}>OVERDUE</span> : <span style={{ fontSize: '0.7rem', color: 'var(--text-secondary)' }}>Active</span>}</td>
                          <td><button className="btn-icon text-success" style={{ fontSize: '0.65rem', padding: '0.15rem 0.4rem' }} onClick={() => { const amt = prompt(`How much to pay off for ${d.to}?`, String(d.amount)); if (amt) { const pay = Number(amt); setDebts(prev => prev.map(dd => dd.id === d.id ? { ...dd, amount: Math.max(0, dd.amount - pay) } : dd).filter(dd => dd.amount > 0)); } }}>Pay</button></td>
                        </tr>
                      );
                    })}
                    <tr style={{ borderTop: '2px solid var(--border)' }}>
                      <td style={{ fontWeight: 800 }}>TOTAL DEBT</td>
                      <td style={{ fontWeight: 800 }} className="text-danger">{formatCurrency(totalDebt)}</td>
                      <td colSpan={4} className="text-secondary" style={{ fontSize: '0.75rem' }}>At $1,000/mo → paid off in ~{Math.ceil(totalDebt / 1000)} months ({new Date(Date.now() + Math.ceil(totalDebt / 1000) * 30 * 86400000).toLocaleDateString('en-US', { month: 'short', year: 'numeric' })})</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ====== MAP ====== */}
        {activeTab === 'map' && (
          <div className="animate-fade-in">
            <header className="mb-6">
              <h1 className="text-3xl font-bold">Route History</h1>
              <p className="text-secondary mt-1">{incomes.length} trips · {analysis.totalMiles.toLocaleString()} loaded miles · {totalDeadhead} deadhead miles</p>
            </header>
            <div className="glass-panel" style={{ padding: 0, overflow: 'hidden', height: '600px', borderRadius: '16px' }}>
              <MapContainer center={[37.0, -98.0]} zoom={4} style={{ height: '100%', width: '100%' }}>
                <TileLayer
                  attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                  url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                />
                {mapPoints.lines.map((line, i) => (
                  <Polyline key={i} positions={line} pathOptions={{ color: '#3b82f6', weight: 3, opacity: 0.7 }} />
                ))}
                {mapPoints.pts.map((pt, i) => (
                  <Marker key={i} position={[pt.lat, pt.lng]}>
                    <Popup>{pt.label}</Popup>
                  </Marker>
                ))}
              </MapContainer>
            </div>
            {/* Trip legend */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: '0.75rem', marginTop: '1rem' }}>
              {incomes.filter(i => i.originCity).map(inc => {
                const tripFuel = fuelCostForMiles(inc.distance, inc.fuelRegion ?? 'AVG');
                return (
                  <div key={inc.id} className="glass-panel" style={{ padding: '1rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div>
                        <div className="text-accent font-medium" style={{ fontSize: '0.85rem' }}>{inc.originCity}</div>
                        <div className="text-secondary" style={{ fontSize: '0.75rem' }}>→ {inc.destCity}</div>
                      </div>
                      <div className="text-success font-bold">{formatCurrency(inc.totalPayout)}</div>
                    </div>
                    <div style={{ display: 'flex', gap: '1rem', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                      <span>{inc.distance.toLocaleString()} mi</span>
                      <span>{formatCurrency(inc.ratePerMile)}/mi</span>
                      <span className="text-danger">Fuel: {formatCurrency(tripFuel)}</span>
                      {inc.deadheadMiles ? <span style={{ color: '#f97316' }}>+{inc.deadheadMiles} DH</span> : null}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </main>

      {/* Modals */}
      {isIncomeModalOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setIsIncomeModalOpen(false)}>
          <div className="modal animate-scale-in">
            <div className="modal-header"><h2 className="modal-title">Record New Load</h2><button className="btn-icon" onClick={() => setIsIncomeModalOpen(false)}><X size={20} /></button></div>
            <form onSubmit={handleAddIncome}>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group"><label>Date</label><input type="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} /></div>
                <div className="form-group"><label>Load ID / BOL #</label><input type="text" name="loadId" required placeholder="e.g. LD-1024" /></div>
              </div>
              <div className="form-group"><label>Broker / Customer</label><input type="text" name="broker" required placeholder="e.g. TQL, CH Robinson" /></div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group"><label>Distance (Miles)</label><input type="number" name="distance" min="1" required placeholder="850" /></div>
                <div className="form-group"><label>Total Payout ($)</label><input type="number" step="0.01" min="0" name="totalPayout" required placeholder="2500.00" /></div>
              </div>
              <div className="form-actions"><button type="button" className="btn-icon" onClick={() => setIsIncomeModalOpen(false)}>Cancel</button><button type="submit" className="btn-primary">Save Load</button></div>
            </form>
          </div>
        </div>
      )}

      {isExpenseModalOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setIsExpenseModalOpen(false)}>
          <div className="modal animate-scale-in">
            <div className="modal-header"><h2 className="modal-title">Record Expense</h2><button className="btn-icon" onClick={() => setIsExpenseModalOpen(false)}><X size={20} /></button></div>
            <form onSubmit={handleAddExpense}>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group"><label>Date</label><input type="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} /></div>
                <div className="form-group"><label>Category</label>
                  <select name="category" required>
                    <option value="Fuel">Fuel & DEF</option>
                    <option value="Deadhead">Deadhead (Empty)</option>
                    <option value="Maintenance">Maintenance & Repairs</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Tolls">Tolls & Scales</option>
                    <option value="Truck Payment">Truck Payment</option>
                    <option value="Permits">Permits & Licensing</option>
                    <option value="Parking">Parking & Rest Stops</option>
                    <option value="ELD">ELD / Subscriptions</option>
                    <option value="Lumper">Lumper Fees</option>
                    <option value="IFTA">IFTA / Fuel Tax</option>
                    <option value="Dispatch">Dispatch Fee</option>
                    <option value="Lock Box">Lock Box</option>
                    <option value="Trailer">Trailer Rental</option>
                    <option value="Registration">Truck Registration</option>
                    <option value="Food">Road Food</option>
                    <option value="Other">Other Operational</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label>Description</label><input type="text" name="description" required placeholder="e.g. Pilot Flying J - Dallas, TX" /></div>
              <div className="form-group"><label>Amount ($)</label><input type="number" step="0.01" min="0" name="amount" required placeholder="450.00" /></div>
              <div className="form-actions"><button type="button" className="btn-icon" onClick={() => setIsExpenseModalOpen(false)}>Cancel</button><button type="submit" className="btn-primary">Save Expense</button></div>
            </form>
          </div>
        </div>
      )}

      {/* Manifest / PDF Upload Modal */}
      {isManifestModalOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setIsManifestModalOpen(false)}>
          <div className="modal animate-scale-in" style={{ maxWidth: '650px' }}>
            <div className="modal-header"><h2 className="modal-title">Upload Document</h2><button className="btn-icon" onClick={() => { setIsManifestModalOpen(false); setPdfText(''); }}><X size={20} /></button></div>

            {/* Step 1: Upload */}
            <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem' }}>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', background: 'rgba(59,130,246,0.06)', border: '2px dashed rgba(59,130,246,0.3)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s' }}>
                <Upload size={24} style={{ color: 'var(--accent)', marginBottom: '0.5rem' }} />
                <span style={{ fontWeight: 700, color: 'var(--accent)', fontSize: '0.9rem' }}>Upload PDF</span>
                <span className="text-secondary" style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}>Manifest, BOL, Rate Con, Fuel Receipt</span>
                <input type="file" accept=".pdf" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) handlePdfUpload(f); }} />
              </label>
              <label style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '1.25rem', background: 'rgba(16,185,129,0.06)', border: '2px dashed rgba(16,185,129,0.3)', borderRadius: '12px', cursor: 'pointer', transition: 'all 0.2s' }}>
                <Upload size={24} style={{ color: 'var(--success)', marginBottom: '0.5rem' }} />
                <span style={{ fontWeight: 700, color: 'var(--success)', fontSize: '0.9rem' }}>Upload CSV</span>
                <span className="text-secondary" style={{ fontSize: '0.7rem', marginTop: '0.25rem' }}>date,origin,dest,miles,pay,broker</span>
                <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = (ev) => handleManifestUpload(ev.target?.result as string); r.readAsText(f); } }} />
              </label>
            </div>

            {pdfLoading && <div style={{ textAlign: 'center', padding: '1rem', color: 'var(--accent)' }}>Extracting text from PDF...</div>}

            {/* Step 2: Review extracted text or paste manually */}
            <p className="text-secondary" style={{ fontSize: '0.8rem', marginBottom: '0.5rem' }}>{pdfText ? '✅ Text extracted from PDF — review and edit, then click Import:' : 'Or paste data manually (CSV or raw text from a manifest):'}</p>
            <textarea
              id="manifest-text"
              rows={10}
              value={pdfText}
              onChange={(e) => setPdfText(e.target.value)}
              placeholder={`Paste manifest/BOL text here, or upload a PDF above.\n\nCSV format:\n2026-03-01,Houston TX,Dallas TX,240,650,TQL\n2026-03-03,Dallas TX,Denver CO,790,1800,CH Robinson\n\nOr raw text - we'll show it for you to review.`}
              style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.8rem', resize: 'vertical', lineHeight: 1.5 }}
            />

            <div style={{ display: 'flex', gap: '0.75rem', marginTop: '1rem', justifyContent: 'flex-end' }}>
              <button style={{ background: 'rgba(255,255,255,0.05)', color: 'var(--text-secondary)', border: '1px solid var(--border)', borderRadius: '8px', padding: '0.5rem 1rem', cursor: 'pointer', fontSize: '0.85rem' }} onClick={() => { setIsManifestModalOpen(false); setPdfText(''); }}>Cancel</button>
              <button className="btn-primary" onClick={() => { if (pdfText) handleManifestUpload(pdfText); }}>Import as Trips</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
