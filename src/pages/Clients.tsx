import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/lib/supabaseClient';
import { useAuth } from '@/hooks/useAuth';
import { useDebounce } from '@/hooks/useDebounce';
import { useNavigate } from 'react-router-dom';
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
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
import { useForm } from 'react-hook-form';
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
  Power,
  PowerOff,
  CreditCard,
  Ticket,
  FileText,
  Upload,
} from 'lucide-react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { useDropzone } from 'react-dropzone';

// Esquema de validación
const clientSchema = z.object({
  full_name: z.string().min(1, 'Nombre requerido'),
  id_number: z.string().min(1, 'Cédula/ID requerido'),
  address: z.string().min(1, 'Dirección requerida'),
  phone: z.string().min(1, 'Teléfono requerido'),
  email: z.string().email('Correo inválido').optional().nullable().or(z.literal('')),
  plan_id: z.string().uuid('Plan inválido').optional().nullable().or(z.literal('none')),
  status: z.enum(['activo', 'suspendido', 'cancelado']).default('activo'),
  internal_notes: z.string().optional().nullable(),
  installation_date: z.string().optional().nullable().or(z.literal('')),
});

type ClientFormData = z.infer<typeof clientSchema>;

type Client = {
  id: string;
  full_name: string;
  id_number: string;
  address: string;
  phone: string;
  email: string | null;
  contract_url: string | null;
  status: 'activo' | 'suspendido' | 'cancelado';
  plan_id: string | null;
  internal_notes: string | null;
  installation_date: string | null;
  created_at: string;
  plan?: { name: string; price: number }; // ✅ CORREGIDO: objeto, no array
};

type Plan = {
  id: string;
  name: string;
  price: number;
};

