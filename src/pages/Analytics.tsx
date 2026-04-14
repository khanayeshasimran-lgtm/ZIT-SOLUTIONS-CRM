import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { PageLoader } from '@/components/PageLoader';
import { EmptyChart } from '@/components/dashboard/EmptyChart';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts';
import { format, subMonths, startOfMonth } from 'date-fns';
import { TrendingUp, Users, Briefcase, DollarSign } from 'lucide-react';

const COLORS = [
  '#6366f1', '#8b5cf6', '#10b981', '#f59e0b', '#f97316', '#0ea5e9', '#ec4899',
];

const GRADIENTS = [
  { from: 'from-indigo-500', to: 'to-violet-600', bg: 'bg-indigo-50', text: 'text-indigo-700', icon: 'text-indigo-500', border: 'border-indigo-100' },
  { from: 'from-emerald-500', to: 'to-teal-600', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: 'text-emerald-500', border: 'border-emerald-100' },
  { from: 'from-violet-500', to: 'to-purple-600', bg: 'bg-violet-50', text: 'text-violet-700', icon: 'text-violet-500', border: 'border-violet-100' },
  { from: 'from-amber-500', to: 'to-orange-500', bg: 'bg-amber-50', text: 'text-amber-700', icon: 'text-amber-500', border: 'border-amber-100' },
];

function StatCard({ title, value, icon: Icon, index = 0 }: { title: string; value: string | number; icon: any; index?: number }) {
  const g = GRADIENTS[index % GRADIENTS.length];
  return (
    <div className={`relative bg-white border ${g.border} rounded-2xl p-5 flex items-center gap-4 overflow-hidden shadow-[0_1px_6px_rgba(0,0,0,0.04)] hover:shadow-[0_6px_20px_rgba(0,0,0,0.08)] transition-shadow`}>
      <div className={`absolute inset-0 opacity-[0.03] bg-gradient-to-br ${g.from} ${g.to}`} />
      <div className={`relative p-2.5 rounded-xl ${g.bg}`}>
        <Icon className={`h-5 w-5 ${g.icon}`} />
      </div>
      <div className="relative">
        <p className="text-sm text-muted-foreground font-medium">{title}</p>
        <p className={`text-2xl font-black tabular-nums ${g.text}`}>{value}</p>
      </div>
    </div>
  );
}

