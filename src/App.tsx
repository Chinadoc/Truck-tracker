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
  Scale
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
import { v4 as uuidv4 } from 'uuid';

// Constants for 2023 Freightliner Cascadia Scenario
const COMPANY_DRIVER_RATE = 0.65;
const VEHICLE_VALUE = 85000;
const THREE_YEAR_MILES = 360000; // 120k miles/year
const CASCADIA_DEPR_RATE = VEHICLE_VALUE / THREE_YEAR_MILES; // ~$0.236/mi
const CASCADIA_MAINT_RESERVE = 0.15; // $0.15/mi
const CASCADIA_FUEL_RATE = 0.55; // Expected $0.55/mi

// Default Trip Cycle Loop
const today = new Date().toISOString().split('T')[0];
const INITIAL_TRIPS: Income[] = [
  { id: 't1', date: today, loadId: 'Utah to Houston, TX', broker: 'Spot Market', distance: 1540, ratePerMile: 2.00, totalPayout: 1540 * 2.00 },
  { id: 't2', date: today, loadId: 'Houston to Columbus, OH', broker: 'Spot Market', distance: 1140, ratePerMile: 2.00, totalPayout: 1140 * 2.00 },
  { id: 't3', date: today, loadId: 'Columbus to Las Vegas, NV', broker: 'Spot Market', distance: 2030, ratePerMile: 2.00, totalPayout: 2030 * 2.00 },
  { id: 't4', date: today, loadId: 'Las Vegas to Los Angeles, CA', broker: 'Spot Market', distance: 270, ratePerMile: 2.00, totalPayout: 270 * 2.00 },
  { id: 't5', date: today, loadId: 'Los Angeles to Dallas, TX', broker: 'Spot Market', distance: 1440, ratePerMile: 2.00, totalPayout: 1440 * 2.00 },
  { id: 't6', date: today, loadId: 'Dallas to Houston, TX', broker: 'Spot Market', distance: 240, ratePerMile: 2.00, totalPayout: 240 * 2.00 },
];

const INITIAL_EXPENSES: Expense[] = [
  { id: 'e1', date: today, category: 'Fuel', description: 'Expected Fuel Cost @ $0.55/mi (Initial Loop)', amount: 6660 * CASCADIA_FUEL_RATE }
];

// Types
type Income = {
  id: string;
  date: string;
  loadId: string;
  broker: string;
  distance: number;
  ratePerMile: number;
  totalPayout: number;
};

type Expense = {
  id: string;
  date: string;
  category: 'Fuel' | 'Maintenance' | 'Insurance' | 'Tolls' | 'Other';
  description: string;
  amount: number;
};

