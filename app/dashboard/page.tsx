'use client';
import { useState, useEffect, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import Link from 'next/link';
import { Download, RefreshCw, TrendingUp, Package, Receipt, XCircle, Trophy } from 'lucide-react';
import { LogoutButton } from '@/components/logout-button';

const supabase = createClient();

export default function Dashboard() {
  const [sales, setSales] = useState<any[]>([]);
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  useEffect(() => {
    fetchSales();
  }, [startDate, endDate]);

  async function fetchSales() {
    setLoading(true);

    let query = supabase.from('sales').select('*').order('created_at', { ascending: false });
    if (startDate) query = query.gte('created_at', `${startDate}T00:00:00`);
    if (endDate) query = query.lte('created_at', `${endDate}T23:59:59`);

    const { data: salesData, error: salesError } = await query;

    if (salesError) {
      setError(salesError.message);
      setTimeout(() => setError(''), 4000);
      setLoading(false);
      return;
    }

    setSales(salesData || []);

    const saleIds = (salesData || []).map(s => s.id);
    if (saleIds.length === 0) {
      setItems([]);
      setLoading(false);
      return;
    }

    const { data: itemsData, error: itemsError } = await supabase
      .from('sale_items')
      .select('*')
      .in('sale_id', saleIds);

    if (itemsError) {
      setError(itemsError.message);
      setTimeout(() => setError(''), 4000);
    } else {
      setItems(itemsData || []);
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

  const totalRevenue = sales.reduce((acc, s) => acc + (s.total || 0), 0);
  const totalUnits = items.reduce((acc, i) => acc + (i.qty || 0), 0);
  const totalTransactions = sales.length;

  const dailyRevenue = useMemo(() => {
    const map = new Map<string, number>();
    sales.forEach(s => {
      if (!s.created_at) return;
      const day = new Date(s.created_at).toISOString().split('T')[0];
      map.set(day, (map.get(day) || 0) + (s.total || 0));
    });
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b)).slice(-14);
  }, [sales]);

  const maxDaily = Math.max(1, ...dailyRevenue.map(([, v]) => v));

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

  return (
    <div className="min-h-screen bg-neutral-950 text-white p-6 md:p-10 font-sans">
      <div className="max-w-5xl mx-auto">
        <header className="flex flex-wrap justify-between items-center gap-3 mb-8 border-b border-neutral-800 pb-4">
          <div>
            <h1 className="text-2xl font-black tracking-widest">MENARC</h1>
            <p className="text-xs text-neutral-400">Sales Analytics & Date-Range Reports</p>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex items-center gap-2">
              <Link href="/" className="text-xs text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded transition">POS Checkout</Link>
              <Link href="/inventory" className="text-xs text-neutral-400 hover:text-white bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded transition">Inventory</Link>
              <Link href="/dashboard" className="text-xs text-white bg-neutral-800 border border-neutral-700 px-3 py-1.5 rounded transition">Dashboard</Link>
            </nav>
            <LogoutButton />
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
            <button onClick={fetchSales} className="flex items-center gap-1.5 text-xs text-neutral-400 hover:text-white border border-neutral-800 px-2.5 py-1.5 rounded transition"><RefreshCw size={12} className={loading ? 'animate-spin' : ''} /> Refresh</button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <p className="flex items-center gap-1.5 text-xs text-neutral-400 uppercase tracking-wider mb-1"><TrendingUp size={12} /> Total Revenue</p>
            <p className="text-3xl font-black font-mono text-white">₹{totalRevenue.toLocaleString('en-IN')}</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <p className="flex items-center gap-1.5 text-xs text-neutral-400 uppercase tracking-wider mb-1"><Package size={12} /> Units Sold</p>
            <p className="text-3xl font-black font-mono text-white">{totalUnits}</p>
          </div>
          <div className="bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <p className="flex items-center gap-1.5 text-xs text-neutral-400 uppercase tracking-wider mb-1"><Receipt size={12} /> Total Transactions</p>
            <p className="text-3xl font-black font-mono text-white">{totalTransactions}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="md:col-span-2 bg-neutral-900 border border-neutral-800 p-6 rounded-xl shadow-lg">
            <h2 className="font-bold text-base text-neutral-200 mb-4">Daily Revenue</h2>
            {dailyRevenue.length === 0 ? (
              <p className="text-sm text-neutral-500 py-8 text-center">No revenue data for this range yet.</p>
            ) : (
              <div className="flex items-end gap-1.5 h-40">
                {dailyRevenue.map(([day, value]) => (
                  <div key={day} className="flex-1 flex flex-col items-center justify-end h-full group relative">
                    <div className="text-[10px] text-neutral-400 mb-1 opacity-0 group-hover:opacity-100 transition font-mono absolute -top-4">₹{value.toLocaleString('en-IN')}</div>
                    <div className="w-full bg-white/80 group-hover:bg-white rounded-t transition" style={{ height: `${Math.max(4, (value / maxDaily) * 100)}%` }} />
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
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-base text-neutral-200">Sales Transactions History</h2>
            <span className="text-xs text-neutral-500">{sales.length} Transactions Found</span>
          </div>

          {loading ? (
            <div className="space-y-3 py-1">{[...Array(5)].map((_, i) => <div key={i} className="h-14 bg-neutral-800/50 rounded animate-pulse" />)}</div>
          ) : sales.length === 0 ? (
            <p className="text-sm text-neutral-500 py-4">No sales recorded for this date range.</p>
          ) : (
            <div className="divide-y divide-neutral-800 max-h-[420px] overflow-y-auto pr-2">
              {sales.map((sale) => (
                <div key={sale.id} className="py-3.5 flex justify-between items-center text-sm">
                  <div>
                    <p className="font-semibold text-neutral-100">
                      {itemCountBySale.get(sale.id) || 0} item{(itemCountBySale.get(sale.id) || 0) !== 1 ? 's' : ''}
                      {sale.status && sale.status !== 'completed' && (
                        <span className="ml-2 text-[10px] uppercase text-amber-400 border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 rounded align-middle">{sale.status}</span>
                      )}
                    </p>
                    <p className="text-xs text-neutral-400">{sale.discount_total > 0 ? `Discount: ₹${sale.discount_total} • ` : ''}Subtotal: ₹{sale.subtotal}</p>
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
