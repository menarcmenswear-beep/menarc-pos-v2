'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { Download, RefreshCw, TrendingUp, Package, Receipt, XCircle, Trophy, Wallet, Undo2, Search } from 'lucide-react';
import { Nav } from '@/components/nav';

const supabase = createClient();

export default function Dashboard() {
  const [sales, setSales] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [returns, setReturns] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [searchTerm, setSearchTerm] = useState('');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchAll();
  }, [startDate, endDate]);

  async function fetchAll() {
    setLoading(true);

    // 1. Sale headers in range
    let salesQuery = supabase.from('sales').select('*').order('created_at', { ascending: false });
    if (startDate) salesQuery = salesQuery.gte('created_at', `${startDate}T00:00:00`);
    if (endDate) salesQuery = salesQuery.lte('created_at', `${endDate}T23:59:59`);
    const { data: salesData, error: salesError } = await salesQuery;

    if (salesError) {
      setError(salesError.message);
      setTimeout(() => setError(''), 4000);
      setLoading(false);
      return;
    }
    setSales(salesData || []);

    // 2. Line items for those sales
    const saleIds = (salesData || []).map(s => s.id);
    let itemsData: any[] = [];
    if (saleIds.length > 0) {
      const { data, error: itemsError } = await supabase.from('sale_items').select('*').in('sale_id', saleIds);
      if (itemsError) {
        setError(itemsError.message);
        setTimeout(() => setError(''), 4000);
      } else {
        itemsData = data || [];
      }
    }
    setItems(itemsData);

    // 3. Returns booked within this same date range (by when the return happened,
    //    not the original sale date — matches standard retail reporting practice)
    let returnsQuery = supabase
      .from('returns')
      .select('*, sale_items(sku, qty, final_value, cost_price)')
      .order('created_at', { ascending: false });
    if (startDate) returnsQuery = returnsQuery.gte('created_at', `${startDate}T00:00:00`);
    if (endDate) returnsQuery = returnsQuery.lte('created_at', `${endDate}T23:59:59`);
    const { data: returnsData, error: returnsError } = await returnsQuery;

    if (returnsError) {
      setError(returnsError.message);
      setTimeout(() => setError(''), 4000);
    } else {
      setReturns(returnsData || []);
    }

    setLoading(false);
  }

  function resetFilters() {
    setStartDate('');
    setEndDate('');
  }

  function exportSalesCSV() {
    if (items.length === 0) return;
    const salesById = new Map(sales.map(s => [s.id, s]));
    const headers = ['Sale ID', 'SKU', 'Quantity', 'Item Rate', 'Discount', 'Line Total', 'Sale Total', 'Status', 'Timestamp'];
    const rows = items.map(i => {
      const parent = salesById.get(i.sale_id);
      return [i.sale_id, i.sku, i.qty, i.item_rate, i.discount || 0, i.final_value, parent?.total ?? '', parent?.status ?? '', parent?.created_at ?? ''];
    });
    const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(e => e.join(','))].join('\n');
    const link = document.createElement('a');
    link.setAttribute('href', encodeURI(csvContent));
    link.setAttribute('download', `menarc_sales_${startDate || 'all'}_to_${endDate || 'all'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // --- Returns-aware figures ---
  // A return row's own value isn't stored directly — it's derived from its parent
  // sale_item's per-unit rate (final_value / qty), times the quantity returned.
  function returnValue(r: any) {
    const parent = r.sale_items;
    if (!parent || !parent.qty) return 0;
    return (parent.final_value / parent.qty) * r.qty;
  }
  function returnMarginImpact(r: any) {
    const parent = r.sale_items;
    if (!parent || !parent.qty || parent.cost_price == null) return 0;
    const perUnitValue = parent.final_value / parent.qty;
    return (perUnitValue - parent.cost_price) * r.qty;
  }

  const grossRevenue = sales.reduce((acc, s) => acc + (s.total || 0), 0);
  const grossUnits = items.reduce((acc, i) => acc + (i.qty || 0), 0);
  const itemsWithCost = items.filter(i => i.cost_price != null);
  const grossMargin = itemsWithCost.reduce((acc, i) => acc + (i.final_value - i.cost_price * i.qty), 0);
  const marginCoverage = items.length > 0 ? Math.round((itemsWithCost.length / items.length) * 100) : 0;

  const returnedValue = returns.reduce((acc, r) => acc + returnValue(r), 0);
  const returnedUnits = returns.reduce((acc, r) => acc + r.qty, 0);
  const returnedMarginImpact = returns.reduce((acc, r) => acc + returnMarginImpact(r), 0);

  const netRevenue = grossRevenue - returnedValue;
  const netUnits = grossUnits - returnedUnits;
  const netMargin = grossMargin - returnedMarginImpact;
  const totalTransactions = sales.length;
  const hasReturns = returns.length > 0;

  const dailyRevenue = useMemo(() => {
    const map = new Map<string, number>();
    sales.forEach(s => {
      if (!s.created_at) return;
      const day = new Date(s.created_at).toISOString().split('T')[0];
      map.set(day, (map.get(day) || 0) + (s.total || 0));
    });
    returns.forEach(r => {
      if (!r.created_at) return;
      const day = new Date(r.created_at).toISOString().split('T')[0];
      map.set(day, (map.get(day) || 0) - returnValue(r));
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
  }, [sales, returns]);

  const maxDaily = Math.max(1, ...dailyRevenue.map(([, v]) => Math.abs(v)));

  const topSellers = useMemo(() => {
    const map = new Map<string, { qty: number; revenue: number }>();
    items.forEach(i => {
      const entry = map.get(i.sku) || { qty: 0, revenue: 0 };
      entry.qty += i.qty || 0;
      entry.revenue += i.final_value || 0;
      map.set(i.sku, entry);
    });
    return Array.from(map.entries()).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 5);
  }, [items]);

  const itemCountBySale = useMemo(() => {
    const map = new Map<string, number>();
    items.forEach(i => map.set(i.sale_id, (map.get(i.sale_id) || 0) + i.qty));
    return map;
  }, [items]);

  const skusBySale = useMemo(() => {
    const map = new Map<string, string[]>();
    items.forEach(i => {
      const arr = map.get(i.sale_id) || [];
      arr.push(i.sku);
      map.set(i.sale_id, arr);
    });
    return map;
  }, [items]);

  const filteredSales = sales.filter((s) => {
    if (!searchTerm) return true;
    const term = searchTerm.toLowerCase();
    const skus = skusBySale.get(s.id) || [];
    return (
      s.customer_name?.toLowerCase().includes(term) ||
      s.customer_phone?.includes(term) ||
      skus.some(sku => sku.toLowerCase().includes(term))
    );
  });

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-3 mb-8 border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-widest">MENARC</h1>
            <p className="text-xs text-neutral-400">Sales Analytics & Date-Range Reports</p>
          </div>
          <div className="flex items-center gap-2">
            <Nav current="/dashboard" showLogout />
          </div>
        </header>

        <div className="bg-neutral-900 border border-neutral-800 p-4 rounded-xl shadow-lg mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-wrap">
            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">Start Date</label>
              <input type="date" className="bg-neutral-950 border border-neutral-700 text-white px-3 py-1.5 rounded text-xs focus:outline-none focus:border-white" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div>
              <label className="text-[10px] text-neutral-400 block mb-1">End Date</label>
              <input type="date" className="bg-neutral-950 border border-neutral-700 text-white px-3 py-1.5 rounded text-xs focus:outline-none focus:border-white" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
            {(startDate || endDate) && (
              <button onClick={resetFilters} className="self-end text-xs text-neutral-400 hover:text-white bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded transition">Clear Filters</button>
            )}
          </div>
          <div className="flex gap-2 self-end">
            <button onClick={exportSalesCSV} className="flex items-center gap-1.5 text-xs bg-neutral-800 border border-neutral-700 hover:bg-neutral-700 px-3 py-1.5 rounded transition"><Download size={12} /> Export Range CSV</button>
            <button onClick={fetchAll} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-neutral-800 px-2.5 py-1.5 rounded transition"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh</button>
          </div>
        </div>

        <div className={`grid grid-cols-2 ${hasReturns ? 'md:grid-cols-5' : 'md:grid-cols-4'} gap-4 mb-6`}>
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <p className="flex items-center gap-1.5 text-xs text-neutral-400 uppercase tracking-wider mb-1"><TrendingUp size={12} /> Net Revenue</p>
            <p className="text-3xl font-black font-mono text-white">₹{netRevenue.toLocaleString('en-IN')}</p>
            {hasReturns && <p className="text-[10px] text-neutral-600 mt-1">₹{grossRevenue.toLocaleString('en-IN')} gross − ₹{returnedValue.toLocaleString('en-IN')} returns</p>}
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <p className="flex items-center gap-1.5 text-xs text-neutral-400 uppercase tracking-wider mb-1"><Wallet size={12} /> Net Margin</p>
            <p className="text-3xl font-black font-mono text-emerald-400">₹{netMargin.toLocaleString('en-IN')}</p>
            {itemsWithCost.length < items.length && items.length > 0 && (
              <p className="text-[10px] text-neutral-600 mt-1">{marginCoverage}% of items have a cost price on file</p>
            )}
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <p className="flex items-center gap-1.5 text-xs text-neutral-400 uppercase tracking-wider mb-1"><Package size={12} /> Net Units</p>
            <p className="text-3xl font-black font-mono text-white">{netUnits}</p>
            {hasReturns && <p className="text-[10px] text-neutral-600 mt-1">{grossUnits} sold − {returnedUnits} returned</p>}
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <p className="flex items-center gap-1.5 text-xs text-neutral-400 uppercase tracking-wider mb-1"><Receipt size={12} /> Transactions</p>
            <p className="text-3xl font-black font-mono text-white">{totalTransactions}</p>
          </div>
          {hasReturns && (
            <div className="bg-neutral-900 border border-amber-500/20 p-6 rounded-xl shadow-lg">
              <p className="flex items-center gap-1.5 text-xs text-amber-500/80 uppercase tracking-wider mb-1"><Undo2 size={12} /> Returns</p>
              <p className="text-3xl font-black font-mono text-amber-400">₹{returnedValue.toLocaleString('en-IN')}</p>
              <p className="text-[10px] text-neutral-600 mt-1">{returns.length} return{returns.length !== 1 ? 's' : ''} · {returnedUnits} units</p>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="md:col-span-2 bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <h2 className="font-bold text-base text-neutral-200 mb-4">Daily Net Revenue</h2>
            {dailyRevenue.length === 0 ? (
              <p className="text-sm text-neutral-500 py-8 text-center">No revenue data for this range yet.</p>
            ) : (
              <div className="flex items-end gap-2 h-40 overflow-x-auto">
                {dailyRevenue.map(([day, value]) => (
                  <div key={day} className="w-10 shrink-0 flex flex-col items-center justify-end h-full group relative">
                    <div className="text-[10px] text-neutral-400 mb-1 opacity-0 group-hover:opacity-100 transition font-mono absolute -top-4 whitespace-nowrap">₹{value.toLocaleString('en-IN')}</div>
                    <div
                      className={`w-full rounded-t transition ${value < 0 ? 'bg-amber-500/70 group-hover:bg-amber-400' : 'bg-white/80 group-hover:bg-white'}`}
                      style={{ height: `${Math.max(4, (Math.abs(value) / maxDaily) * 100)}%` }}
                    />
                    <span className="text-[9px] text-neutral-500 mt-1.5">{day.slice(5)}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <h2 className="flex items-center gap-2 font-bold text-base text-neutral-200 mb-4"><Trophy size={15} /> Top Sellers</h2>
            {topSellers.length === 0 ? (
              <p className="text-sm text-neutral-500 py-4">No sales yet.</p>
            ) : (
              <div className="space-y-3">
                {topSellers.map(([sku, stats], i) => (
                  <div key={sku} className="flex justify-between items-center text-sm">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="text-neutral-600 text-xs font-mono w-3">{i + 1}</span>
                      <span className="font-medium text-neutral-200 truncate">{sku}</span>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="font-mono text-xs text-white">₹{stats.revenue.toLocaleString('en-IN')}</p>
                      <p className="text-[10px] text-neutral-500">{stats.qty} sold</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-4 gap-3">
            <h2 className="font-bold text-base text-neutral-200">Sales Transactions History</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-neutral-500">{filteredSales.length} of {sales.length}</span>
              <div className="relative w-full sm:w-56">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-500 pointer-events-none" size={12} />
                <input type="text" placeholder="Search customer, phone, SKU..." className="bg-neutral-950 border border-neutral-700 text-white pl-7 pr-2 py-1.5 rounded text-xs focus:outline-none w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
            </div>
          </div>

          {loading ? (
            <div className="space-y-3 py-1">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-neutral-800/50 rounded animate-pulse" />)}</div>
          ) : filteredSales.length === 0 ? (
            <p className="text-sm text-neutral-500 py-4">{sales.length === 0 ? 'No sales recorded for this date range.' : 'No transactions match your search.'}</p>
          ) : (
            <div className="divide-y divide-neutral-800 max-h-[420px] overflow-y-auto pr-2">
              {filteredSales.map((sale) => (
                <div key={sale.id} className="py-3.5 flex justify-between items-center text-sm">
                  <div>
                    <p className="font-semibold text-neutral-100">
                      {sale.customer_name || `${itemCountBySale.get(sale.id) || 0} item${(itemCountBySale.get(sale.id) || 0) !== 1 ? 's' : ''}`}
                      {sale.status && sale.status !== 'completed' && (
                        <span className="ml-2 text-[10px] uppercase text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded align-middle">{sale.status}</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-400">
                      {sale.customer_name && `${itemCountBySale.get(sale.id) || 0} item${(itemCountBySale.get(sale.id) || 0) !== 1 ? 's' : ''}${sale.customer_phone ? ` · ${sale.customer_phone}` : ''} · `}
                      {sale.discount_total > 0 ? `Discount: ₹${sale.discount_total} • ` : ''}Subtotal: ₹{sale.subtotal}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-sm font-bold text-white">₹{sale.total}</p>
                    <p className="text-xs text-neutral-500">{sale.created_at ? new Date(sale.created_at).toLocaleString() : 'Just now'}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="fixed bottom-6 right-6 flex items-center gap-2 px-4 py-3 rounded-lg shadow-xl border text-sm font-medium z-50 bg-red-950 border-red-700 text-red-300">
          <XCircle size={16} /> {error}
        </div>
      )}
    </div>
  );
}