export default function Analytics() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [deals, setDeals] = useState<any[]>([]);
  const [leads, setLeads] = useState<any[]>([]);
  const [activities, setActivities] = useState<any[]>([]);

  useEffect(() => {
    const fetchAll = async () => {
      if (!user) return;
      const [{ data: deals }, { data: leads }, { data: activities }] = await Promise.all([
        supabase.from('deals').select('*'),
        supabase.from('leads').select('*'),
        supabase.from('activities').select('*'),
      ]);
      setDeals(deals ?? []);
      setLeads(leads ?? []);
      setActivities(activities ?? []);
      setLoading(false);
    };
    fetchAll();
  }, [user]);

  const totalLeads = leads.length;
  const wonDeals = deals.filter((d) => d.stage === 'won');
  const activeDeals = deals.filter((d) =>
    ['contacted', 'meeting_scheduled', 'proposal', 'negotiation'].includes(d.stage)
  );
  const totalRevenue = wonDeals.reduce((sum, d) => sum + Number(d.value || 0), 0);
  const conversionRate = totalLeads === 0 ? 0 : Math.round((wonDeals.length / totalLeads) * 100);

  const monthlyDeals = useMemo(() => {
    const months = Array.from({ length: 6 }, (_, i) => {
      const date = startOfMonth(subMonths(new Date(), 5 - i));
      return { month: format(date, 'MMM yyyy'), start: date, value: 0 };
    });
    deals.forEach((deal) => {
      const dealDate = new Date(deal.created_at);
      const month = months.find(
        (m) => format(m.start, 'MMM yyyy') === format(startOfMonth(dealDate), 'MMM yyyy')
      );
      if (month) month.value += Number(deal.value || 0);
    });
    return months;
  }, [deals]);

  const leadSources = useMemo(() => {
    const map: Record<string, number> = {};
    leads.forEach((l) => { const key = l.source || 'Unknown'; map[key] = (map[key] || 0) + 1; });
    return Object.entries(map).map(([source, count]) => ({ source, count }));
  }, [leads]);

  const activityStats = useMemo(() => {
    const map: Record<string, number> = {};
    activities.forEach((a) => { map[a.type] = (map[a.type] || 0) + 1; });
    return Object.entries(map).map(([type, count]) => ({
      type: type.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
      count,
    }));
  }, [activities]);

  const funnelStages = ['new_lead', 'contacted', 'meetings', 'proposal', 'negotiation', 'won'];
  const conversionData = funnelStages.map((stage) => ({
    stage: stage.replace('_', ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    count: deals.filter((d) => d.stage === stage).length,
  }));

  const formatCurrency = (value: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0 }).format(value);

  const chartStyle = {
    backgroundColor: '#ffffff',
    border: '1px solid #e2e8f0',
    borderRadius: '12px',
    padding: '10px 14px',
  };

  if (loading) return <PageLoader />;

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="page-header">
        <div>
          <h1 className="page-title">Analytics</h1>
          <p className="text-muted-foreground mt-1">Business performance overview</p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Total Leads"      value={totalLeads}                    icon={Users}     index={0} />
        <StatCard title="Conversion Rate"  value={`${conversionRate}%`}          icon={TrendingUp} index={1} />
        <StatCard title="Active Deals"     value={activeDeals.length}            icon={Briefcase} index={2} />
        <StatCard title="Total Revenue"    value={formatCurrency(totalRevenue)}  icon={DollarSign} index={3} />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
          <div className="mb-5">
            <h3 className="text-base font-bold text-slate-800">Revenue Growth</h3>
            <p className="text-xs text-slate-400 mt-0.5">Monthly deal value over 6 months</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthlyDeals}>
              <defs>
                <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%"  stopColor="#6366f1" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0.01} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="month" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tickFormatter={(v) => `$${v / 1000}k`} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip formatter={(v: number) => formatCurrency(v)} contentStyle={chartStyle} />
              <Area dataKey="value" type="monotone" stroke="#6366f1" strokeWidth={2} fill="url(#revGrad)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
          <div className="mb-5">
            <h3 className="text-base font-bold text-slate-800">Lead Sources</h3>
            <p className="text-xs text-slate-400 mt-0.5">Where your leads come from</p>
          </div>
          {leadSources.length ? (
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie data={leadSources} dataKey="count" nameKey="source" outerRadius={100} innerRadius={55} paddingAngle={3}
                  label={({ source, percent }) => `${source} (${(percent * 100).toFixed(0)}%)`}>
                  {leadSources.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} strokeWidth={0} />)}
                </Pie>
                <Tooltip contentStyle={chartStyle} />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart title="Lead Sources" />
          )}
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
          <div className="mb-5">
            <h3 className="text-base font-bold text-slate-800">Activity Breakdown</h3>
            <p className="text-xs text-slate-400 mt-0.5">Tasks by type</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={activityStats} layout="vertical">
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" horizontal={false} />
              <XAxis type="number" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="type" width={90} tick={{ fill: '#64748b', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartStyle} />
              <Bar dataKey="count" fill="#8b5cf6" radius={[0, 6, 6, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-[0_1px_6px_rgba(0,0,0,0.04)]">
          <div className="mb-5">
            <h3 className="text-base font-bold text-slate-800">Conversion Funnel</h3>
            <p className="text-xs text-slate-400 mt-0.5">Deals by pipeline stage</p>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={conversionData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
              <XAxis dataKey="stage" angle={-30} textAnchor="end" height={70} tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={chartStyle} />
              <Bar dataKey="count" fill="#10b981" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}