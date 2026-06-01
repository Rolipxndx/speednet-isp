import { useState, useCallback, useEffect, startTransition } from 'react'; // <--- IMPORTAR startTransition
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useSearchParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { useForm, Controller } from 'react-hook-form'; // <--- IMPORTAR Controller
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import {
  Plus,
  Pencil,
  Trash2,
  Loader2,
  Search,
  Filter,
  Download,
  Eye,
  Upload,
  Calendar as CalendarIcon,
  X,
  Printer,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDropzone } from 'react-dropzone';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import jsPDF from 'jspdf';
import toast from 'react-hot-toast';

// ---------- Tipos ----------
const paymentSchema = z.object({
  client_id: z.string().uuid('Cliente requerido'),
  amount: z.number().positive('El monto debe ser positivo'),
  payment_date: z.date(),
  billing_month: z.string().min(1, 'Mes facturado requerido'),
  payment_method: z.enum(['efectivo', 'transferencia', 'tarjeta', 'otro']),
  notes: z.string().optional().nullable(),
});

type PaymentFormData = z.infer<typeof paymentSchema>;

type Payment = {
  id: string;
  client_id: string;
  amount: number;
  payment_date: string;
  billing_month: string;
  payment_method: 'efectivo' | 'transferencia' | 'tarjeta' | 'otro';
  evidence_url: string | null;
  receipt_url: string | null;
  notes: string | null;
  created_at: string;
  client?: {
    full_name: string;
    id_number: string;
    plan?: { price: number } | null;
  } | null;
};

type ClientOption = {
  id: string;
  full_name: string;
  id_number: string;
  plan_price: number | null;
};

