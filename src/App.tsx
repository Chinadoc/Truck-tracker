import React, { useState, useMemo } from 'react';
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
  Clock
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
const MPG = 6.5;

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
  category: 'Fuel' | 'Maintenance' | 'Insurance' | 'Tolls' | 'Other' | 'Deadhead' | 'Permits' | 'Truck Payment' | 'Parking' | 'ELD' | 'Lumper' | 'IFTA';
  description: string;
  amount: number;
};

// === REAL TRIP DATA ===
const INITIAL_TRIPS: Income[] = [
  {
    id: 't1', date: '2026-02-15',
    loadId: 'SLC-AUS-001', broker: 'Spot Market',
    distance: 1330, ratePerMile: 2700 / 1330, totalPayout: 2700,
    originCity: 'Salt Lake City, UT', destCity: 'Austin, TX',
    originCoords: [40.7608, -111.8910], destCoords: [30.2672, -97.7431],
    fuelRegion: 'UT', destFuelRegion: 'TX',
    departureTime: '2026-02-15T06:00', arrivalTime: '2026-02-16T18:00',
  },
  {
    id: 't2', date: '2026-02-17',
    loadId: 'TMP-MRG-002', broker: 'Spot Market',
    distance: 1200, ratePerMile: 2200 / 1200, totalPayout: 2200,
    originCity: 'Temple, TX', destCity: 'Marengo, OH',
    originCoords: [31.0982, -97.3428], destCoords: [40.4006, -81.4468],
    fuelRegion: 'TX', destFuelRegion: 'OH',
    deadheadMiles: 70, deadheadFrom: 'Austin, TX → Temple, TX',
    departureTime: '2026-02-17T05:00', arrivalTime: '2026-02-18T20:00',
  },
  {
    id: 't3', date: '2026-02-19',
    loadId: 'OH-LV-003', broker: 'Spot Market',
    distance: 2000, ratePerMile: 4000 / 2000, totalPayout: 4000,
    originCity: 'Ashland, OH 44805', destCity: 'Las Vegas, NV 89139',
    originCoords: [40.8687, -82.3182], destCoords: [36.1699, -115.1398],
    fuelRegion: 'OH', destFuelRegion: 'NV',
    deadheadMiles: 20, deadheadFrom: 'Marengo → Ashland, OH',
    departureTime: '2026-02-19T04:00', arrivalTime: '2026-02-21T14:00',
  },
  {
    id: 't4', date: '2026-02-22',
    loadId: 'LV-CA-004', broker: 'Spot Market',
    distance: 275, ratePerMile: 700 / 275, totalPayout: 700,
    originCity: 'Las Vegas, NV 89139', destCity: 'La Mirada, CA 90631',
    originCoords: [36.1699, -115.1398], destCoords: [33.9172, -118.0120],
    fuelRegion: 'NV', destFuelRegion: 'CA',
    departureTime: '2026-02-22T07:00', arrivalTime: '2026-02-22T12:00',
  },
  {
    id: 't5', date: '2026-02-23',
    loadId: 'CA-GP-005', broker: 'Spot Market',
    distance: 1435, ratePerMile: 3050 / 1435, totalPayout: 3050,
    originCity: 'Walnut, CA 91789', destCity: 'Grand Prairie, TX 75050',
    originCoords: [34.0203, -117.8654], destCoords: [32.7460, -96.9978],
    fuelRegion: 'CA', destFuelRegion: 'TX',
    deadheadMiles: 5, deadheadFrom: 'La Mirada → Walnut, CA',
    departureTime: '2026-02-23T03:00', arrivalTime: '2026-02-24T22:00',
  },
  {
    id: 't6', date: '2026-02-25',
    loadId: 'FW-HOU-006', broker: 'Spot Market',
    distance: 250, ratePerMile: 700 / 250, totalPayout: 700,
    originCity: 'Fort Worth, TX 76137', destCity: 'Houston, TX 77038',
    originCoords: [32.7555, -97.3308], destCoords: [29.8543, -95.4147],
    fuelRegion: 'TX', destFuelRegion: 'TX',
    deadheadMiles: 15, deadheadFrom: 'Grand Prairie → Fort Worth, TX',
    departureTime: '2026-02-25T06:00', arrivalTime: '2026-02-25T10:30',
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
  return exps;
};

const INITIAL_EXPENSES: Expense[] = buildExpenses();

// === MAIN APP ===
function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'income' | 'expenses' | 'map'>('dashboard');
  const [incomes, setIncomes] = useState<Income[]>(INITIAL_TRIPS);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isManifestModalOpen, setIsManifestModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);
  const [expandedTrip, setExpandedTrip] = useState<string | null>(null);

  // Derived
  const totalIncome = useMemo(() => incomes.reduce((s, i) => s + i.totalPayout, 0), [incomes]);
  const totalExpenses = useMemo(() => expenses.reduce((s, e) => s + e.amount, 0), [expenses]);
  const totalMiles = useMemo(() => incomes.reduce((s, i) => s + i.distance, 0), [incomes]);
  const totalDeadhead = useMemo(() => incomes.reduce((s, i) => s + (i.deadheadMiles || 0), 0), [incomes]);

  const analysis = useMemo(() => {
    const expectedFuelCost = totalMiles * (REGIONAL_DIESEL['AVG'].price / MPG);
    const trackedFuelCost = expenses.filter(e => e.category === 'Fuel').reduce((s, e) => s + e.amount, 0);
    const maintReserve = totalMiles * CASCADIA_MAINT_RESERVE;
    const vehicleDepreciation = totalMiles * CASCADIA_DEPR_RATE;
    const totalHiddenCosts = maintReserve + vehicleDepreciation;
    const ownerOperatorCashProfit = totalIncome - totalExpenses;
    const ownerOperatorTrueProfit = ownerOperatorCashProfit - totalHiddenCosts;
    const companyEquivalentEarnings = totalMiles * COMPANY_DRIVER_RATE;
    return {
      totalMiles, expectedFuelCost, trackedFuelCost, maintReserve,
      vehicleDepreciation, totalHiddenCosts, ownerOperatorCashProfit,
      ownerOperatorTrueProfit, companyEquivalentEarnings,
      isBeatingCompanyRate: ownerOperatorTrueProfit > companyEquivalentEarnings,
    };
  }, [totalIncome, totalExpenses, totalMiles, expenses]);

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

            {/* Row 1: Big Picture */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>
              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <div className="stat-title text-success justify-center" style={{ marginBottom: '0.25rem' }}><TrendingUp size={14} /> Gross Revenue</div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatCurrency(totalIncome)}</div>
                <div className="text-secondary" style={{ fontSize: '0.8rem' }}>{analysis.totalMiles.toLocaleString()} loaded mi + {totalDeadhead} deadhead</div>
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

            {/* Row 3: Chart */}
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

                        return (
                          <React.Fragment key={inc.id}>
                            <tr onClick={() => setExpandedTrip(isExpanded ? null : inc.id)} style={{ cursor: 'pointer' }}>
                              <td>
                                <div>{inc.date}</div>
                                {inc.departureTime && inc.arrivalTime ? <div style={{ fontSize: '0.65rem', color: 'var(--text-secondary)', display: 'flex', alignItems: 'center', gap: '0.25rem', marginTop: '0.15rem' }}><Clock size={10} /> {getTripDuration(inc.departureTime, inc.arrivalTime)}</div> : null}
                              </td>
                              <td>
                                <div className="font-medium text-accent">{inc.originCity}</div>
                                <div className="text-secondary" style={{ fontSize: '0.75rem' }}>→ {inc.destCity}</div>
                                {inc.deadheadMiles ? <div style={{ fontSize: '0.65rem', color: '#f97316' }}>+{inc.deadheadMiles} mi deadhead</div> : null}
                              </td>
                              <td>{inc.distance.toLocaleString()}</td>
                              <td>{formatCurrency(inc.ratePerMile)}</td>
                              <td className="text-success font-semibold">{formatCurrency(inc.totalPayout)}</td>
                              <td className="text-danger">{formatCurrency(tripFuel)}</td>
                              <td style={{ color: tripTrueNet >= 0 ? 'var(--success)' : 'var(--danger)', fontWeight: 700 }}>{formatCurrency(tripTrueNet)}</td>
                              <td>
                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                  {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
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
            <header className="mb-8 flex justify-between items-center flex-wrap gap-4">
              <div><h1 className="text-3xl font-bold">Business Expenses</h1><p className="text-secondary mt-2">Fuel, deadhead, maintenance, and operational costs</p></div>
              <button className="btn-primary flex items-center gap-2" onClick={() => setIsExpenseModalOpen(true)}><Plus size={18} /> Add Expense</button>
            </header>
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

      {/* Manifest Upload Modal */}
      {isManifestModalOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setIsManifestModalOpen(false)}>
          <div className="modal animate-scale-in" style={{ maxWidth: '600px' }}>
            <div className="modal-header"><h2 className="modal-title">Upload Manifest / CSV</h2><button className="btn-icon" onClick={() => setIsManifestModalOpen(false)}><X size={20} /></button></div>
            <p className="text-secondary" style={{ fontSize: '0.85rem', marginBottom: '1rem' }}>Paste CSV data or upload a .csv file. Format: <code style={{ background: 'rgba(0,0,0,0.3)', padding: '0.15rem 0.4rem', borderRadius: '4px', fontSize: '0.8rem' }}>date,origin,destination,miles,pay,broker</code></p>
            <textarea id="manifest-text" rows={8} placeholder={`2026-03-01,Houston TX,Dallas TX,240,650,TQL\n2026-03-03,Dallas TX,Denver CO,790,1800,CH Robinson`} style={{ width: '100%', padding: '0.75rem', background: 'rgba(0,0,0,0.2)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-primary)', fontFamily: 'monospace', fontSize: '0.85rem', resize: 'vertical' }}></textarea>
            <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginTop: '1rem' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--accent)', fontSize: '0.85rem', fontWeight: 600 }}>
                <Upload size={16} /> Or upload .csv
                <input type="file" accept=".csv,.txt" style={{ display: 'none' }} onChange={(e) => { const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = (ev) => handleManifestUpload(ev.target?.result as string); r.readAsText(f); } }} />
              </label>
              <div style={{ flex: 1 }}></div>
              <button className="btn-primary" onClick={() => { const el = document.getElementById('manifest-text') as HTMLTextAreaElement; if (el?.value) handleManifestUpload(el.value); }}>Import Trips</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
