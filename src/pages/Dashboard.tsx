import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Loader2, Users, UserCheck, UserX, DollarSign, Ticket, AlertTriangle, TrendingUp, Eye } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { es } from 'date-fns/locale';
import { useNavigate } from 'react-router-dom';

export default function Dashboard() {
  const { profile } = useAuth();
  const navigate = useNavigate();

  // Fecha actual y rango del mes
  const today = new Date();
  const monthStart = format(startOfMonth(today), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(today), 'yyyy-MM-dd');

  // 1. Métricas de clientes
  const { data: clientStats, isLoading: loadingClients } = useQuery({
    queryKey: ['dashboard-client-stats'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('status');
      if (error) throw error;
      const total = data.length;
      const active = data.filter(c => c.status === 'activo').length;
      const suspended = data.filter(c => c.status === 'suspendido').length;
      return { total, active, suspended };
    },
  });

  // 2. Ingresos del mes actual
  const { data: monthIncome, isLoading: loadingIncome } = useQuery({
    queryKey: ['dashboard-month-income', monthStart, monthEnd],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('payments')
        .select('amount')
        .gte('payment_date', monthStart)
        .lte('payment_date', monthEnd);
      if (error) throw error;
      const total = data.reduce((sum, p) => sum + Number(p.amount), 0);
      return total;
    },
  });

  // 3. Tickets abiertos
  const { data: openTickets, isLoading: loadingTickets } = useQuery({
    queryKey: ['dashboard-open-tickets'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('tickets')
        .select('id, title, client:clients(full_name), created_at')
        .in('status', ['abierto', 'en_progreso'])
        .order('created_at', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data || [];
    },
  });

  // 4. Ingresos de los últimos 6 meses (para gráfico)
  const { data: incomeChartData, isLoading: loadingChart } = useQuery({
    queryKey: ['dashboard-income-chart'],
    queryFn: async () => {
      const months: { label: string; ingresos: number }[] = [];
      for (let i = 5; i >= 0; i--) {
        const date = subMonths(today, i);
        const start = format(startOfMonth(date), 'yyyy-MM-dd');
        const end = format(endOfMonth(date), 'yyyy-MM-dd');
        const { data, error } = await supabase
          .from('payments')
          .select('amount')
          .gte('payment_date', start)
          .lte('payment_date', end);
        if (error) throw error;
        const total = data.reduce((sum, p) => sum + Number(p.amount), 0);
        months.push({
          label: format(date, 'MMM yy', { locale: es }),
          ingresos: total,
        });
      }
      return months;
    },
  });

  // 5. Clientes sin pago en el mes actual (morosos)
  const { data: defaulters, isLoading: loadingDefaulters } = useQuery({
    queryKey: ['dashboard-defaulters', monthStart, monthEnd],
    queryFn: async () => {
      // Obtenemos todos los clientes activos o suspendidos
      const { data: activeClients, error: clientsError } = await supabase
        .from('clients')
        .select('id, full_name, plan:plans(price)')
        .in('status', ['activo', 'suspendido']);
      if (clientsError) throw clientsError;

      // Obtenemos los clientes que SÍ pagaron este mes
      const { data: paidThisMonth, error: paymentsError } = await supabase
        .from('payments')
        .select('client_id')
        .gte('payment_date', monthStart)
        .lte('payment_date', monthEnd);
      if (paymentsError) throw paymentsError;

      const paidIds = new Set(paidThisMonth.map(p => p.client_id));
      const notPaid = (activeClients || []).filter(c => !paidIds.has(c.id));
      return notPaid.slice(0, 10); // Mostramos solo los primeros 10
    },
  });

  const isLoading = loadingClients || loadingIncome || loadingTickets || loadingChart || loadingDefaulters;

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-light tracking-tight">Dashboard</h1>
        <p className="text-muted-foreground">
          Bienvenido, {profile?.full_name || 'Usuario'} ({profile?.role})
        </p>
      </div>

      {/* Tarjetas de métricas */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-5">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Clientes</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientStats?.total || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Activos</CardTitle>
            <UserCheck className="h-4 w-4 text-green-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientStats?.active || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Suspendidos</CardTitle>
            <UserX className="h-4 w-4 text-yellow-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{clientStats?.suspended || 0}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Ingresos del Mes</CardTitle>
            <DollarSign className="h-4 w-4 text-emerald-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${monthIncome?.toFixed(2) || '0.00'}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tickets Abiertos</CardTitle>
            <Ticket className="h-4 w-4 text-red-600" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{openTickets?.length || 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Gráfico de ingresos mensuales */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="h-5 w-5" />
            Ingresos Mensuales (Últimos 6 meses)
          </CardTitle>
          <CardDescription>
            Total de pagos registrados por mes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={incomeChartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis dataKey="label" className="text-xs" />
                <YAxis className="text-xs" />
                <Tooltip
                  formatter={(value: any) => value ? [`$${Number(value).toFixed(2)}`, 'Ingresos'] : ['$0.00', 'Ingresos']}
                  labelFormatter={(label) => `Mes: ${label}`}
                />
                <Bar dataKey="ingresos" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {/* Pagos vencidos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-yellow-600" />
              Clientes Sin Pago Este Mes
            </CardTitle>
            <Button variant="outline" size="sm" onClick={() => navigate('/payments')}>
              <Eye className="mr-1 h-4 w-4" />
              Ver todos
            </Button>
          </CardHeader>
          <CardContent>
            {defaulters && defaulters.length > 0 ? (
              <ul className="space-y-2">
                {defaulters.map(client => (
                  <li key={client.id} className="flex items-center justify-between border-b pb-2 text-sm">
                    <div>
                      <p className="font-medium">{client.full_name}</p>
                      <p className="text-xs text-muted-foreground">
                        Plan: {client.plan ? (Array.isArray(client.plan) ? `$${client.plan[0]?.price || 0}` : `$${(client.plan as any).price || 0}`) : 'Sin plan'}
                      </p>
                    </div>
                    <Badge variant="destructive">Pendiente</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Todos los clientes han pagado este mes 🎉</p>
            )}
          </CardContent>
        </Card>

        {/* Tickets abiertos */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <Ticket className="h-5 w-5 text-red-600" />
              Tickets Abiertos Recientes
            </CardTitle>
            <Button variant="outline" size="sm" disabled>
              <Eye className="mr-1 h-4 w-4" />
              Ver todos
            </Button>
          </CardHeader>
          <CardContent>
            {openTickets && openTickets.length > 0 ? (
              <ul className="space-y-2">
                {openTickets.map(ticket => (
                  <li key={ticket.id} className="flex items-center justify-between border-b pb-2 text-sm">
                    <div>
                      <p className="font-medium">{ticket.title}</p>
                      <p className="text-xs text-muted-foreground">
                        Cliente: {(ticket.client as any)?.full_name || '—'}
                      </p>
                    </div>
                    <Badge variant="outline">Abierto</Badge>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No hay tickets abiertos</p>
            )}
            <Button
              variant="link"
              size="sm"
              className="mt-2 p-0"
              disabled
            >
              Ir a Servicio Técnico (próximamente)
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}