// Generar meses facturación
const generateMonthOptions = () => {
  const options = [];
  const now = new Date();
  for (let i = -12; i < 12; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() + i, 1);
    const value = format(date, 'yyyy-MM');
    const label = format(date, 'MMMM yyyy', { locale: es });
    options.push({ value, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
};

const monthOptions = generateMonthOptions();

// ---------- Componente Principal ----------
export default function Payments() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const preselectedClientId = searchParams.get('client');

  const [openDialog, setOpenDialog] = useState(false);
  const [editingPayment, setEditingPayment] = useState<Payment | null>(null);
  const [paymentToDelete, setPaymentToDelete] = useState<Payment | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const debouncedSearch = useDebounce(searchTerm, 300);
  const [clientFilter, setClientFilter] = useState<string>('all');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [dateRange, setDateRange] = useState<{ from: Date | undefined; to: Date | undefined } | undefined>(undefined);
  const [page, setPage] = useState(0);
  const pageSize = 10;
  const [evidenceFile, setEvidenceFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [generateReceipt, setGenerateReceipt] = useState(false);

  const isAdminOrCobrador = profile?.role === 'admin' || profile?.role === 'cobrador';
  const canEdit = isAdminOrCobrador;
  const canDelete = profile?.role === 'admin';

  // Obtener clientes
  const { data: clients } = useQuery({
    queryKey: ['clients-select'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('clients')
        .select('id, full_name, id_number, plan:plans!plan_id(price)')
        .order('full_name');
      if (error) throw error;
      
      return data.map((c: any) => ({
        id: c.id,
        full_name: c.full_name,
        id_number: c.id_number,
        plan_price: c.plan?.price || null,
      })) as ClientOption[];
    },
  });

  // Obtener pagos
  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ['payments', debouncedSearch, clientFilter, methodFilter, dateRange, page],
    queryFn: async () => {
      let query = supabase
        .from('payments')
        .select('*, client:clients(full_name, id_number, plan:plans(price))', { count: 'exact' })
        .order('payment_date', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (debouncedSearch) {
        query = query.or(`full_name.ilike.%${debouncedSearch}%,id_number.ilike.%${debouncedSearch}%`, {
          foreignTable: 'clients'
        });
      }
      if (clientFilter !== 'all') {
        query = query.eq('client_id', clientFilter);
      }
      if (methodFilter !== 'all') {
        query = query.eq('payment_method', methodFilter);
      }
      if (dateRange?.from) {
        query = query.gte('payment_date', format(dateRange.from, 'yyyy-MM-dd'));
      }
      if (dateRange?.to) {
        query = query.lte('payment_date', format(dateRange.to, 'yyyy-MM-dd'));
      }

      const { data, error, count } = await query;
      if (error) throw error;
      return { data: data as Payment[], count: count || 0 };
    },
  });

  const payments = paymentsData?.data || [];
  const totalCount = paymentsData?.count || 0;

  // Formulario - Extraemos 'control' para usar Controller
  const form = useForm<PaymentFormData>({
    resolver: zodResolver(paymentSchema),
    defaultValues: {
      client_id: '',
      amount: 0,
      payment_date: new Date(),
      billing_month: format(new Date(), 'yyyy-MM'),
      payment_method: 'efectivo',
      notes: '',
    },
  });

  // Observa el cliente seleccionado para autocompletar el monto
  // FIX: Usamos startTransition para priorizar el cierre del Select sobre la actualización del monto
  const selectedClientId = form.watch('client_id');

  useEffect(() => {
    if (!editingPayment && selectedClientId && clients) {
      const client = clients.find(c => c.id === selectedClientId);
      const currentAmount = form.getValues('amount');
      
      if (client?.plan_price && client.plan_price > 0 && (currentAmount === 0 || currentAmount === null)) {
        // IMPORTANTE: Envolver en startTransition evita el crash removeChild
        startTransition(() => {
          form.setValue('amount', client.plan_price);
        });
      }
      form.trigger('client_id').catch(console.warn);
    }
  }, [selectedClientId, clients, editingPayment, form]);

  // Dropzone
  const onDrop = useCallback((acceptedFiles: File[]) => {
    setEvidenceFile(acceptedFiles[0]);
  }, []);
  
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/*': ['.jpg', '.jpeg', '.png'], 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
  });

  const uploadEvidence = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const { error } = await supabase.storage
      .from('payment_evidences')
      .upload(fileName, file);
    if (error) throw error;
    return fileName;
  };

  // PDF
  const generateReceiptPDF = async (paymentId: string, paymentData: PaymentFormData) => {
    try {
      const { data: company } = await supabase.from('company_settings').select('*').single();
      const { data: client } = await supabase.from('clients').select('*').eq('id', paymentData.client_id).single();

      if (!client || !company) throw new Error('Datos faltantes');

      const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: [80, 150] });
      const pageWidth = doc.internal.pageSize.getWidth();

      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(company.name || 'SpeedNet', pageWidth / 2, 10, { align: 'center' });
      doc.setFontSize(7);
      doc.setFont('helvetica', 'normal');
      doc.text(company.address || '', pageWidth / 2, 15, { align: 'center' });
      doc.line(5, 20, pageWidth - 5, 20);

      doc.text(`Cliente: ${client.full_name}`, 5, 30);
      doc.text(`Monto: $${paymentData.amount.toFixed(2)}`, 5, 35);
      doc.text(`Fecha: ${format(new Date(paymentData.payment_date), 'dd/MM/yyyy')}`, 5, 40);

      const pdfBlob = doc.output('blob');
      const fileName = `receipt_${paymentId}.pdf`;

      const { error: uploadError } = await supabase.storage
        .from('receipts')
        .upload(fileName, pdfBlob, { contentType: 'application/pdf', upsert: true });
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage.from('receipts').getPublicUrl(fileName);
      const publicUrl = publicUrlData.publicUrl;

      await supabase.from('payments').update({ receipt_url: publicUrl }).eq('id', paymentId);
      
      toast.success('Recibo generado');
      window.open(publicUrl, '_blank');
    } catch (error) {
      toast.error('Error generando recibo');
    }
  };

  // Mutaciones
  const mutation = useMutation({
    mutationFn: async (data: PaymentFormData) => {
      let evidenceUrl = editingPayment?.evidence_url || null;

      if (evidenceFile) {
        setUploading(true);
        try {
          evidenceUrl = await uploadEvidence(evidenceFile);
        } catch (e) {
          toast.error('Error subiendo comprobante');
          throw e;
        } finally {
          setUploading(false);
        }
      }

      let result;
      if (editingPayment) {
        const { error } = await supabase.from('payments').update({
          client_id: data.client_id,
          amount: data.amount,
          payment_date: format(data.payment_date, 'yyyy-MM-dd'),
          billing_month: data.billing_month,
          payment_method: data.payment_method,
          notes: data.notes,
          evidence_url: evidenceUrl,
        }).eq('id', editingPayment.id);
        if (error) throw error;
        result = editingPayment;
      } else {
        const { data: newId, error } = await supabase.rpc('insert_payment', {
          p_client_id: data.client_id,
          p_amount: data.amount,
          p_payment_date: format(data.payment_date, 'yyyy-MM-dd'),
          p_billing_month: data.billing_month,
          p_payment_method: data.payment_method,
          p_notes: data.notes,
          p_evidence_url: evidenceUrl,
          p_created_by: profile?.id,
        });
        if (error) throw error;
        result = { id: newId };
      }

      if (generateReceipt && result?.id) {
        await generateReceiptPDF(result.id, data);
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setOpenDialog(false);
      setEditingPayment(null);
      setEvidenceFile(null);
      setGenerateReceipt(false);
      form.reset();
      toast.success('Guardado con éxito');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('payments').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['payments'] });
      setPaymentToDelete(null);
      toast.success('Eliminado');
    },
  });

  const onSubmit = (data: PaymentFormData) => mutation.mutate(data);

  const handleEdit = (payment: Payment) => {
    setEditingPayment(payment);
    form.reset({
      client_id: payment.client_id,
      amount: payment.amount,
      payment_date: new Date(payment.payment_date),
      billing_month: payment.billing_month,
      payment_method: payment.payment_method,
      notes: payment.notes || '',
    });
    setEvidenceFile(null);
    setOpenDialog(true);
  };

  const handleAddNew = () => {
    setEditingPayment(null);
    form.reset({
      client_id: '',
      amount: 0,
      payment_date: new Date(),
      billing_month: format(new Date(), 'yyyy-MM'),
      payment_method: 'efectivo',
      notes: '',
    });
    setEvidenceFile(null);
    setGenerateReceipt(false);
    setOpenDialog(true);
  };

  const getMethodBadge = (method: string) => {
    const map: Record<string, string> = { efectivo: 'Efectivo', transferencia: 'Transferencia', tarjeta: 'Tarjeta', otro: 'Otro' };
    return map[method] || method;
  };

  const getEvidenceUrl = (path: string | null) => {
    if (!path) return null;
    const { data } = supabase.storage.from('payment_evidences').getPublicUrl(path);
    return data.publicUrl;
  };

  useEffect(() => {
    if (preselectedClientId && clients) {
      setClientFilter(preselectedClientId);
    }
  }, [preselectedClientId, clients]);

  if (isLoading) return <div className="flex h-[50vh] items-center justify-center"><Loader2 className="animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-tight">Pagos</h1>
          <p className="text-muted-foreground">Gestión de pagos</p>
        </div>
        {canEdit && <Button onClick={handleAddNew}><Plus className="mr-2 h-4 w-4" /> Registrar</Button>}
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap gap-2 items-center justify-between">
             <div className="flex flex-1 gap-2">
                <Input placeholder="Buscar..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="max-w-xs" />
                <Select value={clientFilter} onValueChange={setClientFilter}>
                   <SelectTrigger className="w-[180px]"><Filter className="mr-2 h-4 w-4"/><SelectValue placeholder="Cliente"/></SelectTrigger>
                   <SelectContent><SelectItem value="all">Todos</SelectItem>{clients?.map(c => <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>)}</SelectContent>
                </Select>
             </div>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Cliente</TableHead><TableHead>Monto</TableHead><TableHead>Fecha</TableHead><TableHead>Mes</TableHead><TableHead>Método</TableHead><TableHead>Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {payments.map(p => (
                <TableRow key={p.id}>
                  <TableCell>{p.client?.full_name}</TableCell>
                  <TableCell>${p.amount.toFixed(2)}</TableCell>
                  <TableCell>{format(new Date(p.payment_date), 'dd/MM/yyyy')}</TableCell>
                  <TableCell>{p.billing_month}</TableCell>
                  <TableCell><Badge variant="outline">{getMethodBadge(p.payment_method)}</Badge></TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                        {canEdit && <Button variant="ghost" size="icon" onClick={() => handleEdit(p)}><Pencil className="h-4 w-4"/></Button>}
                        {canDelete && <Button variant="ghost" size="icon" onClick={() => setPaymentToDelete(p)}><Trash2 className="h-4 w-4 text-destructive"/></Button>}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Modal */}
      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]" key={editingPayment ? editingPayment.id : 'create'}>
          <DialogHeader>
            <DialogTitle>{editingPayment ? 'Editar' : 'Registrar Pago'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            
            {/* FIX CRÍTICO: Usamos Controller para manejar el Select de forma robusta */}
            <div className="space-y-2">
              <Label>Cliente *</Label>
              <Controller
                name="client_id"
                control={form.control}
                render={({ field }) => (
                  <Select onValueChange={field.onChange} value={field.value}>
                    <SelectTrigger>
                      <SelectValue placeholder="Seleccionar cliente" />
                    </SelectTrigger>
                    <SelectContent position="popper">
                      {clients?.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.full_name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                )}
              />
              {form.formState.errors.client_id && <p className="text-sm text-destructive">{form.formState.errors.client_id.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                    <Label>Monto ($)</Label>
                    <Input type="number" step="0.01" {...form.register('amount', { valueAsNumber: true })} />
                </div>
                <div className="space-y-2">
                    <Label>Fecha</Label>
                    <Popover>
                        <PopoverTrigger asChild>
                            <Button variant="outline" className="w-full justify-start text-left font-normal">
                                <CalendarIcon className="mr-2 h-4 w-4" />
                                {form.watch('payment_date') ? format(form.watch('payment_date'), 'PPP', { locale: es }) : 'Seleccionar'}
                            </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={form.watch('payment_date')} onSelect={(d) => d && form.setValue('payment_date', d)} />
                        </PopoverContent>
                    </Popover>
                </div>
            </div>

            <div className="space-y-2">
                <Label>Mes Facturado</Label>
                <Controller
                    name="billing_month"
                    control={form.control}
                    render={({ field }) => (
                        <Select onValueChange={field.onChange} value={field.value}>
                            <SelectTrigger><SelectValue placeholder="Mes" /></SelectTrigger>
                            <SelectContent>
                                {monthOptions.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
                            </SelectContent>
                        </Select>
                    )}
                />
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>Cancelar</Button>
              <Button type="submit" disabled={mutation.isPending || uploading}>
                {mutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Guardar
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!paymentToDelete} onOpenChange={() => setPaymentToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar pago?</AlertDialogTitle>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => paymentToDelete && deleteMutation.mutate(paymentToDelete.id)}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}