export default function Clients() {
  const { profile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const [openDialog, setOpenDialog] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientToDelete, setClientToDelete] = useState<Client | null>(null);
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [suspendOpen, setSuspendOpen] = useState(false);
  const [suspendReason, setSuspendReason] = useState('');

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [page, setPage] = useState(0);
  const pageSize = 10;

  const [contractFile, setContractFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  const isAdminOrTech = profile?.role === 'admin' || profile?.role === 'tecnico';
  const debouncedSearch = useDebounce(searchTerm, 500);

  const { data: plans } = useQuery({
    queryKey: ['plans-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('plans')
        .select('id, name, price')
        .eq('is_active', true)
        .order('price', { ascending: true });
      if (error) throw error;
      return data as Plan[];
    },
  });

  // Consulta de clientes con la relación corregida (objeto)
  const { data: clientsData, isLoading } = useQuery({
    queryKey: ['clients', debouncedSearch, statusFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('clients')
        .select('*, plan:plans!plan_id(name, price)', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (debouncedSearch) {
        query = query.or(
          `full_name.ilike.%${debouncedSearch}%,id_number.ilike.%${debouncedSearch}%,phone.ilike.%${debouncedSearch}%`
        );
      }
      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      // Aseguramos que data sea del tipo Client (plan será objeto)
      return { data: data as Client[], count: count || 0 };
    },
  });

  const clients = clientsData?.data || [];
  const totalCount = clientsData?.count || 0;

  const form = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema),
    defaultValues: {
      full_name: '',
      id_number: '',
      address: '',
      phone: '',
      email: '',
      plan_id: 'none',
      status: 'activo',
      internal_notes: '',
      installation_date: '',
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    setContractFile(acceptedFiles[0]);
  }, []);
  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'application/pdf': ['.pdf'] },
    maxFiles: 1,
    maxSize: 5 * 1024 * 1024,
  });

  const uploadContract = async (file: File): Promise<string | null> => {
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}-${Math.random().toString(36).substring(2)}.${fileExt}`;
    const { error } = await supabase.storage
      .from('contracts')
      .upload(fileName, file);
    if (error) throw error;
    const { data } = supabase.storage.from('contracts').getPublicUrl(fileName);
    return data.publicUrl;
  };

  const mutation = useMutation({
    mutationFn: async (data: ClientFormData) => {
      let contractUrl = editingClient?.contract_url || null;
      if (contractFile) {
        setUploading(true);
        try {
          contractUrl = await uploadContract(contractFile);
        } finally {
          setUploading(false);
        }
      }

      const clientData = {
        full_name: data.full_name,
        id_number: data.id_number,
        address: data.address,
        phone: data.phone,
        email: data.email === '' ? null : data.email,
        plan_id: data.plan_id === 'none' || !data.plan_id ? null : data.plan_id,
        status: data.status,
        internal_notes: data.internal_notes === '' ? null : data.internal_notes,
        installation_date: data.installation_date === '' ? null : data.installation_date,
        contract_url: contractUrl,
      };

      if (editingClient) {
        const { error } = await supabase
          .from('clients')
          .update(clientData)
          .eq('id', editingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from('clients').insert([clientData]);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setOpenDialog(false);
      setEditingClient(null);
      setContractFile(null);
      form.reset();
    },
    onError: (error: any) => {
      console.error('Error al guardar cliente:', error);
      alert('Error al guardar: ' + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('clients').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      setClientToDelete(null);
    },
    onError: (error: any) => {
      alert('Error al eliminar: ' + error.message);
    },
  });

  const toggleStatusMutation = useMutation({
    mutationFn: async ({ id, status, reason }: { id: string; status: 'activo' | 'suspendido'; reason?: string }) => {
      const { error: updateError } = await supabase
        .from('clients')
        .update({ status })
        .eq('id', id);
      if (updateError) throw updateError;

      const action = status === 'suspendido' ? 'corte' : 'reconexion';
      const { error: cutError } = await supabase.from('service_cuts').insert({
        client_id: id,
        action,
        reason: reason || null,
        performed_by: profile?.id,
      });
      if (cutError) throw cutError;
    },
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ['clients'] });
      if (selectedClient && selectedClient.id === variables.id) {
        setSelectedClient(prev => prev ? { ...prev, status: variables.status } : null);
      }
      setSuspendOpen(false);
      setSuspendReason('');
    },
    onError: (error: any) => {
      alert('Error al cambiar estado: ' + error.message);
    },
  });

  const onSubmit = (data: ClientFormData) => mutation.mutate(data);

  const handleEdit = (client: Client) => {
    setEditingClient(client);
    form.reset({
      full_name: client.full_name,
      id_number: client.id_number,
      address: client.address,
      phone: client.phone,
      email: client.email || '',
      plan_id: client.plan_id || 'none',
      status: client.status,
      internal_notes: client.internal_notes || '',
      installation_date: client.installation_date || '',
    });
    setContractFile(null);
    setOpenDialog(true);
  };

  const handleAddNew = () => {
    setEditingClient(null);
    form.reset({
      full_name: '',
      id_number: '',
      address: '',
      phone: '',
      email: '',
      plan_id: 'none',
      status: 'activo',
      internal_notes: '',
      installation_date: '',
    });
    setContractFile(null);
    setOpenDialog(true);
  };

  const handleSuspend = (client: Client) => {
    setSelectedClient(client);
    setSuspendOpen(true);
  };

  const handleReconnect = (client: Client) => {
    toggleStatusMutation.mutate({ id: client.id, status: 'activo' });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'activo': return <Badge variant="default">Activo</Badge>;
      case 'suspendido': return <Badge variant="secondary">Suspendido</Badge>;
      case 'cancelado': return <Badge variant="destructive">Cancelado</Badge>;
      default: return null;
    }
  };

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-light tracking-tight">Clientes</h1>
          <p className="text-muted-foreground">
            Administra tu cartera de clientes en SpeedNet
          </p>
        </div>
        <Button onClick={handleAddNew}>
          <Plus className="mr-2 h-4 w-4" />
          Nuevo Cliente
        </Button>
      </div>

      <Card className="border-none shadow-none">
        <CardHeader className="pb-4 px-0">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex flex-1 items-center gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Buscar por nombre, cédula o teléfono..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-8"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[140px]">
                  <Filter className="mr-2 h-4 w-4" />
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="activo">Activos</SelectItem>
                  <SelectItem value="suspendido">Suspendidos</SelectItem>
                  <SelectItem value="cancelado">Cancelados</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" size="icon" onClick={() => navigate('/export')}>
              <Download className="h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-0">
          <Table>
            <TableHeader>
              <TableRow className="border-none">
                <TableHead>Cliente</TableHead>
                <TableHead>Cédula/ID</TableHead>
                <TableHead>Teléfono</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Estado</TableHead>
                <TableHead className="text-right">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {clients.map((client) => (
                <TableRow key={client.id} className="border-none hover:bg-accent/50">
                  <TableCell className="font-medium">{client.full_name}</TableCell>
                  <TableCell>{client.id_number}</TableCell>
                  <TableCell>{client.phone}</TableCell>
                  <TableCell>
                    {/* ✅ CORREGIDO: plan es objeto, no array */}
                    {client.plan?.name || 'Sin plan'} 
                    {client.plan && <span className="text-xs text-muted-foreground ml-1">${client.plan.price}</span>}
                  </TableCell>
                  <TableCell>{getStatusBadge(client.status)}</TableCell>
                  <TableCell className="text-right">
                    <div className="flex justify-end gap-1">
                      <Button variant="ghost" size="icon" onClick={() => { setSelectedClient(client); setDetailOpen(true); }}>
                        <Eye className="h-4 w-4" />
                      </Button>
                      {isAdminOrTech && (
                        <>
                          <Button variant="ghost" size="icon" onClick={() => handleEdit(client)}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          {client.status === 'activo' && (
                            <Button variant="ghost" size="icon" onClick={() => handleSuspend(client)}>
                              <PowerOff className="h-4 w-4 text-yellow-600" />
                            </Button>
                          )}
                          {client.status === 'suspendido' && (
                            <Button variant="ghost" size="icon" onClick={() => handleReconnect(client)}>
                              <Power className="h-4 w-4 text-green-600" />
                            </Button>
                          )}
                        </>
                      )}
                      {profile?.role === 'admin' && (
                        <Button variant="ghost" size="icon" onClick={() => setClientToDelete(client)}>
                          <Trash2 className="h-4 w-4 text-destructive" />
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {clients.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground border-none py-8">
                    No se encontraron clientes
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
          {totalCount > pageSize && (
            <div className="flex items-center justify-end space-x-2 py-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Anterior
              </Button>
              <span className="text-sm text-muted-foreground">
                Página {page + 1} de {Math.ceil(totalCount / pageSize)}
              </span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((p) => p + 1)}
                disabled={(page + 1) * pageSize >= totalCount}
              >
                Siguiente
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={openDialog} onOpenChange={setOpenDialog}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle>{editingClient ? 'Editar Cliente' : 'Nuevo Cliente'}</DialogTitle>
            <DialogDescription>Completa los datos del cliente</DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full_name">Nombre completo *</Label>
              <Input id="full_name" {...form.register('full_name')} />
              {form.formState.errors.full_name && (
                <p className="text-sm text-destructive">{form.formState.errors.full_name.message}</p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="id_number">Cédula / ID *</Label>
                <Input id="id_number" {...form.register('id_number')} />
                {form.formState.errors.id_number && (
                  <p className="text-sm text-destructive">{form.formState.errors.id_number.message}</p>
                )}
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">Teléfono *</Label>
                <Input id="phone" {...form.register('phone')} />
                {form.formState.errors.phone && (
                  <p className="text-sm text-destructive">{form.formState.errors.phone.message}</p>
                )}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Dirección *</Label>
              <Input id="address" {...form.register('address')} />
              {form.formState.errors.address && (
                <p className="text-sm text-destructive">{form.formState.errors.address.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Correo electrónico</Label>
              <Input id="email" type="email" {...form.register('email')} />
              {form.formState.errors.email && (
                <p className="text-sm text-destructive">{form.formState.errors.email.message}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="plan_id">Plan contratado</Label>
              <Select
                value={form.watch('plan_id') || 'none'}
                onValueChange={(value) => form.setValue('plan_id', value)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Sin plan</SelectItem>
                  {plans?.map((plan) => (
                    <SelectItem key={plan.id} value={plan.id}>
                      {plan.name} - ${plan.price}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {editingClient && (
              <div className="space-y-2">
                <Label htmlFor="status">Estado del servicio</Label>
                <Select
                  value={form.watch('status')}
                  onValueChange={(value: 'activo' | 'suspendido' | 'cancelado') => form.setValue('status', value)}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="activo">Activo</SelectItem>
                    <SelectItem value="suspendido">Suspendido</SelectItem>
                    <SelectItem value="cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="installation_date">Fecha de instalación</Label>
              <Input id="installation_date" type="date" {...form.register('installation_date')} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="internal_notes">Notas internas</Label>
              <Textarea id="internal_notes" {...form.register('internal_notes')} placeholder="Información adicional..." />
            </div>
            <div className="space-y-2">
              <Label>Contrato (PDF)</Label>
              <div
                {...getRootProps()}
                className="cursor-pointer rounded-lg border-2 border-dashed border-muted-foreground/25 p-4 text-center transition-colors hover:border-primary/50"
              >
                <input {...getInputProps()} />
                <Upload className="mx-auto h-6 w-6 text-muted-foreground" />
                <p className="mt-2 text-sm text-muted-foreground">
                  {isDragActive
                    ? 'Suelta el archivo aquí'
                    : contractFile
                    ? `Archivo: ${contractFile.name}`
                    : editingClient?.contract_url
                    ? 'Contrato actual. Haz clic o arrastra para cambiar.'
                    : 'Arrastra un PDF o haz clic para seleccionar'}
                </p>
                {editingClient?.contract_url && !contractFile && (
                  <Button
                    variant="link"
                    type="button"
                    onClick={(e) => { e.stopPropagation(); window.open(editingClient.contract_url!, '_blank'); }}
                  >
                    Ver contrato actual
                  </Button>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpenDialog(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={mutation.isPending || uploading}>
                {(mutation.isPending || uploading) && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {editingClient ? 'Guardar cambios' : 'Crear cliente'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle className="text-2xl font-light tracking-tight">{selectedClient?.full_name}</DialogTitle>
            <DialogDescription>
              {selectedClient?.id_number} • {selectedClient?.phone}
            </DialogDescription>
          </DialogHeader>
          
          <Tabs defaultValue="info" className="mt-4">
            <TabsList className="grid w-full grid-cols-5 bg-muted/50 p-1 rounded-lg">
              <TabsTrigger value="info">Info</TabsTrigger>
              <TabsTrigger value="payments">Pagos</TabsTrigger>
              <TabsTrigger value="tickets">Tickets</TabsTrigger>
              <TabsTrigger value="cuts">Cortes</TabsTrigger>
              <TabsTrigger value="inventory">Equipos</TabsTrigger>
            </TabsList>
            
            <TabsContent value="info" className="space-y-5 py-4">
              <div className="space-y-2">
                <h4 className="font-medium text-sm text-foreground/80">Datos del cliente</h4>
                <div className="grid grid-cols-2 gap-y-3 gap-x-4 text-sm bg-accent/20 p-4 rounded-lg">
                  <span className="text-muted-foreground">Dirección:</span>
                  <span className="text-right font-medium">{selectedClient?.address}</span>
                  <span className="text-muted-foreground">Correo:</span>
                  <span className="text-right font-medium">{selectedClient?.email || '—'}</span>
                  <span className="text-muted-foreground">Plan:</span>
                  <span className="text-right font-medium text-primary">
                    {selectedClient?.plan?.name || 'Sin plan'} 
                    {selectedClient?.plan && `($${selectedClient.plan.price})`}
                  </span>
                  <span className="text-muted-foreground">Estado:</span>
                  <div className="text-right">{getStatusBadge(selectedClient?.status || 'activo')}</div>
                  <span className="text-muted-foreground">Instalación:</span>
                  <span className="text-right font-medium">
                    {selectedClient?.installation_date ? format(new Date(selectedClient.installation_date + 'T00:00:00'), 'PPP', { locale: es }) : '—'}
                  </span>
                </div>
              </div>
              
              {selectedClient?.contract_url && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-foreground/80">Contrato</h4>
                  <Button variant="outline" size="sm" className="w-full sm:w-auto" onClick={() => window.open(selectedClient.contract_url!, '_blank')}>
                    <FileText className="mr-2 h-4 w-4" />
                    Ver contrato (PDF)
                  </Button>
                </div>
              )}
              
              {isAdminOrTech && selectedClient?.internal_notes && (
                <div className="space-y-2">
                  <h4 className="font-medium text-sm text-foreground/80">Notas internas</h4>
                  <p className="text-sm bg-yellow-500/5 text-yellow-600 dark:text-yellow-400 p-3 rounded-lg border border-yellow-500/10">
                    {selectedClient.internal_notes}
                  </p>
                </div>
              )}
              
              <div className="flex flex-wrap gap-2 pt-2 border-t border-accent/30">
                {selectedClient?.status === 'activo' && (
                  <Button size="sm" variant="secondary" onClick={() => handleSuspend(selectedClient)}>
                    <PowerOff className="mr-2 h-4 w-4" />
                    Suspender Servicio
                  </Button>
                )}
                {selectedClient?.status === 'suspendido' && (
                  <Button size="sm" variant="secondary" className="text-green-600 hover:text-green-700 bg-green-500/10" onClick={() => handleReconnect(selectedClient)}>
                    <Power className="mr-2 h-4 w-4" />
                    Reconectar Servicio
                  </Button>
                )}
                <Button size="sm" variant="outline" onClick={() => setHistoryOpen(true)}>
                  <CreditCard className="mr-2 h-4 w-4" />
                  Historial de pagos
                </Button>
                <Button size="sm" variant="outline" onClick={() => { navigate(`/tickets?clientId=${selectedClient?.id}`); setDetailOpen(false); }}>
                  <Ticket className="mr-2 h-4 w-4" />
                  Crear ticket
                </Button>
              </div>
            </TabsContent>
            
            <TabsContent value="payments" className="py-4">
              <ClientPayments clientId={selectedClient?.id} />
            </TabsContent>
            
            <TabsContent value="tickets" className="py-4">
              <ClientTickets clientId={selectedClient?.id} />
            </TabsContent>
            
            <TabsContent value="cuts" className="py-4">
              <ClientCutsHistory clientId={selectedClient?.id} />
            </TabsContent>
            
            <TabsContent value="inventory" className="py-4">
              <ClientInventory clientId={selectedClient?.id} />
              <Button
                variant="outline"
                size="sm"
                className="mt-4 w-full"
                onClick={() => {
                  if (selectedClient) {
                    navigate(`/inventory?clientId=${selectedClient.id}`);
                    setDetailOpen(false);
                  }
                }}
              >
                <Plus className="mr-2 h-4 w-4" />
                Ir a inventario para asignar equipo
              </Button>
            </TabsContent>
          </Tabs>
          
          <DialogFooter className="mt-4 pt-4 border-t border-accent/30">
            <Button variant="outline" size="sm" onClick={() => setDetailOpen(false)}>
              Cerrar Expediente
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-[700px]">
          <DialogHeader>
            <DialogTitle>Historial Completo de Pagos</DialogTitle>
            <DialogDescription>
              {selectedClient?.full_name} — {selectedClient?.id_number}
            </DialogDescription>
          </DialogHeader>
          <ClientPaymentsTable clientId={selectedClient?.id} />
          <DialogFooter>
            <Button variant="outline" onClick={() => setHistoryOpen(false)}>
              Regresar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={suspendOpen} onOpenChange={setSuspendOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Suspender servicio</AlertDialogTitle>
            <AlertDialogDescription>
              ¿Estás seguro de suspender el servicio de {selectedClient?.full_name}? Ingresa el motivo:
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Motivo de la suspensión..."
            value={suspendReason}
            onChange={(e) => setSuspendReason(e.target.value)}
            className="my-4"
          />
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setSuspendOpen(false)}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (selectedClient && suspendReason.trim()) {
                  toggleStatusMutation.mutate({ id: selectedClient.id, status: 'suspendido', reason: suspendReason });
                }
              }}
              disabled={!suspendReason.trim() || toggleStatusMutation.isPending}
            >
              {toggleStatusMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Confirmar Suspensión
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!clientToDelete} onOpenChange={() => setClientToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar cliente?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta acción no se puede deshacer. Se eliminará a {clientToDelete?.full_name} permanentemente.
              Si tiene pagos, tickets o equipos asociados, la eliminación fallará por integridad.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => clientToDelete && deleteMutation.mutate(clientToDelete.id)}
              className="bg-destructive hover:bg-destructive/90"
            >
              {deleteMutation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Eliminar Permanentemente
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// Componentes auxiliares (sin cambios relevantes, solo para completitud)
function ClientPayments({ clientId }: { clientId?: string }) {
  const { data: payments, isLoading } = useQuery({
    queryKey: ['client-payments-recent', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('payments')
        .select('*')
        .eq('client_id', clientId)
        .order('payment_date', { ascending: false })
        .limit(5);
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  if (!clientId) return null;
  if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (!payments?.length) return <p className="text-sm text-muted-foreground text-center py-4">No hay pagos registrados</p>;

  return (
    <div className="space-y-2">
      {payments.map((p) => (
        <div key={p.id} className="flex items-center justify-between border-b border-accent/20 pb-2 text-sm last:border-none">
          <div>
            <p className="font-medium">${Number(p.amount).toFixed(2)}</p>
            <p className="text-xs text-muted-foreground">
              {p.payment_date ? format(new Date(p.payment_date + 'T00:00:00'), 'dd/MM/yyyy') : ''} — {p.billing_month}
            </p>
          </div>
          <Badge variant="outline">{p.payment_method}</Badge>
        </div>
      ))}
    </div>
  );
}

function ClientPaymentsTable({ clientId }: { clientId?: string }) {
  const [page, setPage] = useState(0);
  const pageSize = 5;

  const { data: paymentsData, isLoading } = useQuery({
    queryKey: ['client-payments-full', clientId, page],
    queryFn: async () => {
      if (!clientId) return { data: [], count: 0 };
      const from = page * pageSize;
      const to = from + pageSize - 1;
      const { data, error, count } = await supabase
        .from('payments')
        .select('*', { count: 'exact' })
        .eq('client_id', clientId)
        .order('payment_date', { ascending: false })
        .range(from, to);
      if (error) throw error;
      return { data: data || [], count: count || 0 };
    },
    enabled: !!clientId,
  });

  if (!clientId) return null;
  if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;

  const payments = paymentsData?.data || [];
  const totalCount = paymentsData?.count || 0;

  if (payments.length === 0) {
    return <p className="text-sm text-muted-foreground text-center py-4">No hay pagos registrados</p>;
  }

  return (
    <div className="space-y-4">
      <Table>
        <TableHeader>
          <TableRow className="border-none">
            <TableHead>Fecha</TableHead>
            <TableHead>Mes facturado</TableHead>
            <TableHead>Monto</TableHead>
            <TableHead>Método</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id} className="border-none hover:bg-accent/30">
              <TableCell>{p.payment_date ? format(new Date(p.payment_date + 'T00:00:00'), 'dd/MM/yyyy') : '—'}</TableCell>
              <TableCell>{p.billing_month}</TableCell>
              <TableCell className="font-medium">${Number(p.amount).toFixed(2)}</TableCell>
              <TableCell><Badge variant="outline">{p.payment_method}</Badge></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {totalCount > pageSize && (
        <div className="flex items-center justify-end space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(0, p - 1))}
            disabled={page === 0}
          >
            Anterior
          </Button>
          <span className="text-sm text-muted-foreground">
            Página {page + 1} de {Math.ceil(totalCount / pageSize)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => p + 1)}
            disabled={(page + 1) * pageSize >= totalCount}
          >
            Siguiente
          </Button>
        </div>
      )}
    </div>
  );
}

function ClientTickets({ clientId }: { clientId?: string }) {
  const { data: tickets, isLoading } = useQuery({
    queryKey: ['client-tickets', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('tickets')
        .select('id, title, status, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  if (!clientId) return null;
  if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (!tickets?.length) return <p className="text-sm text-muted-foreground text-center py-4">No hay tickets de soporte registrados</p>;

  return (
    <div className="space-y-2">
      {tickets.map((t) => (
        <div key={t.id} className="flex items-center justify-between border-b border-accent/20 pb-2 text-sm last:border-none">
          <div>
            <p className="font-medium">{t.title}</p>
            <p className="text-xs text-muted-foreground">
              {format(new Date(t.created_at), 'dd/MM/yyyy HH:mm')}
            </p>
          </div>
          <Badge variant={t.status === 'abierto' ? 'destructive' : t.status === 'en_progreso' ? 'secondary' : 'default'}>
            {t.status.replace('_', ' ')}
          </Badge>
        </div>
      ))}
    </div>
  );
}

function ClientCutsHistory({ clientId }: { clientId?: string }) {
  const { data: cuts, isLoading } = useQuery({
    queryKey: ['client-cuts', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('service_cuts')
        .select('id, action, reason, created_at')
        .eq('client_id', clientId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  if (!clientId) return null;
  if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  if (!cuts?.length) return <p className="text-sm text-muted-foreground text-center py-4">Sin historial de suspensiones o reconexiones</p>;

  return (
    <div className="space-y-2">
      {cuts.map((c) => (
        <div key={c.id} className="border-b border-accent/20 pb-2 text-sm last:border-none">
          <div className="flex items-center justify-between">
            <span className="font-medium capitalize text-foreground">
              {c.action === 'corte' ? '🔴 Suspensión de Servicio' : '🟢 Reconexión de Servicio'}
            </span>
            <span className="text-xs text-muted-foreground">
              {format(new Date(c.created_at), 'dd/MM/yyyy HH:mm')}
            </span>
          </div>
          {c.reason && (
            <p className="text-xs text-muted-foreground mt-1 bg-muted/40 p-2 rounded">
              Motivo: {c.reason}
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

function ClientInventory({ clientId }: { clientId?: string }) {
  const { data: equipment, isLoading } = useQuery({
    queryKey: ['client-inventory', clientId],
    queryFn: async () => {
      if (!clientId) return [];
      const { data, error } = await supabase
        .from('inventory')
        .select('id, type, model, serial, status, installation_date')
        .eq('assigned_to', clientId)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return data;
    },
    enabled: !!clientId,
  });

  if (!clientId) return null;
  if (isLoading) return <div className="flex justify-center p-4"><Loader2 className="h-4 w-4 animate-spin" /></div>;
  
  if (!equipment?.length) {
    return (
      <div className="py-6 text-center border-2 border-dashed border-accent/40 rounded-lg">
        <p className="text-sm text-muted-foreground">No hay hardware (ONTs/Antenas/Routers) asignado a este cliente</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {equipment.map((eq) => (
        <div key={eq.id} className="flex items-center justify-between border-b border-accent/20 pb-3 text-sm last:pb-0 last:border-none">
          <div>
            <p className="font-semibold text-primary uppercase text-[10px] tracking-wider">{eq.type}</p>
            <p className="font-medium text-foreground">{eq.model}</p>
            <p className="text-xs text-muted-foreground font-mono">SN: {eq.serial}</p>
            {eq.installation_date && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Instalado: {format(new Date(eq.installation_date + 'T00:00:00'), 'dd/MM/yyyy')}
              </p>
            )}
          </div>
          <Badge 
            variant={
              eq.status === 'instalado' ? 'default' : 
              eq.status === 'dañado' ? 'destructive' : 
              'secondary'
            }
            className="capitalize"
          >
            {eq.status}
          </Badge>
        </div>
      ))}
    </div>
  );
}