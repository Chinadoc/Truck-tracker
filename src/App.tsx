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
  const netProfit = totalIncome - totalExpenses;

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
            <header className="mb-8">
              <h1 className="text-3xl font-bold">Financial Overview</h1>
              <p className="text-secondary mt-2">Track your trucking business performance</p>
            </header>

            {/* Metrics Grid */}
            <div className="dashboard-grid">
              <div className="glass-panel stat-card text-center">
                <div className="stat-title text-success justify-center">
                  <TrendingUp size={16} /> Cash Revenue
                </div>
                <div className="stat-value">{formatCurrency(totalIncome)}</div>
                <div className="text-secondary text-sm mt-1">Gross Earnings</div>
              </div>
              <div className="glass-panel stat-card text-center">
                <div className="stat-title text-danger justify-center">
                  <TrendingDown size={16} /> Cash Expenses
                </div>
                <div className="stat-value">{formatCurrency(totalExpenses)}</div>
                <div className="text-secondary text-sm mt-1">Out-of-Pocket</div>
              </div>
              <div className="glass-panel stat-card text-center" style={{ borderTop: `4px solid ${netProfit >= 0 ? 'var(--success)' : 'var(--danger)'}` }}>
                <div className="stat-title justify-center" style={{ color: netProfit >= 0 ? 'var(--success)' : 'var(--danger)' }}>
                  <DollarSign size={16} /> Take-Home Pay
                </div>
                <div className="stat-value">{formatCurrency(netProfit)}</div>
                <div className="text-secondary text-sm mt-1">Cash Profit</div>
              </div>
            </div>

            {/* Trip Cycle Analysis & Expense Buckets */}
            <div className="glass-panel p-6 mb-8">
              <div className="flex justify-between items-center mb-6 border-b border-[var(--border)] pb-4">
                <div>
                  <h3 className="text-xl font-bold flex items-center gap-2">
                    <Calculator size={24} className="text-accent" />
                    Trip Cycle Scenario: 2023 Freightliner Cascadia
                  </h3>
                  <p className="text-secondary mt-1 text-sm">
                    Tracking real expenses against expected hidden costs (290k miles, 3 years remaining)
                  </p>
                </div>
                <div className={`px-4 py-2 rounded-full text-sm font-bold border ${analysis.isBeatingCompanyRate ? 'bg-[rgba(16,185,129,0.1)] text-success border-success' : 'bg-[rgba(239,68,68,0.1)] text-danger border-danger'}`}>
                  {analysis.isBeatingCompanyRate ? 'Beating Company Rate' : 'Below Company Rate'}
                </div>
              </div>

              <div className="flex flex-col lg:flex-row gap-8">
                {/* Left: 2/3 Width - Expected Expense Buckets */}
                <div className="flex-1">
                  <h4 className="font-bold mb-4 flex items-center gap-2 border-b border-[rgba(255,255,255,0.05)] pb-2 text-lg">
                    <Wrench size={18} className="text-secondary" /> The "Savings Box" & Tracked Expenses
                  </h4>

                  {/* Bucket 1: Fuel */}
                  <div className="bucket-container mt-4">
                    <div className="bucket-header">
                      <span>Diesel & DEF (Expected $0.55/mi)</span>
                      <span>{formatCurrency(analysis.trackedFuelCost)} / {formatCurrency(analysis.expectedFuelCost)}</span>
                    </div>
                    <div className="bucket-bar-bg">
                      <div
                        className={`bucket-bar-fill ${analysis.trackedFuelCost > analysis.expectedFuelCost ? 'bg-danger' : 'bg-success'}`}
                        style={{ width: `${Math.min(100, (analysis.trackedFuelCost / Math.max(1, analysis.expectedFuelCost)) * 100)}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Bucket 2: Vehicle Depreciation */}
                  <div className="bucket-container mt-4">
                    <div className="bucket-header text-danger opacity-90">
                      <span>Truck Depreciation (Hidden Cost)</span>
                      <span>Target: {formatCurrency(analysis.vehicleDepreciation)}</span>
                    </div>
                    <div className="bucket-bar-bg">
                      {/* This is a visual representation of a hidden cost you CAN'T avoid paying eventually  */}
                      <div className="bucket-bar-fill bg-danger opacity-70" style={{ width: '100%' }}></div>
                    </div>
                  </div>

                  {/* Bucket 3: Maintenance Reserve */}
                  <div className="bucket-container mt-4 mb-6">
                    <div className="bucket-header text-warning opacity-90" style={{ color: '#eab308' }}>
                      <span>Maintenance & Tires Reserve</span>
                      <span>Target: {formatCurrency(analysis.maintReserve)}</span>
                    </div>
                    <div className="bucket-bar-bg">
                      <div className="bucket-bar-fill opacity-70" style={{ background: '#eab308', width: '100%' }}></div>
                    </div>
                  </div>

                  <div className="p-4 bg-[var(--surface-hover)] rounded-xl border border-[var(--border)]">
                    <div className="flex justify-between items-center text-sm font-bold">
                      <span className="text-secondary uppercase">Gross Revenue (Total Miles):</span>
                      <span className="text-lg">{formatCurrency(totalIncome)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm mt-2 text-danger">
                      <span className="opacity-80">Total Tracked Expenses:</span>
                      <span>-{formatCurrency(totalExpenses)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm mt-1 text-danger">
                      <span className="opacity-80">Total Hidden Shrinkage (Depr + Maint):</span>
                      <span>-{formatCurrency(analysis.totalHiddenCosts)}</span>
                    </div>
                  </div>
                </div>

                {/* Right: 1/3 Width - Head to Head Comparison */}
                <div className="lg:w-1/3 flex flex-col gap-4">
                  <h4 className="font-bold flex items-center gap-2 border-b border-[rgba(255,255,255,0.05)] pb-2 text-lg">
                    <Scale size={18} className="text-accent" /> Head-to-Head
                  </h4>

                  {/* Company Driver Box */}
                  <div className="bg-[rgba(0,0,0,0.3)] p-5 rounded-xl border border-[var(--border)] relative overflow-hidden">
                    <div className="absolute top-0 right-0 p-2 opacity-10"><DollarSign size={48} /></div>
                    <h5 className="text-xs uppercase font-bold text-secondary mb-3">Company Driver Rate</h5>
                    <div className="text-3xl font-bold mb-1">{formatCurrency(analysis.companyEquivalentEarnings)}</div>
                    <p className="text-sm text-secondary">guaranteed @ ${COMPANY_DRIVER_RATE.toFixed(2)}/mi</p>
                    <p className="text-xs text-secondary mt-1">({analysis.totalMiles.toLocaleString()} total miles tracked)</p>
                  </div>

                  {/* VS Badge */}
                  <div className="flex justify-center -my-2 relative z-10">
                    <span className="bg-black text-secondary text-xs uppercase font-bold px-3 py-1 rounded-full border border-[var(--border)]">VS</span>
                  </div>

                  {/* Owner Operator True Net Box */}
                  <div className={`p-5 rounded-xl border ${analysis.isBeatingCompanyRate ? 'bg-[rgba(16,185,129,0.05)] border-success' : 'bg-[rgba(239,68,68,0.05)] border-danger'} relative overflow-hidden`}>
                    <div className="absolute top-0 right-0 p-2 opacity-10"><Truck size={48} /></div>
                    <h5 className="text-xs uppercase font-bold mb-3 flex items-center gap-2">
                      <span className={analysis.isBeatingCompanyRate ? 'text-success' : 'text-danger'}>Owner Operator True Net</span>
                    </h5>
                    <div className={`text-3xl font-bold mb-1 ${analysis.isBeatingCompanyRate ? 'text-success' : 'text-danger'}`}>
                      {formatCurrency(analysis.ownerOperatorTrueProfit)}
                    </div>
                    <p className="text-sm text-secondary">
                      After tracking costs + hiding ${formatCurrency(analysis.totalHiddenCosts)} for reserves.
                    </p>
                    <div className="mt-4 pt-3 border-t border-[rgba(255,255,255,0.1)]">
                      <div className="text-xs text-secondary uppercase font-bold mb-1">Difference</div>
                      <div className={`text-lg font-bold ${analysis.ownerOperatorTrueProfit - analysis.companyEquivalentEarnings >= 0 ? 'text-success' : 'text-danger'}`}>
                        {formatCurrency(analysis.ownerOperatorTrueProfit - analysis.companyEquivalentEarnings)}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Main Chart */}
            <div className="glass-panel chart-container">
              <h3 className="mb-4 font-semibold text-lg flex items-center gap-2">Income vs Expenses (Monthly)</h3>
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
