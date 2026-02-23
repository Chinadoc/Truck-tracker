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

const COMPANY_DRIVER_RATE = 0.65;
const TIRE_DEPRECIATION_RATE = 0.03;
const MAINT_RESERVE_RATE = 0.07;
const VEHICLE_DEPRECIATION_RATE = 0.17;
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
  const [incomes, setIncomes] = useState<Income[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);

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
    const tireDepreciation = totalMiles * TIRE_DEPRECIATION_RATE;
    const maintReserve = totalMiles * MAINT_RESERVE_RATE;
    const vehicleDepreciation = totalMiles * VEHICLE_DEPRECIATION_RATE;
    const totalHiddenCosts = tireDepreciation + maintReserve + vehicleDepreciation;

    const ownerOperatorCashProfit = totalIncome - totalExpenses;
    const ownerOperatorTrueProfit = ownerOperatorCashProfit - totalHiddenCosts;
    const companyEquivalentEarnings = totalMiles * COMPANY_DRIVER_RATE;

    return {
      totalMiles,
      tireDepreciation,
      maintReserve,
      vehicleDepreciation,
      totalHiddenCosts,
      ownerOperatorCashProfit,
      ownerOperatorTrueProfit,
      companyEquivalentEarnings,
      isBeatingCompanyRate: ownerOperatorTrueProfit > companyEquivalentEarnings
    };
  }, [totalIncome, totalExpenses, totalMiles]);

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

            {/* Trip Cycle Analysis */}
            <div className="glass-panel p-6 mb-8">
              <div className="flex justify-between items-center mb-6 border-b border-[var(--border)] pb-4">
                <h3 className="text-xl font-bold flex items-center gap-2">
                  <Calculator size={24} className="text-accent" />
                  Trip Cycle Financial Analysis
                </h3>
                <div className={`px-4 py-2 rounded-full text-sm font-bold border ${analysis.isBeatingCompanyRate ? 'bg-[rgba(16,185,129,0.1)] text-success border-success' : 'bg-[rgba(239,68,68,0.1)] text-danger border-danger'}`}>
                  {analysis.isBeatingCompanyRate ? 'Beating Company Rate' : 'Below Company Rate'}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-4">
                {/* Column 1: True Profit */}
                <div className="flex flex-col gap-4">
                  <p className="text-sm font-semibold text-secondary uppercase tracking-wider">Owner-Operator (True Net)</p>
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center text-sm border-b border-[var(--border)] pb-2">
                      <span className="text-secondary">Cash Profit:</span>
                      <span className="font-bold text-success text-base">{formatCurrency(analysis.ownerOperatorCashProfit)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-[var(--border)] pb-2 text-danger opacity-90">
                      <span>Vehicle Depr. ($0.17/mi):</span>
                      <span>-{formatCurrency(analysis.vehicleDepreciation)}</span>
                    </div>
                    <div className="flex justify-between items-center text-sm border-b border-[var(--border)] pb-2 text-danger opacity-80">
                      <span>Tires & Maint ($0.10/mi):</span>
                      <span>-{formatCurrency(analysis.tireDepreciation + analysis.maintReserve)}</span>
                    </div>
                    <div className="flex justify-between items-center text-lg font-bold pt-2">
                      <span>True Profit:</span>
                      <span className="text-accent">{formatCurrency(analysis.ownerOperatorTrueProfit)}</span>
                    </div>
                  </div>
                </div>

                {/* Column 2: Old Company Equivalent */}
                <div className="bg-[rgba(0,0,0,0.2)] p-6 rounded-xl border border-[var(--border)] flex flex-col gap-4">
                  <p className="text-sm font-semibold text-secondary uppercase tracking-wider">Old Company Equivalent</p>
                  <div className="flex flex-col gap-3">
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-secondary">Total Miles:</span>
                      <span className="font-bold text-base">{analysis.totalMiles.toLocaleString()} mi</span>
                    </div>
                    <div className="flex justify-between items-center text-sm">
                      <span className="text-secondary">Old Rate:</span>
                      <span className="font-bold text-base">${COMPANY_DRIVER_RATE.toFixed(2)}/mi</span>
                    </div>
                    <div className="flex justify-between items-center text-lg font-bold pt-4 border-t border-[var(--border)]">
                      <span className="text-secondary">Old Earnings:</span>
                      <span>{formatCurrency(analysis.companyEquivalentEarnings)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 p-4 bg-[var(--surface-hover)] rounded-xl border-l-4 border-accent flex items-start gap-4">
                <div className="pt-1"><Scale size={24} className="text-accent" /></div>
                <div>
                  <h4 className="font-bold mb-1">Hidden Costs Breakdown</h4>
                  <p className="text-sm text-secondary mb-3">Based on an estimated $85,000 purchase price, your truck loses value every mile:</p>
                  <div className="flex gap-4 flex-wrap">
                    <div className="bg-[rgba(0,0,0,0.3)] px-3 py-2 rounded-lg border border-[var(--border)]">
                      <span className="text-xs uppercase text-secondary block mb-1">Asset Depr.</span>
                      <span className="font-semibold text-danger">-{formatCurrency(analysis.vehicleDepreciation)}</span>
                    </div>
                    <div className="bg-[rgba(0,0,0,0.3)] px-3 py-2 rounded-lg border border-[var(--border)]">
                      <span className="text-xs uppercase text-secondary block mb-1">Reserves</span>
                      <span className="font-semibold text-danger">-{formatCurrency(analysis.tireDepreciation + analysis.maintReserve)}</span>
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