// Main App Component
function App() {
  const [activeTab, setActiveTab] = useState<'dashboard' | 'income' | 'expenses'>('dashboard');

  // State
  const [incomes, setIncomes] = useState<Income[]>(INITIAL_TRIPS);
  const [expenses, setExpenses] = useState<Expense[]>(INITIAL_EXPENSES);

  // Modals
  const [isIncomeModalOpen, setIsIncomeModalOpen] = useState(false);
  const [isExpenseModalOpen, setIsExpenseModalOpen] = useState(false);

  // Derived Data
  const totalIncome = useMemo(() => incomes.reduce((sum, item) => sum + item.totalPayout, 0), [incomes]);
  const totalExpenses = useMemo(() => expenses.reduce((sum, item) => sum + item.amount, 0), [expenses]);
  const totalMiles = useMemo(() => incomes.reduce((sum, item) => sum + item.distance, 0), [incomes]);

  // Analysis Data
  const analysis = useMemo(() => {
    // We separate active tracked fuel expenses from our expected "savings box" reserves.
    const expectedFuelCost = totalMiles * CASCADIA_FUEL_RATE;
    const trackedFuelCost = expenses.filter(e => e.category === 'Fuel').reduce((sum, e) => sum + e.amount, 0);

    // Savings Box Reserves (These are hidden costs you hold back)
    const maintReserve = totalMiles * CASCADIA_MAINT_RESERVE;
    const vehicleDepreciation = totalMiles * CASCADIA_DEPR_RATE;
    const totalHiddenCosts = maintReserve + vehicleDepreciation;

    const ownerOperatorCashProfit = totalIncome - totalExpenses;
    const ownerOperatorTrueProfit = ownerOperatorCashProfit - totalHiddenCosts;
    const companyEquivalentEarnings = totalMiles * COMPANY_DRIVER_RATE;

    return {
      totalMiles,
      expectedFuelCost,
      trackedFuelCost,
      maintReserve,
      vehicleDepreciation,
      totalHiddenCosts,
      ownerOperatorCashProfit,
      ownerOperatorTrueProfit,
      companyEquivalentEarnings,
      isBeatingCompanyRate: ownerOperatorTrueProfit > companyEquivalentEarnings
    };
  }, [totalIncome, totalExpenses, totalMiles, expenses]);

  // Chart Data Preparation (Grouping by Month - simple version)
  const chartData = useMemo(() => {
    const monthlyData: Record<string, { income: number, expense: number }> = {};

    incomes.forEach(inc => {
      const month = inc.date.substring(0, 7); // YYYY-MM
      if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
      monthlyData[month].income += inc.totalPayout;
    });

    expenses.forEach(exp => {
      const month = exp.date.substring(0, 7);
      if (!monthlyData[month]) monthlyData[month] = { income: 0, expense: 0 };
      monthlyData[month].expense += exp.amount;
    });

    // Convert to array and sort
    return Object.entries(monthlyData)
      .map(([name, data]) => ({ name, Income: data.income, Expenses: data.expense }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [incomes, expenses]);

  // Handlers
  const handleAddIncome = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const distance = Number(formData.get('distance'));
    const totalPayout = Number(formData.get('totalPayout'));

    const newIncome: Income = {
      id: uuidv4(),
      date: formData.get('date') as string,
      loadId: formData.get('loadId') as string,
      broker: formData.get('broker') as string,
      distance,
      ratePerMile: distance > 0 ? totalPayout / distance : 0,
      totalPayout
    };
    setIncomes([...incomes, newIncome].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setIsIncomeModalOpen(false);
  };

  const handleAddExpense = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const newExpense: Expense = {
      id: uuidv4(),
      date: formData.get('date') as string,
      category: formData.get('category') as Expense['category'],
      description: formData.get('description') as string,
      amount: Number(formData.get('amount'))
    };
    setExpenses([...expenses, newExpense].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()));
    setIsExpenseModalOpen(false);
  };

  const deleteIncome = (id: string) => setIncomes(incomes.filter(i => i.id !== id));
  const deleteExpense = (id: string) => setExpenses(expenses.filter(e => e.id !== id));

  // Render Helpers
  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  return (
    <div className="app-container">
      {/* Sidebar Navigation */}
      <aside className="sidebar glass-panel" style={{ borderRadius: 0, borderTop: 0, borderBottom: 0, borderLeft: 0 }}>
        <div className="brand">
          <Truck size={28} className="text-accent" />
          <span>Road Ledger</span>
        </div>

        <nav className="nav-links mt-8">
          <button
            className={`nav-item ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <LayoutDashboard size={20} />
            <span>Dashboard</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'income' ? 'active' : ''}`}
            onClick={() => setActiveTab('income')}
          >
            <TrendingUp size={20} className={activeTab === 'income' ? 'text-accent' : 'text-success'} />
            <span>Income & Loads</span>
          </button>
          <button
            className={`nav-item ${activeTab === 'expenses' ? 'active' : ''}`}
            onClick={() => setActiveTab('expenses')}
          >
            <TrendingDown size={20} className={activeTab === 'expenses' ? 'text-accent' : 'text-danger'} />
            <span>Expenses</span>
          </button>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="main-content">
        {activeTab === 'dashboard' && (
          <div className="animate-fade-in">
            <header className="mb-6">
              <h1 className="text-3xl font-bold">Owner-Operator Command Center</h1>
              <p className="text-secondary mt-1">2023 Freightliner Cascadia · 290k mi · 6,660 mi this cycle @ $2.00/mi</p>
            </header>

            {/* === ROW 1: The Big Picture — 3 columns === */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1.5rem' }}>

              {/* Card 1: Gross Revenue */}
              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <div className="stat-title text-success justify-center" style={{ marginBottom: '0.25rem' }}>
                  <TrendingUp size={14} /> Gross Revenue
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatCurrency(totalIncome)}</div>
                <div className="text-secondary" style={{ fontSize: '0.8rem' }}>{analysis.totalMiles.toLocaleString()} miles · $2.00/mi</div>
              </div>

              {/* Card 2: All Costs (tracked + hidden) */}
              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center' }}>
                <div className="stat-title text-danger justify-center" style={{ marginBottom: '0.25rem' }}>
                  <TrendingDown size={14} /> Total True Costs
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatCurrency(totalExpenses + analysis.totalHiddenCosts)}</div>
                <div className="text-secondary" style={{ fontSize: '0.8rem' }}>Tracked + Hidden Reserves</div>
              </div>

              {/* Card 3: TRUE Net */}
              <div className="glass-panel" style={{ padding: '1.25rem', textAlign: 'center', borderTop: `4px solid ${analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)'}` }}>
                <div className="stat-title justify-center" style={{ color: analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)', marginBottom: '0.25rem' }}>
                  <DollarSign size={14} /> True Net Profit
                </div>
                <div style={{ fontSize: '2rem', fontWeight: 800, color: analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(analysis.ownerOperatorTrueProfit)}</div>
                <div className="text-secondary" style={{ fontSize: '0.8rem' }}>After ALL costs & reserves</div>
              </div>
            </div>

            {/* === ROW 2: Two-panel layout === */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1.5rem', marginBottom: '1.5rem' }}>

              {/* LEFT PANEL: Per-Mile Waterfall + Buckets */}
              <div className="glass-panel" style={{ padding: '1.5rem' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Calculator size={18} className="text-accent" />
                  Where Every Dollar Goes (Per Mile)
                </h3>

                {/* Per-Mile Waterfall */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '0.5rem', marginBottom: '1.5rem' }}>
                  {[
                    { label: 'Rate', value: '$2.00', color: 'var(--success)', sub: 'per mile' },
                    { label: 'Fuel', value: `-$${CASCADIA_FUEL_RATE.toFixed(2)}`, color: 'var(--danger)', sub: 'diesel/DEF' },
                    { label: 'Depreciation', value: `-$${CASCADIA_DEPR_RATE.toFixed(3)}`, color: 'var(--danger)', sub: '$85k / 3yr' },
                    { label: 'Maint Reserve', value: `-$${CASCADIA_MAINT_RESERVE.toFixed(2)}`, color: '#eab308', sub: 'tires/repairs' },
                    { label: 'TRUE Net', value: `$${(2.00 - CASCADIA_FUEL_RATE - CASCADIA_DEPR_RATE - CASCADIA_MAINT_RESERVE).toFixed(3)}`, color: 'var(--accent)', sub: 'per mile profit' },
                  ].map((item, i) => (
                    <div key={i} style={{ background: 'rgba(0,0,0,0.25)', borderRadius: '12px', padding: '0.75rem', textAlign: 'center', border: '1px solid var(--border)' }}>
                      <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', color: 'var(--text-secondary)', fontWeight: 700, letterSpacing: '0.05em', marginBottom: '0.25rem' }}>{item.label}</div>
                      <div style={{ fontSize: '1.15rem', fontWeight: 800, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: '0.6rem', color: 'var(--text-secondary)', marginTop: '0.15rem' }}>{item.sub}</div>
                    </div>
                  ))}
                </div>

                {/* Expense Bucket Bars */}
                <h4 style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Wrench size={14} /> Expense Buckets (Filling Up)
                </h4>

                {[
                  { name: 'Diesel & DEF', tracked: analysis.trackedFuelCost, expected: analysis.expectedFuelCost, color: analysis.trackedFuelCost > analysis.expectedFuelCost ? 'var(--danger)' : 'var(--success)' },
                  { name: 'Truck Depreciation', tracked: analysis.vehicleDepreciation, expected: analysis.vehicleDepreciation, color: 'var(--danger)' },
                  { name: 'Maintenance & Tires', tracked: analysis.maintReserve, expected: analysis.maintReserve, color: '#eab308' },
                ].map((bucket, i) => (
                  <div key={i} style={{ marginBottom: '0.75rem' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '0.3rem' }}>
                      <span>{bucket.name}</span>
                      <span>{formatCurrency(bucket.tracked)} / {formatCurrency(bucket.expected)}</span>
                    </div>
                    <div className="bucket-bar-bg">
                      <div className="bucket-bar-fill" style={{ background: bucket.color, width: `${Math.min(100, (bucket.tracked / Math.max(1, bucket.expected)) * 100)}%`, opacity: 0.8 }}></div>
                    </div>
                  </div>
                ))}

                {/* Summary line */}
                <div style={{ marginTop: '1rem', padding: '0.75rem 1rem', background: 'rgba(0,0,0,0.2)', borderRadius: '10px', border: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span className="text-secondary" style={{ fontSize: '0.85rem', fontWeight: 600 }}>Total Hidden Reserves Set Aside:</span>
                  <span className="text-danger" style={{ fontSize: '1.1rem', fontWeight: 800 }}>-{formatCurrency(analysis.totalHiddenCosts)}</span>
                </div>
              </div>

              {/* RIGHT PANEL: Head-to-Head */}
              <div className="glass-panel" style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column' }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '1.25rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <Scale size={18} className="text-accent" />
                  Head-to-Head
                </h3>

                {/* Company Driver Card */}
                <div style={{ background: 'rgba(0,0,0,0.3)', borderRadius: '12px', padding: '1.25rem', border: '1px solid var(--border)', position: 'relative', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{ position: 'absolute', top: 8, right: 8, opacity: 0.08 }}><DollarSign size={56} /></div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: 'var(--text-secondary)', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Company Driver</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800 }}>{formatCurrency(analysis.companyEquivalentEarnings)}</div>
                  <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>Guaranteed @ ${COMPANY_DRIVER_RATE.toFixed(2)}/mi · {analysis.totalMiles.toLocaleString()} mi</div>
                </div>

                {/* VS pill */}
                <div style={{ display: 'flex', justifyContent: 'center', margin: '-0.25rem 0', position: 'relative', zIndex: 1 }}>
                  <span style={{ background: '#000', color: 'var(--text-secondary)', fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 800, padding: '0.2rem 0.75rem', borderRadius: '20px', border: '1px solid var(--border)' }}>VS</span>
                </div>

                {/* Owner-Op Card */}
                <div style={{ background: analysis.isBeatingCompanyRate ? 'rgba(16,185,129,0.06)' : 'rgba(239,68,68,0.06)', borderRadius: '12px', padding: '1.25rem', border: `1px solid ${analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)'}`, position: 'relative', overflow: 'hidden', marginBottom: '0.5rem' }}>
                  <div style={{ position: 'absolute', top: 8, right: 8, opacity: 0.08 }}><Truck size={56} /></div>
                  <div style={{ fontSize: '0.65rem', textTransform: 'uppercase', fontWeight: 700, color: analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>Owner-Operator True Net</div>
                  <div style={{ fontSize: '2rem', fontWeight: 800, color: analysis.isBeatingCompanyRate ? 'var(--success)' : 'var(--danger)' }}>{formatCurrency(analysis.ownerOperatorTrueProfit)}</div>
                  <div className="text-secondary" style={{ fontSize: '0.75rem', marginTop: '0.25rem' }}>After all costs + {formatCurrency(analysis.totalHiddenCosts)} reserves</div>
                </div>

                {/* Net Difference */}
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

            {/* === ROW 3: Chart === */}
            <div className="glass-panel chart-container">
              <h3 style={{ marginBottom: '1rem', fontWeight: 600, fontSize: '1rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>Income vs Expenses (Monthly)</h3>
              {chartData.length > 0 ? (
                <ResponsiveContainer width="100%" height="90%">
                  <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.1)" vertical={false} />
                    <XAxis dataKey="name" stroke="var(--text-secondary)" />
                    <YAxis stroke="var(--text-secondary)" tickFormatter={(value) => `$${value}`} />
                    <RechartsTooltip
                      contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: '8px', color: 'white' }}
                      itemStyle={{ color: 'white' }}
                      formatter={(value: any) => formatCurrency(Number(value))}
                    />
                    <Legend />
                    <Bar dataKey="Income" fill="var(--success)" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="Expenses" fill="var(--danger)" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-secondary">
                  No data available to display chart. Add incomes and expenses to see your performance.
                </div>
              )}
            </div>
          </div>
        )}

        {/* Income View */}
        {activeTab === 'income' && (
          <div className="animate-fade-in">
            <header className="mb-8 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-bold">Income & Loads</h1>
                <p className="text-secondary mt-2">Manage your completed loads and revenue</p>
              </div>
              <button className="btn-primary flex items-center gap-2" onClick={() => setIsIncomeModalOpen(true)}>
                <Plus size={18} /> Add Load
              </button>
            </header>

            <div className="glass-panel p-0 overflow-hidden">
              <div className="table-container">
                {incomes.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Load ID</th>
                        <th>Broker/Customer</th>
                        <th>Distance (mi)</th>
                        <th>Rate/Mile</th>
                        <th>Total Payout</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {incomes.map(inc => (
                        <tr key={inc.id}>
                          <td>{inc.date}</td>
                          <td className="font-medium text-accent">{inc.loadId}</td>
                          <td>{inc.broker}</td>
                          <td>{inc.distance.toLocaleString()}</td>
                          <td>{formatCurrency(inc.ratePerMile)}</td>
                          <td className="text-success font-semibold">{formatCurrency(inc.totalPayout)}</td>
                          <td>
                            <button className="btn-icon text-danger" onClick={() => deleteIncome(inc.id)}>
                              <Trash2 size={18} />
                            </button>
                          </td>
                        </tr>
                      ))}
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

        {/* Expenses View */}
        {activeTab === 'expenses' && (
          <div className="animate-fade-in">
            <header className="mb-8 flex justify-between items-center flex-wrap gap-4">
              <div>
                <h1 className="text-3xl font-bold">Business Expenses</h1>
                <p className="text-secondary mt-2">Track fuel, maintenance, and operational costs</p>
              </div>
              <button className="btn-primary flex items-center gap-2" onClick={() => setIsExpenseModalOpen(true)}>
                <Plus size={18} /> Add Expense
              </button>
            </header>

            <div className="glass-panel p-0 overflow-hidden">
              <div className="table-container">
                {expenses.length > 0 ? (
                  <table>
                    <thead>
                      <tr>
                        <th>Date</th>
                        <th>Category</th>
                        <th>Description</th>
                        <th>Amount</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {expenses.map(exp => (
                        <tr key={exp.id}>
                          <td>{exp.date}</td>
                          <td>
                            <span className="px-2 py-1 rounded bg-black/30 border border-white/10 text-sm">
                              {exp.category}
                            </span>
                          </td>
                          <td>{exp.description}</td>
                          <td className="text-danger font-semibold">{formatCurrency(exp.amount)}</td>
                          <td>
                            <button className="btn-icon" onClick={() => deleteExpense(exp.id)}>
                              <Trash2 size={18} />
                            </button>
                          </td>
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
      </main>

      {/* Modals */}
      {isIncomeModalOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setIsIncomeModalOpen(false)}>
          <div className="modal animate-scale-in">
            <div className="modal-header">
              <h2 className="modal-title">Record New Load</h2>
              <button className="btn-icon" onClick={() => setIsIncomeModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAddIncome}>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="form-group">
                  <label>Load ID / BOL #</label>
                  <input type="text" name="loadId" required placeholder="e.g. LD-1024" />
                </div>
              </div>
              <div className="form-group">
                <label>Broker / Customer</label>
                <input type="text" name="broker" required placeholder="e.g. TQL, CH Robinson" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label>Distance (Miles)</label>
                  <input type="number" name="distance" min="1" required placeholder="850" />
                </div>
                <div className="form-group">
                  <label>Total Payout ($)</label>
                  <input type="number" step="0.01" min="0" name="totalPayout" required placeholder="2500.00" />
                </div>
              </div>
              <div className="form-actions">
                <button type="button" className="btn-icon" onClick={() => setIsIncomeModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Load</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isExpenseModalOpen && (
        <div className="overlay" onClick={(e) => e.target === e.currentTarget && setIsExpenseModalOpen(false)}>
          <div className="modal animate-scale-in">
            <div className="modal-header">
              <h2 className="modal-title">Record Expense</h2>
              <button className="btn-icon" onClick={() => setIsExpenseModalOpen(false)}><X size={20} /></button>
            </div>
            <form onSubmit={handleAddExpense}>
              <div className="grid grid-cols-2 gap-4">
                <div className="form-group">
                  <label>Date</label>
                  <input type="date" name="date" required defaultValue={new Date().toISOString().split('T')[0]} />
                </div>
                <div className="form-group">
                  <label>Category</label>
                  <select name="category" required>
                    <option value="Fuel">Fuel & DEF</option>
                    <option value="Maintenance">Maintenance & Repairs</option>
                    <option value="Insurance">Insurance</option>
                    <option value="Tolls">Tolls & Scales</option>
                    <option value="Other">Other Operational</option>
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Description</label>
                <input type="text" name="description" required placeholder="e.g. Pilot Flying J - Dallas, TX" />
              </div>
              <div className="form-group">
                <label>Amount ($)</label>
                <input type="number" step="0.01" min="0" name="amount" required placeholder="450.00" />
              </div>
              <div className="form-actions">
                <button type="button" className="btn-icon" onClick={() => setIsExpenseModalOpen(false)}>Cancel</button>
                <button type="submit" className="btn-primary">Save Expense</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
