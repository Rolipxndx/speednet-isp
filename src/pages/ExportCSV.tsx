import { useState } from 'react';
import { supabase } from '@/lib/supabaseClient';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Loader2, Download, Calendar as CalendarIcon } from 'lucide-react';
import { format, startOfDay, endOfDay, startOfWeek, endOfWeek, startOfMonth, endOfMonth, startOfYear, endOfYear } from 'date-fns';
import Papa from 'papaparse';

const exportTypes = [
  { value: 'clients', label: 'Clientes' },
  { value: 'payments', label: 'Pagos' },
  { value: 'tickets', label: 'Tickets' },
  { value: 'inventory', label: 'Inventario' },
];

const datePresets = [
  { value: 'today', label: 'Hoy' },
  { value: 'week', label: 'Esta semana' },
  { value: 'month', label: 'Este mes' },
  { value: 'year', label: 'Este año' },
  { value: 'custom', label: 'Personalizado' },
];

export default function ExportCSV() {
  const [type, setType] = useState<string>('clients');
  const [preset, setPreset] = useState<string>('month');
  const [range, setRange] = useState<{ from: Date | undefined; to: Date | undefined }>({
    from: undefined,
    to: undefined,
  });
  const [loading, setLoading] = useState(false);

  // Genera cadenas en formato ISO con horas completas para que la base de datos filtre correctamente
  const getDateRange = (): { from: string; to: string } => {
    const today = new Date();
    let fromDate: Date;
    let toDate: Date;

    switch (preset) {
      case 'today':
        fromDate = startOfDay(today);
        toDate = endOfDay(today);
        break;
      case 'week':
        fromDate = startOfWeek(today, { weekStartsOn: 1 }); // Empieza lunes
        toDate = endOfWeek(today, { weekStartsOn: 1 });
        break;
      case 'month':
        fromDate = startOfMonth(today);
        toDate = endOfMonth(today);
        break;
      case 'year':
        fromDate = startOfYear(today);
        toDate = endOfYear(today);
        break;
      case 'custom':
        fromDate = range.from ? startOfDay(range.from) : new Date(2020, 0, 1);
        toDate = range.to ? endOfDay(range.to) : endOfDay(new Date());
        break;
      default:
        fromDate = new Date(2020, 0, 1);
        toDate = new Date();
    }

    return {
      from: fromDate.toISOString(),
      to: toDate.toISOString(),
    };
  };

  const handleExport = async () => {
    setLoading(true);
    try {
      const { from, to } = getDateRange();
      let data: any[] = [];
      let filename = '';

      // Formato corto para los nombres de los archivos descargados (yyyy-MM-dd)
      const fileFrom = format(new Date(from), 'yyyy-MM-dd');
      const fileTo = format(new Date(to), 'yyyy-MM-dd');

      switch (type) {
        case 'clients':
          {
            const { data: clients, error } = await supabase
              .from('clients')
              .select('full_name, id_number, phone, email, status, plan:plans(name), created_at')
              .gte('created_at', from)
              .lte('created_at', to)
              .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            data = (clients || []).map(c => ({
              Nombre: c.full_name,
              'Cédula/ID': c.id_number,
              Teléfono: c.phone,
              Correo: c.email || '',
              Estado: c.status,
              Plan: (c.plan as any)?.name || '',
              'Fecha creación': c.created_at ? format(new Date(c.created_at), 'dd/MM/yyyy HH:mm') : '',
            }));
            filename = `clientes_${fileFrom}_${fileTo}.csv`;
          }
          break;

        case 'payments':
          {
            const { data: payments, error } = await supabase
              .from('payments')
              .select('amount, payment_date, billing_month, payment_method, client:clients(full_name)')
              .gte('payment_date', from)
              .lte('payment_date', to)
              .order('payment_date', { ascending: false });
            
            if (error) throw error;
            
            data = (payments || []).map(p => ({
              Cliente: (p.client as any)?.full_name || '',
              Monto: p.amount,
              'Fecha de pago': p.payment_date ? format(new Date(p.payment_date), 'dd/MM/yyyy') : '',
              'Mes facturado': p.billing_month,
              Método: p.payment_method,
            }));
            filename = `pagos_${fileFrom}_${fileTo}.csv`;
          }
          break;

        case 'tickets':
          {
            const { data: tickets, error } = await supabase
              .from('tickets')
              .select('title, status, created_at, client:clients(full_name)')
              .gte('created_at', from)
              .lte('created_at', to)
              .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            data = (tickets || []).map(t => ({
              Título: t.title,
              Estado: t.status,
              Cliente: (t.client as any)?.full_name || '',
              'Fecha creación': t.created_at ? format(new Date(t.created_at), 'dd/MM/yyyy HH:mm') : '',
            }));
            filename = `tickets_${fileFrom}_${fileTo}.csv`;
          }
          break;

        case 'inventory':
          {
            const { data: inventory, error } = await supabase
              .from('inventory')
              .select('type, model, serial, status, client:clients(full_name), installation_date')
              .order('created_at', { ascending: false });
            
            if (error) throw error;
            
            data = (inventory || []).map(e => ({
              Tipo: e.type,
              Modelo: e.model,
              Serial: e.serial,
              Estado: e.status,
              'Asignado a': (e.client as any)?.full_name || '',
              'Fecha instalación': e.installation_date || '',
            }));
            filename = `inventario_${format(new Date(), 'yyyyMMdd')}.csv`;
          }
          break;
      }

      if (data.length === 0) {
        alert('No se encontraron registros en el rango de fechas seleccionado.');
        return;
      }

      // Aseguramos el BOM (\uFEFF) para que Excel abra los acentos y la Ñ correctamente
      const csv = Papa.unparse(data);
      const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', filename);
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err: any) {
      alert('Error al exportar: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-light tracking-tight">Exportar CSV</h1>
        <p className="text-muted-foreground">
          Filtra los datos que deseas exportar y descarga un archivo compatible con Excel
        </p>
      </div>

      <Card className="max-w-xl">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Download className="h-5 w-5" />
            Opciones de exportación
          </CardTitle>
          <CardDescription>
            Selecciona el tipo de datos y el rango de fechas
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label>Tipo de datos</Label>
            <Select value={type} onValueChange={setType}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {exportTypes.map(t => (
                  <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label>Rango de fechas</Label>
            <Select value={preset} onValueChange={setPreset}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {datePresets.map(d => (
                  <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {preset === 'custom' && (
            <div className="space-y-2">
              <Label>Fechas personalizadas</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-start text-left font-normal">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {range.from && range.to
                      ? `${format(range.from, 'dd/MM/yy')} – ${format(range.to, 'dd/MM/yy')}`
                      : 'Seleccionar rango'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="range"
                    selected={range}
                    onSelect={(r) => setRange({ from: r?.from, to: r?.to })}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <Button onClick={handleExport} disabled={loading} className="w-full">
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            Descargar CSV
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}